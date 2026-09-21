import { eq } from 'drizzle-orm';
import { addDays, todayIST } from '@pharma/shared';
import { openDatabase, schema, type DB } from '../src/db/index.js';
import { SYSTEM_CTX, type Ctx } from '../src/lib/ctx.js';
import { hashPassword } from '../src/lib/password.js';
import { insertItem, parseGenericString } from '../src/services/catalog.js';
import { addOpeningStock } from '../src/services/inventory.js';

export function testDb() {
  const { db, sqlite } = openDatabase(':memory:');
  const ownerId = db.insert(schema.user).values({ username: 'owner', name: 'Owner', role: 'owner', passwordHash: hashPassword('x'), pharmacistRegNo: 'RP-1' }).returning({ id: schema.user.id }).get().id;
  const pharmacistId = db.insert(schema.user).values({ username: 'rph', name: 'Pharmacist', role: 'pharmacist', passwordHash: hashPassword('x'), pharmacistRegNo: 'RP-2' }).returning({ id: schema.user.id }).get().id;
  const clerkId = db.insert(schema.user).values({ username: 'clerk', name: 'Clerk', role: 'clerk', passwordHash: hashPassword('x') }).returning({ id: schema.user.id }).get().id;
  db.update(schema.store).set({ name: 'Test Pharmacy', stateCode: '27', gstScheme: 'regular', invoicePrefix: 'INV', setupComplete: true }).where(eq(schema.store.id, 1)).run();
  const supplierId = db.insert(schema.supplier).values({ name: 'Dist', stateCode: '27' }).returning({ id: schema.supplier.id }).get().id;
  const customerId = db.insert(schema.customer).values({ name: 'Cust', phone: '9999999999', creditLimitPaise: 100000 }).returning({ id: schema.customer.id }).get().id;
  const owner: Ctx = { ...SYSTEM_CTX, userId: ownerId, username: 'owner', role: 'owner' };
  const clerk: Ctx = { ...SYSTEM_CTX, userId: clerkId, username: 'clerk', role: 'clerk', name: 'Clerk' };
  const duty = { userId: pharmacistId, name: 'Pharmacist', regNo: 'RP-2' };
  return { db, sqlite, owner, clerk, duty, supplierId, customerId, pharmacistId };
}

export function seedItem(db: DB, ownerCtx: Ctx, o: { name: string; generic: string; schedule?: 'NONE' | 'H' | 'H1' | 'X'; gst?: number; unitsPerPack?: number; mrp: number; rate: number; packs: number; expiryDays?: number; supplierId: number; batchNo?: string }) {
  const itemId = insertItem(db, { name: o.name, form: 'tablet', manufacturer: 'Mfr', salts: parseGenericString(o.generic), hsn: '3004', gstRatePct: o.gst ?? 5, schedule: o.schedule ?? 'NONE', scheduleEffectiveFrom: null, baseUnit: 'tablet', unitsPerPack: o.unitsPerPack ?? 10, packName: 'strip', packsPerBox: null, allowLoose: true, rack: 'A1', minStockUnits: 0, maxStockUnits: 0, reorderQtyPacks: 0, ean: null, coldChain: false, notForSale: false, narcotic: false, active: true, notes: null });
  const [batchId] = addOpeningStock(db, ownerCtx, [{ itemId, batchNo: o.batchNo ?? 'B1', expiryDate: addDays(todayIST(), o.expiryDays ?? 365), mrpPaise: o.mrp, purchaseRatePaise: o.rate, qtyUnits: o.packs * (o.unitsPerPack ?? 10), supplierId: o.supplierId, gtin: null, mfgDate: null }]);
  return { itemId, batchId: batchId! };
}
