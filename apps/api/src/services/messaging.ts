import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addDays, daysBetween, formatDateIN, formatINR, messagingSettingsSchema, todayIST, type MessagingSettings } from '@pharma/shared';
import type { outboxQuery, refillsQuery, sendMessageSchema } from '@pharma/shared';
import { schema, type DB } from '../db/index.js';
import { audit } from '../lib/audit.js';
import { SYSTEM_CTX, type Ctx } from '../lib/ctx.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';

type SendMessageInput = Omit<z.infer<typeof sendMessageSchema>, 'relatedType' | 'scheduledFor'> & { relatedType?: string | null; scheduledFor?: string | null };
type OutboxQuery = z.infer<typeof outboxQuery>;
type RefillsQuery = z.infer<typeof refillsQuery>;
type OutboxStatus = 'queued' | 'sent' | 'failed' | 'skipped' | 'manual';

const SETTING_KEY = 'messaging';
const LAST_REFILL_RUN_KEY = 'messaging.lastRefillRun';
const MAX_ATTEMPTS = 3;
const MAX_BODY = 900;
const DUES_COOLDOWN_DAYS = 7;
/** How far back an overdue refill is still worth reminding about. */
const REFILL_OVERDUE_GRACE_DAYS = 7;
const GRAPH_URL = 'https://graph.facebook.com/v20.0';

export const DEFAULT_TEMPLATES = {
  bill: 'Namaste {{customer}}, thank you for shopping at {{store}}. Bill {{bill}} for {{amount}} on {{date}}. {{items}}. Get well soon!',
  dues: 'Namaste {{customer}}, this is a gentle reminder from {{store}}. An amount of {{amount}} is pending on your account. {{upi}}Please pay at your convenience or call {{phone}}. Thank you!',
  refill: 'Namaste {{customer}}, this is {{store}}. Your medicines from bill {{bill}} may be running out around {{due}}. Reply or call {{phone}} to refill.',
} as const;
export const TEMPLATE_PLACEHOLDERS = ['store', 'customer', 'bill', 'amount', 'due', 'items', 'date', 'phone', 'upi'] as const;

const nowIso = () => new Date().toISOString();

// ---------- Settings ----------
export function getMessagingSettings(db: DB): MessagingSettings {
  const row = db.select().from(schema.setting).where(eq(schema.setting.key, SETTING_KEY)).get();
  if (!row) return messagingSettingsSchema.parse({});
  try {
    return messagingSettingsSchema.parse(JSON.parse(row.value));
  } catch {
    return messagingSettingsSchema.parse({});
  }
}

export function maskToken(token: string | null | undefined): string | null {
  if (!token) return null;
  return `••••${token.slice(-4)}`;
}

export function isConfigured(s: MessagingSettings): boolean {
  return s.provider === 'meta_cloud' && !!s.phoneNumberId && !!s.accessToken;
}

/** Settings as shown to the UI: token masked, plus defaults so the form can show placeholders. */
export function publicMessagingSettings(db: DB) {
  const s = getMessagingSettings(db);
  return { ...s, accessToken: maskToken(s.accessToken), configured: isConfigured(s), defaults: DEFAULT_TEMPLATES, placeholders: TEMPLATE_PLACEHOLDERS };
}

export function saveMessagingSettings(db: DB, ctx: Ctx, input: MessagingSettings) {
  const before = getMessagingSettings(db);
  const keepToken = !input.accessToken || input.accessToken === maskToken(before.accessToken) || input.accessToken.startsWith('••••');
  const next: MessagingSettings = { ...before, ...input, accessToken: keepToken ? before.accessToken : input.accessToken };
  db.transaction((tx) => {
    tx.insert(schema.setting).values({ key: SETTING_KEY, value: JSON.stringify(next), updatedAt: nowIso() })
      .onConflictDoUpdate({ target: schema.setting.key, set: { value: JSON.stringify(next), updatedAt: nowIso() } }).run();
    audit(tx, ctx, { entity: 'setting', entityId: SETTING_KEY, action: 'update', before: { ...before, accessToken: maskToken(before.accessToken) }, after: { ...next, accessToken: maskToken(next.accessToken) } });
  });
  return publicMessagingSettings(db);
}

// ---------- Templates ----------
export type TemplateVars = Partial<Record<(typeof TEMPLATE_PLACEHOLDERS)[number], string | null | undefined>>;

