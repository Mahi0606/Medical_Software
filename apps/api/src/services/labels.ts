import { desc, eq, inArray } from 'drizzle-orm';
import { buildGs1ElementString, formatExpiry, internalBatchCode, internalItemCode, type LabelJobInput, type LabelTemplateInput } from '@pharma/shared';
import { schema, type DB } from '../db/index.js';
import { audit } from '../lib/audit.js';
import type { Ctx } from '../lib/ctx.js';
import { notFound } from '../lib/errors.js';

export interface LabelTemplate extends LabelTemplateInput { id: number; createdAt: string; updatedAt: string }

function fromRow(r: typeof schema.labelTemplate.$inferSelect): LabelTemplate {
  return {
    id: r.id, name: r.name, kind: r.kind, widthMm: r.widthMm / 10, heightMm: r.heightMm / 10, columns: r.columns, gapMm: r.gapMm / 10, marginMm: r.marginMm / 10, fontScale: r.fontScale / 100,
    symbology: r.symbology as LabelTemplate['symbology'], barcodeContent: r.barcodeContent as LabelTemplate['barcodeContent'], fields: JSON.parse(r.fieldsJson), isDefault: r.isDefault, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}
function toRow(t: LabelTemplateInput) {
  return { name: t.name, kind: t.kind, widthMm: Math.round(t.widthMm * 10), heightMm: Math.round(t.heightMm * 10), columns: t.columns, gapMm: Math.round(t.gapMm * 10), marginMm: Math.round(t.marginMm * 10), fontScale: Math.round(t.fontScale * 100), symbology: t.symbology, barcodeContent: t.barcodeContent, fieldsJson: JSON.stringify(t.fields), isDefault: t.isDefault };
}

export const DEFAULT_TEMPLATES: LabelTemplateInput[] = [
  { name: 'Product label 50 × 25 mm', kind: 'product', widthMm: 50, heightMm: 25, columns: 1, gapMm: 3, marginMm: 1.5, fontScale: 1, symbology: 'code128', barcodeContent: 'batch', fields: ['itemName', 'batch', 'expiry', 'mrp', 'pack', 'barcode', 'barcodeText'], isDefault: true },
  { name: 'Product label 38 × 25 mm (two-up)', kind: 'product', widthMm: 38, heightMm: 25, columns: 2, gapMm: 3, marginMm: 1.5, fontScale: 0.9, symbology: 'code128', barcodeContent: 'batch', fields: ['itemName', 'batch', 'expiry', 'mrp', 'barcode', 'barcodeText'], isDefault: false },
  { name: 'Loose dispense label 50 × 25 mm', kind: 'loose', widthMm: 50, heightMm: 25, columns: 1, gapMm: 3, marginMm: 1.5, fontScale: 1, symbology: 'code128', barcodeContent: 'batch', fields: ['storeName', 'itemName', 'batch', 'expiry', 'barcode'], isDefault: false },
  { name: 'Shelf label 50 × 25 mm', kind: 'shelf', widthMm: 50, heightMm: 25, columns: 1, gapMm: 3, marginMm: 1.5, fontScale: 1.1, symbology: 'code128', barcodeContent: 'item', fields: ['itemName', 'generic', 'rack', 'mrp', 'barcode', 'barcodeText'], isDefault: false },
];

export function ensureDefaultTemplates(db: DB) {
  const n = db.select({ id: schema.labelTemplate.id }).from(schema.labelTemplate).limit(1).get();
  if (n) return;
  for (const t of DEFAULT_TEMPLATES) db.insert(schema.labelTemplate).values(toRow(t)).run();
}

export function listTemplates(db: DB): LabelTemplate[] {
  ensureDefaultTemplates(db);
  return db.select().from(schema.labelTemplate).orderBy(desc(schema.labelTemplate.isDefault), schema.labelTemplate.kind, schema.labelTemplate.name).all().map(fromRow);
}

export function saveTemplate(db: DB, ctx: Ctx, input: LabelTemplateInput, id?: number): LabelTemplate {
  return db.transaction((tx) => {
    if (input.isDefault) tx.update(schema.labelTemplate).set({ isDefault: false }).where(eq(schema.labelTemplate.kind, input.kind)).run();
    if (id) {
      const before = tx.select().from(schema.labelTemplate).where(eq(schema.labelTemplate.id, id)).get();
      if (!before) throw notFound('Template not found');
      tx.update(schema.labelTemplate).set({ ...toRow(input), updatedAt: new Date().toISOString() }).where(eq(schema.labelTemplate.id, id)).run();
      audit(tx, ctx, { entity: 'label_template', entityId: id, action: 'update', before: fromRow(before), after: input });
      return fromRow(tx.select().from(schema.labelTemplate).where(eq(schema.labelTemplate.id, id)).get()!);
    }
    const row = tx.insert(schema.labelTemplate).values(toRow(input)).returning().get();
    audit(tx, ctx, { entity: 'label_template', entityId: row.id, action: 'create', after: input });
    return fromRow(row);
  });
}

export function deleteTemplate(db: DB, ctx: Ctx, id: number) {
  db.transaction((tx) => {
    const before = tx.select().from(schema.labelTemplate).where(eq(schema.labelTemplate.id, id)).get();
    if (!before) throw notFound('Template not found');
    tx.delete(schema.labelTemplate).where(eq(schema.labelTemplate.id, id)).run();
    audit(tx, ctx, { entity: 'label_template', entityId: id, action: 'delete', before: fromRow(before) });
  });
}

export interface LabelDatum {
  batchId: number; itemId: number; copies: number; storeName: string; itemName: string; generic: string; manufacturer: string | null; batchNo: string; expiry: string; expiryIso: string; mfg: string | null;
  mrpPaise: number; pack: string; rack: string | null; schedule: string; packedOn: string; barcodeValue: string; barcodeText: string; gs1Value: string | null; gtin: string | null;
  loose?: { qtyText: string | null; patientName: string | null; directions: string | null };
}

/** Resolves batches into printable label rows and records the job (for audit / reprint). */
export function buildLabelJob(db: DB, ctx: Ctx, input: LabelJobInput): { template: LabelTemplate; labels: LabelDatum[]; jobId: number } {
  const tRow = db.select().from(schema.labelTemplate).where(eq(schema.labelTemplate.id, input.templateId)).get();
  if (!tRow) throw notFound('Label template not found');
  const template = fromRow(tRow);
  const store = db.select({ name: schema.store.name, city: schema.store.city, addressLine1: schema.store.addressLine1 }).from(schema.store).where(eq(schema.store.id, 1)).get()!;
  const ids = input.items.map((i) => i.batchId);
  const batches = db.select({ b: schema.batch, item: schema.item, manufacturer: schema.manufacturer.name }).from(schema.batch)
    .innerJoin(schema.item, eq(schema.item.id, schema.batch.itemId)).leftJoin(schema.manufacturer, eq(schema.manufacturer.id, schema.item.manufacturerId)).where(inArray(schema.batch.id, ids)).all();
  const today = new Date().toISOString().slice(0, 10).split('-').reverse().join('/');
  const labels: LabelDatum[] = input.items.map((req) => {
    const r = batches.find((x) => x.b.id === req.batchId);
    if (!r) throw notFound(`Batch ${req.batchId} not found`);
    const gtin = r.b.gtin ?? r.item.ean ?? null;
    const barcodeValue = template.barcodeContent === 'item' ? internalItemCode(r.item.id) : template.barcodeContent === 'gtin' && gtin ? gtin : internalBatchCode(r.b.id);
    const gs1Value = gtin ? buildGs1ElementString({ gtin, batch: r.b.batchNo, expiryIso: r.b.expiryDate }) : null;
    const packText = r.item.unitsPerPack === 1 ? `1 ${r.item.packName}` : `${r.item.unitsPerPack} ${r.item.baseUnit}s / ${r.item.packName}`;
    return {
      batchId: r.b.id, itemId: r.item.id, copies: req.copies, storeName: store.name, itemName: r.item.name, generic: r.item.genericText, manufacturer: r.manufacturer, batchNo: r.b.batchNo,
      expiry: formatExpiry(r.b.expiryDate), expiryIso: r.b.expiryDate, mfg: r.b.mfgDate ? formatExpiry(r.b.mfgDate) : null, mrpPaise: r.b.mrpPaise, pack: packText, rack: r.item.rack, schedule: r.item.schedule,
      packedOn: today, barcodeValue, barcodeText: barcodeValue, gs1Value, gtin, loose: input.loose,
    };
  });
  const labelCount = labels.reduce((s, l) => s + l.copies, 0);
  const job = db.insert(schema.labelJob).values({ templateId: template.id, userId: ctx.userId, payloadJson: JSON.stringify(input), labelCount }).returning({ id: schema.labelJob.id }).get();
  audit(db, ctx, { entity: 'label_job', entityId: job.id, action: 'print', after: { templateId: template.id, labelCount, batches: ids } });
  return { template, labels, jobId: job.id };
}

export function recentJobs(db: DB) {
  return db.select({ id: schema.labelJob.id, templateId: schema.labelJob.templateId, templateName: schema.labelTemplate.name, labelCount: schema.labelJob.labelCount, createdAt: schema.labelJob.createdAt, userName: schema.user.name, payloadJson: schema.labelJob.payloadJson })
    .from(schema.labelJob).leftJoin(schema.labelTemplate, eq(schema.labelTemplate.id, schema.labelJob.templateId)).leftJoin(schema.user, eq(schema.user.id, schema.labelJob.userId))
    .orderBy(desc(schema.labelJob.id)).limit(30).all().map((j) => ({ ...j, payload: JSON.parse(j.payloadJson) as LabelJobInput, payloadJson: undefined }));
}
