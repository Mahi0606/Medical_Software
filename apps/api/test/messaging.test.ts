import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { addDays, saleSchema, todayIST } from '@pharma/shared';
import { schema } from '../src/db/index.js';
import { postSale } from '../src/services/sales.js';
import {
  dispatchOnce, duesList, getMessagingSettings, listOutbox, markMessageSent, messagingStatus, publicMessagingSettings, queueBillMessage, queueMessage, refillsDue, renderBillMessage, renderTemplate,
  runDuesReminders, runRefillReminders, saveMessagingSettings,
} from '../src/services/messaging.js';
import { seedItem, testDb } from './helpers.js';

const sale = (o: Record<string, unknown>) => saleSchema.parse({ clientRef: `ref-${Math.random()}`, ...o });
const settings = (o: Record<string, unknown> = {}) => ({ provider: 'none' as const, phoneNumberId: null, accessToken: null, businessName: null, autoSendBills: false, refillLeadDays: 2, duesReminderTemplate: null, billTemplate: null, refillTemplate: null, ...o });

describe('messaging', () => {
  it('renders templates with placeholders and caps the length', () => {
    expect(renderTemplate('Hi {{customer}}, {{amount}} due. {{upi}}Call {{phone}}.', { customer: 'Asha', amount: '₹120.00', upi: '', phone: '98200' })).toBe('Hi Asha, ₹120.00 due. Call 98200.');
    expect(renderTemplate('{{missing}} ok', {})).toBe('ok');
    expect(renderTemplate('x'.repeat(2000), {}).length).toBeLessThanOrEqual(900);
  });

  it('queues in manual mode, builds a bill message from the sale and supports mark-as-sent', () => {
    const t = testDb();
    const { batchId } = seedItem(t.db, t.owner, { name: 'Dolo 650', generic: 'Paracetamol 650 mg', mrp: 3000, rate: 2000, packs: 10, unitsPerPack: 15, supplierId: t.supplierId });
    const s = postSale(t.db, t.owner, sale({ customerId: t.customerId, lines: [{ batchId, unitMode: 'pack', qty: 2 }], payments: [{ mode: 'cash', amountPaise: 6000 }] }), null);
    const { body } = renderBillMessage(t.db, s.id);
    expect(body).toContain('Test Pharmacy');
    expect(body).toContain(s.invoiceNo!);
    expect(body).toContain('Dolo 650 ×2 strips');
    const m = queueBillMessage(t.db, t.owner, s.id);
    expect(m.status).toBe('manual');
    expect(m.toPhone).toBe('9999999999');
    expect(m.relatedType).toBe('sale');
    const list = listOutbox(t.db, { page: 1, pageSize: 10 });
    expect(list.total).toBe(1);
    expect(list.rows[0]!.customerName).toBe('Cust');
    expect(list.rows[0]!.waLink).toContain('wa.me/919999999999');
    expect(markMessageSent(t.db, m.id).status).toBe('sent');
    expect(messagingStatus(t.db)).toMatchObject({ provider: 'none', configured: false, manual: 0 });
    // A bill without a phone is refused.
    const noPhone = postSale(t.db, t.owner, sale({ lines: [{ batchId, unitMode: 'pack', qty: 1 }], payments: [{ mode: 'cash', amountPaise: 3000 }] }), null);
    expect(() => queueBillMessage(t.db, t.owner, noPhone.id)).toThrow(/phone/i);
  });

  it('keeps the access token when the masked value is sent back and marks queued in cloud mode', async () => {
    const t = testDb();
    saveMessagingSettings(t.db, t.owner, settings({ provider: 'meta_cloud', phoneNumberId: '123', accessToken: 'EAAG-secret-token-9876' }));
    const pub = publicMessagingSettings(t.db);
    expect(pub.accessToken).toBe('••••9876');
    expect(pub.configured).toBe(true);
    saveMessagingSettings(t.db, t.owner, settings({ provider: 'meta_cloud', phoneNumberId: '123', accessToken: pub.accessToken, businessName: 'Shree Medical' }));
    expect(getMessagingSettings(t.db).accessToken).toBe('EAAG-secret-token-9876');
    const m = queueMessage(t.db, t.owner, { toPhone: '9999999999', templateKey: 'custom', body: 'Hello' });
    expect(m.status).toBe('queued');
    // Failing sender: retried, then failed after 3 attempts with the error stored.
    let calls = 0;
    const failing = async () => { calls++; return { ok: false as const, error: 'Invalid OAuth access token' }; };
    for (let i = 0; i < 3; i++) {
      t.db.update(schema.messageOutbox).set({ scheduledFor: null }).where(eq(schema.messageOutbox.id, m.id)).run();
      await dispatchOnce(t.db, failing);
    }
    const after = t.db.select().from(schema.messageOutbox).where(eq(schema.messageOutbox.id, m.id)).get()!;
    expect(calls).toBe(3);
    expect(after).toMatchObject({ status: 'failed', attempts: 3, error: 'Invalid OAuth access token' });
    // Successful sender stores the provider id.
    const ok = queueMessage(t.db, t.owner, { toPhone: '9999999999', templateKey: 'custom', body: 'Hello again' });
    await dispatchOnce(t.db, async () => ({ ok: true as const, providerMessageId: 'wamid.1' }));
    expect(t.db.select().from(schema.messageOutbox).where(eq(schema.messageOutbox.id, ok.id)).get()).toMatchObject({ status: 'sent', providerMessageId: 'wamid.1' });
  });

  it('refill-run picks due bills for consenting customers, skips others, and never sends twice', () => {
    const t = testDb();
    const { batchId } = seedItem(t.db, t.owner, { name: 'Telma 40', generic: 'Telmisartan 40 mg', mrp: 20000, rate: 12000, packs: 20, unitsPerPack: 15, supplierId: t.supplierId });
    const noConsentId = t.db.insert(schema.customer).values({ name: 'Quiet', phone: '8888888888' }).returning({ id: schema.customer.id }).get().id;
    t.db.update(schema.customer).set({ consentMarketing: true }).where(eq(schema.customer.id, t.customerId)).run();
    const today = todayIST();
    const dueSoon = postSale(t.db, t.owner, sale({ customerId: t.customerId, lines: [{ batchId, unitMode: 'pack', qty: 1 }], payments: [{ mode: 'cash', amountPaise: 20000 }] }), null);
    const noConsent = postSale(t.db, t.owner, sale({ customerId: noConsentId, lines: [{ batchId, unitMode: 'pack', qty: 1 }], payments: [{ mode: 'cash', amountPaise: 20000 }] }), null);
    const farAway = postSale(t.db, t.owner, sale({ customerId: t.customerId, lines: [{ batchId, unitMode: 'pack', qty: 1 }], payments: [{ mode: 'cash', amountPaise: 20000 }] }), null);
    t.db.update(schema.sale).set({ refillDays: 15, refillDueDate: addDays(today, 1) }).where(eq(schema.sale.id, dueSoon.id)).run();
    t.db.update(schema.sale).set({ refillDays: 15, refillDueDate: addDays(today, 1) }).where(eq(schema.sale.id, noConsent.id)).run();
    t.db.update(schema.sale).set({ refillDays: 30, refillDueDate: addDays(today, 20) }).where(eq(schema.sale.id, farAway.id)).run();

    const due = refillsDue(t.db, { withinDays: 7, includeOverdue: true });
    expect(due.map((d) => d.saleId).sort()).toEqual([dueSoon.id, noConsent.id].sort());
    expect(due.find((d) => d.saleId === dueSoon.id)).toMatchObject({ daysLeft: 1, consentMarketing: true, reminderQueued: false, reminderSent: false });

    const r = runRefillReminders(t.db, t.owner);
    expect(r).toMatchObject({ queued: 1, skippedNoConsent: 1 });
    const out = listOutbox(t.db, { page: 1, pageSize: 10, templateKey: 'refill' });
    expect(out.total).toBe(1);
    expect(out.rows[0]).toMatchObject({ relatedId: dueSoon.id, status: 'manual' });
    expect(out.rows[0]!.body).toContain(dueSoon.invoiceNo!);
    expect(refillsDue(t.db, { withinDays: 7, includeOverdue: true }).find((d) => d.saleId === dueSoon.id)!.reminderQueued).toBe(true);
    expect(runRefillReminders(t.db, t.owner).queued).toBe(0);
  });

  it('dues-run reminds customers with a balance and skips anyone messaged in the last 7 days', () => {
    const t = testDb();
    const { batchId } = seedItem(t.db, t.owner, { name: 'Item', generic: 'Z 1 mg', mrp: 10000, rate: 5000, packs: 5, supplierId: t.supplierId });
    postSale(t.db, t.owner, sale({ customerId: t.customerId, lines: [{ batchId, unitMode: 'pack', qty: 1 }], payments: [{ mode: 'cash', amountPaise: 4000 }] }), null);
    const dues = duesList(t.db);
    expect(dues).toHaveLength(1);
    expect(dues[0]).toMatchObject({ id: t.customerId, balancePaise: 6000, lastReminderAt: null });
    const first = runDuesReminders(t.db, t.owner);
    expect(first.queued).toBe(1);
    const msg = listOutbox(t.db, { page: 1, pageSize: 10, templateKey: 'dues' }).rows[0]!;
    expect(msg.body).toContain('₹60.00');
    expect(msg.status).toBe('manual');
    expect(runDuesReminders(t.db, t.owner)).toMatchObject({ queued: 0, skippedRecent: 1 });
    expect(duesList(t.db)[0]!.lastReminderAt).not.toBeNull();
    expect(runDuesReminders(t.db, t.owner, { minPaise: 100000 }).candidates).toBe(0);
  });
});