/** Replace {{placeholders}}, tidy whitespace and cap the length so a message never exceeds WhatsApp comfort. */
export function renderTemplate(template: string, vars: TemplateVars): string {
  let out = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = (vars as Record<string, string | null | undefined>)[key];
    return v === null || v === undefined ? '' : String(v);
  });
  out = out.replace(/[ \t]+/g, ' ').replace(/ \./g, '.').replace(/\.\s*\./g, '.').replace(/\n{3,}/g, '\n\n').trim();
  if (out.length > MAX_BODY) out = `${out.slice(0, MAX_BODY - 1).trimEnd()}…`;
  return out;
}

function storeVars(db: DB, s: MessagingSettings) {
  const store = db.select({ name: schema.store.name, phone: schema.store.phone, upiId: schema.store.upiId }).from(schema.store).where(eq(schema.store.id, 1)).get();
  return {
    store: s.businessName || store?.name || 'your pharmacy',
    phone: store?.phone || '',
    upi: store?.upiId ? `You can pay by UPI to ${store.upiId}. ` : '',
    upiId: store?.upiId ?? null,
  };
}

function templateFor(s: MessagingSettings, key: 'bill' | 'dues' | 'refill'): string {
  const custom = key === 'bill' ? s.billTemplate : key === 'dues' ? s.duesReminderTemplate : s.refillTemplate;
  return custom && custom.trim() ? custom : DEFAULT_TEMPLATES[key];
}

/** "Dolo 650 ×2 strips, Pan 40 ×7 tablets" (first 6 lines, then "+N more"). */
export function itemsSummary(lines: { itemName: string; qty: number; unitMode: string; packName: string; baseUnit: string }[]): string {
  const parts = lines.map((l) => `${l.itemName} ×${l.qty} ${l.unitMode === 'pack' ? l.packName : l.baseUnit}${l.qty === 1 ? '' : 's'}`.replace(/ss$/, 's'));
  const shown = parts.slice(0, 6);
  return shown.join(', ') + (parts.length > 6 ? ` +${parts.length - 6} more` : '');
}

function saleForMessage(db: DB, saleId: number) {
  const s = db.select().from(schema.sale).where(eq(schema.sale.id, saleId)).get();
  if (!s) throw notFound('Bill not found');
  const lines = db.select({ itemName: schema.saleLine.itemName, qty: schema.saleLine.qty, unitMode: schema.saleLine.unitMode, packName: schema.saleLine.packName, baseUnit: schema.saleLine.baseUnit }).from(schema.saleLine).where(eq(schema.saleLine.saleId, saleId)).orderBy(schema.saleLine.id).all();
  return { sale: s, lines };
}

export function renderBillMessage(db: DB, saleId: number) {
  const s = getMessagingSettings(db);
  const { sale, lines } = saleForMessage(db, saleId);
  const vars: TemplateVars = { ...storeVars(db, s), customer: sale.customerName || sale.patientName || 'customer', bill: sale.invoiceNo ?? `#${sale.id}`, amount: formatINR(sale.totalPaise), date: formatDateIN(sale.date), items: itemsSummary(lines), due: sale.refillDueDate ? formatDateIN(sale.refillDueDate) : '' };
  return { sale, body: renderTemplate(templateFor(s, 'bill'), vars) };
}

export function renderRefillMessage(db: DB, saleId: number) {
  const s = getMessagingSettings(db);
  const { sale, lines } = saleForMessage(db, saleId);
  const vars: TemplateVars = { ...storeVars(db, s), customer: sale.customerName || sale.patientName || 'customer', bill: sale.invoiceNo ?? `#${sale.id}`, amount: formatINR(sale.totalPaise), date: formatDateIN(sale.date), items: itemsSummary(lines), due: sale.refillDueDate ? formatDateIN(sale.refillDueDate) : 'soon' };
  return { sale, body: renderTemplate(templateFor(s, 'refill'), vars) };
}

export function renderDuesMessage(db: DB, customer: { name: string; phone: string; balancePaise: number }) {
  const s = getMessagingSettings(db);
  const vars: TemplateVars = { ...storeVars(db, s), customer: customer.name, amount: formatINR(customer.balancePaise), date: formatDateIN(todayIST()), bill: '', items: '', due: '' };
  return renderTemplate(templateFor(s, 'dues'), vars);
}

// ---------- Queue ----------
/** 10-digit Indian mobiles get the country code; anything longer is taken as already international. */
export function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

export function queueMessage(db: DB, ctx: Ctx, input: SendMessageInput) {
  const s = getMessagingSettings(db);
  const status: OutboxStatus = s.provider === 'meta_cloud' ? 'queued' : 'manual';
  const toPhone = input.toPhone.replace(/\D/g, '');
  if (toPhone.length < 10) throw badRequest('Enter a 10-digit mobile number');
  const body = input.body.trim().slice(0, 2000);
  return db.insert(schema.messageOutbox).values({
    channel: 'whatsapp', toPhone, templateKey: input.templateKey, body, status,
    customerId: input.customerId ?? null, relatedType: input.relatedType ?? null, relatedId: input.relatedId ?? null,
    scheduledFor: input.scheduledFor ?? null, createdBy: ctx.userId || null,
  }).returning().get();
}

export function queueBillMessage(db: DB, ctx: Ctx, saleId: number) {
  const { sale, body } = renderBillMessage(db, saleId);
  if (sale.status !== 'posted') throw conflict('Only posted bills can be sent');
  if (!sale.customerPhone) throw conflict('This bill has no customer phone number. Add a phone number to the customer and try again.');
  return queueMessage(db, ctx, { toPhone: sale.customerPhone, templateKey: 'bill', body, customerId: sale.customerId ?? null, relatedType: 'sale', relatedId: sale.id, scheduledFor: null });
}

export function queueTestMessage(db: DB, ctx: Ctx, toPhone: string) {
  const s = getMessagingSettings(db);
  const v = storeVars(db, s);
  const body = renderTemplate('Test message from {{store}} ({{date}}). If you received this, WhatsApp messaging is set up correctly.', { ...v, date: formatDateIN(todayIST()) });
  return queueMessage(db, ctx, { toPhone, templateKey: 'custom', body, relatedType: 'test', scheduledFor: null });
}

function getMessage(db: DB, id: number) {
  const m = db.select().from(schema.messageOutbox).where(eq(schema.messageOutbox.id, id)).get();
  if (!m) throw notFound('Message not found');
  return m;
}

export function retryMessage(db: DB, id: number) {
  const m = getMessage(db, id);
  if (m.status === 'sent') throw conflict('This message was already sent');
  const s = getMessagingSettings(db);
  const status: OutboxStatus = s.provider === 'meta_cloud' ? 'queued' : 'manual';
  db.update(schema.messageOutbox).set({ status, attempts: 0, error: null, scheduledFor: null }).where(eq(schema.messageOutbox.id, id)).run();
  return getMessage(db, id);
}

export function markMessageSent(db: DB, id: number) {
  const m = getMessage(db, id);
  if (m.status === 'sent') return m;
  db.update(schema.messageOutbox).set({ status: 'sent', sentAt: nowIso(), error: null }).where(eq(schema.messageOutbox.id, id)).run();
  return getMessage(db, id);
}

export function cancelMessage(db: DB, id: number) {
  const m = getMessage(db, id);
  if (m.status !== 'queued' && m.status !== 'manual' && m.status !== 'failed') throw conflict(`A ${m.status} message cannot be cancelled`);
  db.update(schema.messageOutbox).set({ status: 'skipped' }).where(eq(schema.messageOutbox.id, id)).run();
  return getMessage(db, id);
}

export function listOutbox(db: DB, q: OutboxQuery) {
  const conds = [];
  if (q.status) conds.push(eq(schema.messageOutbox.status, q.status));
  if (q.templateKey) conds.push(eq(schema.messageOutbox.templateKey, q.templateKey));
  if (q.q) {
    const t = `%${q.q.toLowerCase()}%`;
    conds.push(or(sql`${schema.messageOutbox.toPhone} like ${t}`, sql`lower(${schema.customer.name}) like ${t}`, sql`lower(${schema.messageOutbox.body}) like ${t}`)!);
  }
  const where = conds.length ? and(...conds) : undefined;
  const base = () => db.select({ n: sql<number>`count(*)` }).from(schema.messageOutbox).leftJoin(schema.customer, eq(schema.customer.id, schema.messageOutbox.customerId)).where(where);
  const total = base().get()!.n;
  const rows = db.select({
    id: schema.messageOutbox.id, channel: schema.messageOutbox.channel, toPhone: schema.messageOutbox.toPhone, templateKey: schema.messageOutbox.templateKey, body: schema.messageOutbox.body, status: schema.messageOutbox.status,
    providerMessageId: schema.messageOutbox.providerMessageId, error: schema.messageOutbox.error, relatedType: schema.messageOutbox.relatedType, relatedId: schema.messageOutbox.relatedId, customerId: schema.messageOutbox.customerId,
    scheduledFor: schema.messageOutbox.scheduledFor, attempts: schema.messageOutbox.attempts, createdAt: schema.messageOutbox.createdAt, sentAt: schema.messageOutbox.sentAt, customerName: schema.customer.name,
  }).from(schema.messageOutbox).leftJoin(schema.customer, eq(schema.customer.id, schema.messageOutbox.customerId)).where(where)
    .orderBy(desc(schema.messageOutbox.id)).limit(q.pageSize).offset((q.page - 1) * q.pageSize).all();
  return { rows: rows.map((r) => ({ ...r, waLink: `https://wa.me/${waNumber(r.toPhone)}?text=${encodeURIComponent(r.body)}` })), total, page: q.page, pageSize: q.pageSize };
}

export function messagingStatus(db: DB) {
  const s = getMessagingSettings(db);
  const count = (status: OutboxStatus) => db.select({ n: sql<number>`count(*)` }).from(schema.messageOutbox).where(eq(schema.messageOutbox.status, status)).get()!.n;
  const last = db.select({ sentAt: schema.messageOutbox.sentAt }).from(schema.messageOutbox).where(eq(schema.messageOutbox.status, 'sent')).orderBy(desc(schema.messageOutbox.sentAt)).limit(1).get();
  return { provider: s.provider, configured: isConfigured(s), queued: count('queued'), failed: count('failed'), manual: count('manual'), lastSentAt: last?.sentAt ?? null };
}

// ---------- Refills ----------
const activeRefillFor = (saleId: typeof schema.sale.id) => sql<string | null>`(select max(status) from message_outbox o where o.related_type = 'sale' and o.related_id = ${saleId} and o.template_key = 'refill' and o.status in ('queued','sent','manual'))`;

export function refillsDue(db: DB, q: RefillsQuery) {
  const today = todayIST();
  const until = addDays(today, q.withinDays);
  const conds = [eq(schema.sale.status, 'posted'), sql`${schema.sale.refillDueDate} is not null`, lte(schema.sale.refillDueDate, until)];
  if (!q.includeOverdue) conds.push(gte(schema.sale.refillDueDate, today));
  const rows = db.select({
    saleId: schema.sale.id, invoiceNo: schema.sale.invoiceNo, date: schema.sale.date, refillDays: schema.sale.refillDays, refillDueDate: schema.sale.refillDueDate,
    customerId: schema.sale.customerId, customerName: sql<string | null>`coalesce(${schema.customer.name}, ${schema.sale.customerName})`, customerPhone: sql<string | null>`coalesce(${schema.customer.phone}, ${schema.sale.customerPhone})`,
    consentMarketing: sql<number>`coalesce(${schema.customer.consentMarketing}, 0)`, patientName: schema.sale.patientName,
    items: sql<string>`(select group_concat(item_name, ', ') from sale_line sl where sl.sale_id = ${schema.sale.id})`,
    reminderStatus: activeRefillFor(schema.sale.id),
  }).from(schema.sale).leftJoin(schema.customer, eq(schema.customer.id, schema.sale.customerId)).where(and(...conds)).orderBy(schema.sale.refillDueDate, schema.sale.id).limit(500).all();
  return rows.map((r) => ({ ...r, consentMarketing: !!r.consentMarketing, daysLeft: daysBetween(today, r.refillDueDate!), reminderQueued: r.reminderStatus === 'queued' || r.reminderStatus === 'manual', reminderSent: r.reminderStatus === 'sent' }));
}

/** Queues refill reminders for sales due within the lead window; only customers who agreed to marketing, one reminder per bill. */
export function runRefillReminders(db: DB, ctx: Ctx = SYSTEM_CTX, leadDaysOverride?: number) {
  const s = getMessagingSettings(db);
  const leadDays = leadDaysOverride ?? s.refillLeadDays;
  const today = todayIST();
  const from = addDays(today, -REFILL_OVERDUE_GRACE_DAYS);
  const until = addDays(today, leadDays);
  const candidates = db.select({
    saleId: schema.sale.id, customerId: schema.sale.customerId, phone: sql<string | null>`coalesce(${schema.customer.phone}, ${schema.sale.customerPhone})`,
    consent: sql<number>`coalesce(${schema.customer.consentMarketing}, 0)`, reminderStatus: activeRefillFor(schema.sale.id),
  }).from(schema.sale).leftJoin(schema.customer, eq(schema.customer.id, schema.sale.customerId))
    .where(and(eq(schema.sale.status, 'posted'), sql`${schema.sale.refillDueDate} is not null`, gte(schema.sale.refillDueDate, from), lte(schema.sale.refillDueDate, until))).all();
  let queued = 0; let skippedNoConsent = 0; let skippedAlready = 0; let skippedNoPhone = 0;
  for (const c of candidates) {
    if (c.reminderStatus) { skippedAlready++; continue; }
    if (!c.phone) { skippedNoPhone++; continue; }
    if (!c.consent) { skippedNoConsent++; continue; }
    const { sale, body } = renderRefillMessage(db, c.saleId);
    queueMessage(db, ctx, { toPhone: c.phone, templateKey: 'refill', body, customerId: sale.customerId ?? null, relatedType: 'sale', relatedId: sale.id, scheduledFor: null });
    queued++;
  }
  if (queued || candidates.length) audit(db, ctx, { entity: 'message', entityId: null, action: 'refill_run', after: { queued, skippedNoConsent, skippedAlready, skippedNoPhone, leadDays } });
  return { queued, skippedNoConsent, skippedAlready, skippedNoPhone, candidates: candidates.length };
}

export function queueRefillForSale(db: DB, ctx: Ctx, saleId: number) {
  const { sale, body } = renderRefillMessage(db, saleId);
  if (sale.status !== 'posted') throw conflict('Only posted bills can be sent');
  const customer = sale.customerId ? db.select({ phone: schema.customer.phone, consent: schema.customer.consentMarketing }).from(schema.customer).where(eq(schema.customer.id, sale.customerId)).get() : null;
  const phone = customer?.phone ?? sale.customerPhone;
  if (!phone) throw conflict('This bill has no customer phone number.');
  if (!customer?.consent) throw conflict('This customer has not agreed to marketing messages. Refill reminders need consent (DPDP Act). Edit the customer to record consent.');
  return queueMessage(db, ctx, { toPhone: phone, templateKey: 'refill', body, customerId: sale.customerId ?? null, relatedType: 'sale', relatedId: sale.id, scheduledFor: null });
}

// ---------- Dues ----------
const balanceSub = sql<number>`(select coalesce(sum(debit_paise)-sum(credit_paise),0) from party_ledger l where l.party_type='customer' and l.party_id="customer"."id")`;
const lastDuesReminderSub = sql<string | null>`(select max(coalesce(sent_at, created_at)) from message_outbox o where o.template_key = 'dues' and o.customer_id = "customer"."id" and o.status in ('queued','sent','manual'))`;

export function duesList(db: DB) {
  const rows = db.select({ id: schema.customer.id, name: schema.customer.name, phone: schema.customer.phone, consentMarketing: schema.customer.consentMarketing, balancePaise: balanceSub, lastReminderAt: lastDuesReminderSub, lastDate: sql<string | null>`(select max(date) from party_ledger l where l.party_type='customer' and l.party_id="customer"."id")` })
    .from(schema.customer).where(and(eq(schema.customer.active, true), sql`${balanceSub} > 0`)).all().sort((a, b) => b.balancePaise - a.balancePaise);
  return rows.map((r) => ({ ...r, waLink: `https://wa.me/${waNumber(r.phone)}?text=${encodeURIComponent(renderDuesMessage(db, r))}` }));
}

/** Queues dues reminders (transactional, so no marketing consent needed); skips anyone reminded in the last 7 days. */
export function runDuesReminders(db: DB, ctx: Ctx, o: { minPaise?: number; customerIds?: number[] } = {}) {
  const cutoff = new Date(Date.now() - DUES_COOLDOWN_DAYS * 86_400_000).toISOString();
  const conds = [eq(schema.customer.active, true), sql`${balanceSub} > 0`];
  if (o.minPaise && o.minPaise > 0) conds.push(sql`${balanceSub} >= ${o.minPaise}`);
  if (o.customerIds && o.customerIds.length) conds.push(inArray(schema.customer.id, o.customerIds));
  const rows = db.select({ id: schema.customer.id, name: schema.customer.name, phone: schema.customer.phone, balancePaise: balanceSub, lastReminderAt: lastDuesReminderSub }).from(schema.customer).where(and(...conds)).all();
  let queued = 0; let skippedRecent = 0;
  for (const c of rows) {
    if (c.lastReminderAt && c.lastReminderAt >= cutoff) { skippedRecent++; continue; }
    queueMessage(db, ctx, { toPhone: c.phone, templateKey: 'dues', body: renderDuesMessage(db, c), customerId: c.id, relatedType: 'customer', relatedId: c.id, scheduledFor: null });
    queued++;
  }
  audit(db, ctx, { entity: 'message', entityId: null, action: 'dues_run', after: { queued, skippedRecent, minPaise: o.minPaise ?? 0, customerIds: o.customerIds ?? null } });
  return { queued, skippedRecent, candidates: rows.length };
}

// ---------- Dispatcher (Meta WhatsApp Cloud API) ----------
type SendResult = { ok: true; providerMessageId: string | null } | { ok: false; error: string };
type Sender = (s: MessagingSettings, toPhone: string, body: string) => Promise<SendResult>;

export const metaCloudSender: Sender = async (s, toPhone, body) => {
  try {
    const res = await fetch(`${GRAPH_URL}/${encodeURIComponent(s.phoneNumberId!)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: waNumber(toPhone), type: 'text', text: { body } }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let json: { messages?: { id?: string }[]; error?: { message?: string; code?: number } } = {};
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    if (res.ok) return { ok: true, providerMessageId: json.messages?.[0]?.id ?? null };
    const msg = json.error?.message ? `${json.error.message}${json.error.code ? ` (code ${json.error.code})` : ''}` : `HTTP ${res.status}: ${text.slice(0, 200)}`;
    return { ok: false, error: msg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

/** Sends up to 20 due messages. Never throws; failures are recorded on the row. */
export async function dispatchOnce(db: DB, sender: Sender = metaCloudSender, log?: { error: (o: unknown, m?: string) => void }) {
  const s = getMessagingSettings(db);
  if (!isConfigured(s)) return { sent: 0, failed: 0 };
  const now = nowIso();
  const due = db.select().from(schema.messageOutbox)
    .where(and(eq(schema.messageOutbox.status, 'queued'), or(isNull(schema.messageOutbox.scheduledFor), lte(schema.messageOutbox.scheduledFor, now))))
    .orderBy(schema.messageOutbox.id).limit(20).all();
  let sent = 0; let failed = 0;
  for (const m of due) {
    try {
      const r = await sender(s, m.toPhone, m.body);
      if (r.ok) {
        db.update(schema.messageOutbox).set({ status: 'sent', sentAt: nowIso(), providerMessageId: r.providerMessageId, error: null, attempts: m.attempts + 1 }).where(eq(schema.messageOutbox.id, m.id)).run();
        sent++;
      } else {
        const attempts = m.attempts + 1;
        const giveUp = attempts >= MAX_ATTEMPTS;
        db.update(schema.messageOutbox).set({ attempts, error: r.error.slice(0, 500), status: giveUp ? 'failed' : 'queued', scheduledFor: giveUp ? m.scheduledFor : new Date(Date.now() + attempts * 5 * 60_000).toISOString() }).where(eq(schema.messageOutbox.id, m.id)).run();
        if (giveUp) failed++;
      }
    } catch (err) {
      log?.error({ err, id: m.id }, 'message dispatch failed');
      try { db.update(schema.messageOutbox).set({ attempts: m.attempts + 1, error: String(err).slice(0, 500), status: m.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'queued' }).where(eq(schema.messageOutbox.id, m.id)).run(); } catch { /* ignore */ }
    }
  }
  return { sent, failed };
}

function istParts(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return { hour: ist.getUTCHours(), day: ist.toISOString().slice(0, 10) };
}

/** Every 30 s: send queued messages. Once a day after 09:00 IST (Cloud API mode only): queue refill reminders automatically. */
export function startMessagingDispatcher(app: FastifyInstance) {
  const tick = async () => {
    try {
      await dispatchOnce(app.db, metaCloudSender, app.log);
      const s = getMessagingSettings(app.db);
      if (s.provider !== 'meta_cloud') return;
      const { hour, day } = istParts();
      if (hour < 9) return;
      const last = app.db.select().from(schema.setting).where(eq(schema.setting.key, LAST_REFILL_RUN_KEY)).get();
      if (last?.value === day) return;
      app.db.insert(schema.setting).values({ key: LAST_REFILL_RUN_KEY, value: day, updatedAt: nowIso() }).onConflictDoUpdate({ target: schema.setting.key, set: { value: day, updatedAt: nowIso() } }).run();
      runRefillReminders(app.db, SYSTEM_CTX);
    } catch (err) {
      app.log.error({ err }, 'messaging dispatcher tick failed');
    }
  };
  setTimeout(() => void tick(), 20_000).unref();
  setInterval(() => void tick(), 30_000).unref();
}
