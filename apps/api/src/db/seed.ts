/**
 * Demo / test data for a single Indian retail pharmacy.
 * Run: npm run seed  (safe to re-run: skips if items already exist)
 */
import { desc, eq } from 'drizzle-orm';
import { addDays, saleSchema, todayIST, type ItemInput } from '@pharma/shared';
import { openDatabase, schema } from './index.js';
import { SYSTEM_CTX, type Ctx } from '../lib/ctx.js';
import { hashPassword } from '../lib/password.js';
import { insertItem, parseGenericString } from '../services/catalog.js';
import { addOpeningStock } from '../services/inventory.js';
import { ensureDefaultTemplates } from '../services/labels.js';
import { ensureStarterRules } from '../services/interactions.js';
import { postPurchase } from '../services/purchase.js';
import { postSale } from '../services/sales.js';
import { setDuty, updateStore } from '../services/store.js';

const { db, sqlite } = openDatabase();

function ensureUser(username: string, name: string, role: 'owner' | 'pharmacist' | 'clerk', password: string, regNo?: string) {
  const u = db.select().from(schema.user).where(eq(schema.user.username, username)).get();
  if (u) return u.id;
  return db.insert(schema.user).values({ username, name, role, passwordHash: hashPassword(password), pharmacistRegNo: regNo ?? null }).returning({ id: schema.user.id }).get().id;
}

const ownerId = ensureUser('owner', 'Raman L', 'owner', 'owner1234', 'MH/PH/12345');
const pharmacistId = ensureUser('pharmacist', 'Sneha Kulkarni', 'pharmacist', 'pharma1234', 'MH/PH/67890');
ensureUser('clerk', 'Arjun Patil', 'clerk', 'clerk1234');
const ctx: Ctx = { ...SYSTEM_CTX, userId: ownerId, username: 'owner', name: 'Raman L' };

const store = db.select().from(schema.store).where(eq(schema.store.id, 1)).get()!;
if (!store.setupComplete) {
  updateStore(db, ctx, {
    name: 'Om Medical and General Stores', legalName: 'Om Medicals', addressLine1: 'Shop 4, Sai Plaza, Baner Road', addressLine2: 'Near Baner Bus Stop', city: 'Pune', state: 'Maharashtra', stateCode: '27', pincode: '411045',
    phone: '9820012345', email: 'store@example.com', gstin: '27ABCDE1234F1Z5', gstScheme: 'regular', invoicePrefix: 'INV', pharmacistName: 'Sneha Kulkarni', pharmacistRegNo: 'MH/PH/67890', pharmacistCouncil: 'Maharashtra State Pharmacy Council',
    footerNote: 'Medicines once sold will be taken back only within 7 days with the bill, unopened and unexpired.', upiId: 'ommedicals@upi', printFormat: 'thermal80', nearExpiryDays: 90, maxDiscountPctClerk: 10, maxDiscountPctPharmacist: 20,
  });
  db.insert(schema.licence).values([
    { type: 'FORM_20', number: 'MH-PZ1-123456', issuedBy: 'FDA Maharashtra, Pune Zone 1', issuedOn: '2022-04-12', retentionFeeDue: '2027-04-11' },
    { type: 'FORM_21', number: 'MH-PZ1-123457', issuedBy: 'FDA Maharashtra, Pune Zone 1', issuedOn: '2022-04-12', retentionFeeDue: '2027-04-11' },
    { type: 'FSSAI', number: '21522012001234', issuedBy: 'FSSAI', validTill: addDays(todayIST(), 45) },
  ]).run();
}
ensureDefaultTemplates(db);
ensureStarterRules(db);

const haveItems = db.select({ id: schema.item.id }).from(schema.item).limit(1).get();
if (!haveItems) {
  const suppliers = [
    { name: 'Mahavir Pharma Distributors', phone: '9822011111', gstin: '27AAACM1234A1Z2', drugLicenceNo: '20B-MH-PZ1-4455', address: 'Bhawani Peth, Pune', city: 'Pune', stateCode: '27', creditDays: 21 },
    { name: 'Shree Medico Agencies', phone: '9822022222', gstin: '27AABCS5678B1Z9', drugLicenceNo: '20B-MH-PZ1-5566', address: 'Raviwar Peth, Pune', city: 'Pune', stateCode: '27', creditDays: 15 },
    { name: 'Wellness Pharma (Bengaluru)', phone: '9880033333', gstin: '29AACCW9012C1Z4', drugLicenceNo: '20B-KA-BLR-7788', address: 'Chickpet, Bengaluru', city: 'Bengaluru', stateCode: '29', creditDays: 30 },
  ];
  const supplierIds = suppliers.map((s) => db.insert(schema.supplier).values(s).returning({ id: schema.supplier.id }).get().id);
  db.insert(schema.doctor).values([
    { name: 'Dr. Anil Deshmukh', regNo: 'MMC/2009/04567', council: 'Maharashtra Medical Council', qualification: 'MBBS, MD', address: 'Deshmukh Clinic, Aundh, Pune' },
    { name: 'Dr. Priya Nair', regNo: 'MMC/2015/11234', council: 'Maharashtra Medical Council', qualification: 'MBBS, DNB (Paed)', address: 'Little Steps Clinic, Baner, Pune' },
  ]).run();
  db.insert(schema.customer).values([
    { name: 'Suresh Iyer', phone: '9876543210', address: '12, Rohan Mithila, Viman Nagar, Pune', creditLimitPaise: 500000 },
    { name: 'Meera Joshi', phone: '9876501234', address: 'Flat 302, Kumar Paradise, Baner, Pune', creditLimitPaise: 200000 },
    { name: 'Farhan Shaikh', phone: '9822098220', address: 'Kondhwa, Pune' },
  ]).run();

  type Row = [name: string, generic: string, form: ItemInput['form'], mfr: string, gst: number, schedule: ItemInput['schedule'], unitsPerPack: number, packName: string, baseUnit: string, rack: string, mrp: number, ptr: number, opening: number, expiryMonths: number, ean?: string];
  const rows: Row[] = [
    ['Dolo 650', 'Paracetamol 650 mg', 'tablet', 'Micro Labs', 5, 'NONE', 15, 'strip', 'tablet', 'A1', 33.60, 24.0, 40, 18, '8901234567890'],
    ['Crocin Advance', 'Paracetamol 500 mg', 'tablet', 'GSK', 5, 'NONE', 15, 'strip', 'tablet', 'A1', 30.00, 21.5, 25, 20],
    ['Combiflam', 'Ibuprofen 400 mg + Paracetamol 325 mg', 'tablet', 'Sanofi', 5, 'H', 20, 'strip', 'tablet', 'A2', 45.00, 33.0, 30, 16],
    ['Zerodol SP', 'Aceclofenac 100 mg + Paracetamol 325 mg + Serratiopeptidase 15 mg', 'tablet', 'Ipca', 5, 'H', 10, 'strip', 'tablet', 'A2', 118.00, 82.0, 20, 14],
    ['Meftal Spas', 'Mefenamic acid 250 mg + Dicyclomine 10 mg', 'tablet', 'Blue Cross', 5, 'H', 10, 'strip', 'tablet', 'A2', 52.00, 37.0, 18, 15],
    ['Augmentin 625 Duo', 'Amoxicillin 500 mg + Clavulanic acid 125 mg', 'tablet', 'GSK', 5, 'H', 10, 'strip', 'tablet', 'B1', 223.00, 165.0, 15, 12],
    ['Azithral 500', 'Azithromycin 500 mg', 'tablet', 'Alembic', 5, 'H1', 5, 'strip', 'tablet', 'B1', 119.00, 85.0, 12, 13],
    ['Taxim-O 200', 'Cefixime 200 mg', 'tablet', 'Alkem', 5, 'H1', 10, 'strip', 'tablet', 'B1', 120.00, 88.0, 10, 11],
    ['Ciplox 500', 'Ciprofloxacin 500 mg', 'tablet', 'Cipla', 5, 'H1', 10, 'strip', 'tablet', 'B2', 43.00, 31.0, 10, 17],
    ['Levoflox 500', 'Levofloxacin 500 mg', 'tablet', 'Cipla', 5, 'H1', 5, 'strip', 'tablet', 'B2', 94.00, 68.0, 8, 15],
    ['Ultracet', 'Tramadol 37.5 mg + Paracetamol 325 mg', 'tablet', 'Janssen', 5, 'H1', 15, 'strip', 'tablet', 'C1', 168.00, 122.0, 6, 14],
    ['Restyl 0.5', 'Alprazolam 0.5 mg', 'tablet', 'Cipla', 5, 'H1', 15, 'strip', 'tablet', 'C1', 34.00, 25.0, 6, 16],
    ['Lonazep 0.5', 'Clonazepam 0.5 mg', 'tablet', 'Sun Pharma', 5, 'H1', 15, 'strip', 'tablet', 'C1', 34.00, 25.0, 6, 16],
    ['Pan 40', 'Pantoprazole 40 mg', 'tablet', 'Alkem', 5, 'H', 15, 'strip', 'tablet', 'A3', 165.00, 118.0, 30, 19],
    ['Omez 20', 'Omeprazole 20 mg', 'capsule', 'Dr. Reddys', 5, 'H', 20, 'strip', 'capsule', 'A3', 62.00, 44.0, 20, 18],
    ['Rantac 150', 'Ranitidine 150 mg', 'tablet', 'JB Chemicals', 5, 'H', 30, 'strip', 'tablet', 'A3', 40.00, 28.0, 12, 10],
    ['Digene Gel Mint', 'Magaldrate 400 mg + Simethicone 20 mg per 5 ml', 'syrup', 'Abbott', 12, 'NONE', 1, 'bottle', 'bottle', 'D1', 165.00, 118.0, 10, 14],
    ['Cetzine', 'Cetirizine 10 mg', 'tablet', 'Dr. Reddys', 5, 'H', 10, 'strip', 'tablet', 'A4', 22.00, 15.5, 25, 20],
    ['Allegra 120', 'Fexofenadine 120 mg', 'tablet', 'Sanofi', 5, 'H', 10, 'strip', 'tablet', 'A4', 209.00, 150.0, 10, 18],
    ['Montek LC', 'Montelukast 10 mg + Levocetirizine 5 mg', 'tablet', 'Sun Pharma', 5, 'H', 15, 'strip', 'tablet', 'A4', 249.00, 178.0, 12, 17],
    ['Asthalin Inhaler', 'Salbutamol 100 mcg', 'inhaler', 'Cipla', 5, 'H', 1, 'inhaler', 'inhaler', 'E1', 156.00, 112.0, 6, 22],
    ['Benadryl Syrup', 'Diphenhydramine 14.08 mg + Ammonium chloride 138 mg per 5 ml', 'syrup', 'Kenvue', 12, 'NONE', 1, 'bottle', 'bottle', 'D1', 128.00, 92.0, 8, 12],
    ['Glycomet 500', 'Metformin 500 mg', 'tablet', 'USV', 5, 'H', 20, 'strip', 'tablet', 'F1', 25.00, 17.5, 30, 24],
    ['Glimestar 2', 'Glimepiride 2 mg', 'tablet', 'Mankind', 5, 'H', 15, 'strip', 'tablet', 'F1', 66.00, 47.0, 12, 20],
    ['Telma 40', 'Telmisartan 40 mg', 'tablet', 'Glenmark', 5, 'H', 15, 'strip', 'tablet', 'F2', 178.00, 128.0, 14, 21],
    ['Amlong 5', 'Amlodipine 5 mg', 'tablet', 'Micro Labs', 5, 'H', 15, 'strip', 'tablet', 'F2', 52.00, 37.0, 14, 21],
    ['Ecosprin 75', 'Aspirin 75 mg', 'tablet', 'USV', 5, 'H', 14, 'strip', 'tablet', 'F2', 6.50, 4.6, 40, 20],
    ['Atorva 10', 'Atorvastatin 10 mg', 'tablet', 'Zydus', 5, 'H', 15, 'strip', 'tablet', 'F3', 92.00, 66.0, 12, 22],
    ['Thyronorm 50', 'Levothyroxine 50 mcg', 'tablet', 'Abbott', 5, 'H', 120, 'bottle', 'tablet', 'F3', 165.00, 118.0, 5, 18],
    ['Wysolone 10', 'Prednisolone 10 mg', 'tablet', 'Pfizer', 5, 'H', 15, 'strip', 'tablet', 'C2', 27.00, 19.5, 8, 15],
    ['Human Mixtard 30/70', 'Insulin isophane + regular 40 IU per ml', 'injection', 'Novo Nordisk', 5, 'H', 1, 'vial', 'vial', 'FRIDGE', 168.00, 140.0, 6, 9],
    ['Betadine Ointment', 'Povidone iodine 5 %', 'ointment', 'Win-Medicare', 12, 'NONE', 1, 'tube', 'tube', 'G1', 112.00, 80.0, 10, 24],
    ['Volini Gel 30g', 'Diclofenac 1 % + Linseed oil 3 % + Methyl salicylate 10 % + Menthol 5 %', 'gel', 'Sun Pharma', 12, 'NONE', 1, 'tube', 'tube', 'G1', 165.00, 118.0, 10, 20],
    ['Shelcal 500', 'Calcium carbonate 1250 mg + Vitamin D3 250 IU', 'tablet', 'Torrent', 12, 'NONE', 15, 'strip', 'tablet', 'H1', 118.00, 84.0, 15, 18],
    ['Becosules', 'B-complex + Vitamin C', 'capsule', 'Pfizer', 12, 'NONE', 20, 'strip', 'capsule', 'H1', 50.00, 36.0, 20, 18],
    ['Zincovit', 'Multivitamin + Zinc', 'tablet', 'Apex', 12, 'NONE', 15, 'strip', 'tablet', 'H1', 105.00, 75.0, 15, 18],
    ['Electral Powder', 'ORS WHO formula 21.8 g', 'sachet', 'FDC', 12, 'NONE', 1, 'sachet', 'sachet', 'H2', 22.00, 15.5, 50, 18],
    ['Dettol Antiseptic 125ml', 'Chloroxylenol 4.8 %', 'solution', 'Reckitt', 18, 'NONE', 1, 'bottle', 'bottle', 'H2', 95.00, 70.0, 10, 30],
    ['Otrivin Nasal Spray', 'Xylometazoline 0.1 %', 'spray', 'GSK', 12, 'H', 1, 'bottle', 'bottle', 'E1', 98.00, 70.0, 8, 15],
    ['Glucometer Strips (25)', 'Blood glucose test strips', 'device', 'Accu-Chek', 5, 'NONE', 25, 'box', 'strip', 'J1', 875.00, 640.0, 4, 12],
  ];
  const today = todayIST();
  const opening: Parameters<typeof addOpeningStock>[2] = [];
  rows.forEach((r, idx) => {
    const [name, generic, form, mfr, gst, schedule, unitsPerPack, packName, baseUnit, rack, mrp, ptr, openingPacks, expiryMonths, ean] = r;
    const itemId = insertItem(db, {
      name, form, manufacturer: mfr, salts: parseGenericString(generic), hsn: form === 'device' ? '9027' : '3004', gstRatePct: gst, schedule, scheduleEffectiveFrom: null,
      baseUnit, unitsPerPack, packName, packsPerBox: unitsPerPack > 1 ? 10 : null, allowLoose: unitsPerPack > 1 && form !== 'device', rack, minStockUnits: Math.max(1, Math.round(openingPacks * 0.3)) * unitsPerPack, maxStockUnits: openingPacks * 2 * unitsPerPack, reorderQtyPacks: Math.max(5, openingPacks),
      ean: ean ?? null, coldChain: rack === 'FRIDGE', notForSale: false, narcotic: false, active: true, notes: null,
    });
    const exp = new Date(today); exp.setUTCMonth(exp.getUTCMonth() + expiryMonths);
    const expiryDate = `${exp.getUTCFullYear()}-${String(exp.getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth() + 1, 0)).getUTCDate()).padStart(2, '0')}`;
    opening.push({ itemId, batchNo: `B${String(2400 + idx).padStart(4, '0')}`, expiryDate, mrpPaise: Math.round(mrp * 100), purchaseRatePaise: Math.round(ptr * 100), qtyUnits: openingPacks * unitsPerPack, supplierId: supplierIds[idx % supplierIds.length]!, gtin: ean ?? null, mfgDate: null });
    // Second, older batch for a few items to exercise FEFO, near-expiry and expired states
    if (idx % 6 === 0) {
      const e2 = addDays(today, idx === 0 ? 20 : idx === 6 ? -15 : 75);
      opening.push({ itemId, batchNo: `B${String(1900 + idx).padStart(4, '0')}`, expiryDate: e2, mrpPaise: Math.round(mrp * 100) - (idx === 12 ? 200 : 0), purchaseRatePaise: Math.round(ptr * 100), qtyUnits: 3 * unitsPerPack, supplierId: supplierIds[0]!, gtin: null, mfgDate: null });
    }
  });
  addOpeningStock(db, ctx, opening);

  // One posted purchase (GRN) and two bills so reports have data
  const dolo = db.select({ id: schema.item.id }).from(schema.item).where(eq(schema.item.name, 'Dolo 650')).get()!;
  const pan = db.select({ id: schema.item.id }).from(schema.item).where(eq(schema.item.name, 'Pan 40')).get()!;
  const azi = db.select({ id: schema.item.id }).from(schema.item).where(eq(schema.item.name, 'Azithral 500')).get()!;
  postPurchase(db, ctx, {
    supplierId: supplierIds[0]!, invoiceNo: 'MPD/26-27/8891', invoiceDate: today, receivedDate: today, interstate: false, otherChargesPaise: 0, notes: 'Demo receipt', printLabels: false,
    lines: [
      { itemId: dolo.id, batchNo: 'DLE2451', expiryDate: addDays(today, 540), qtyPacks: 20, freePacks: 2, ratePaise: 2400, discountPct: 5, mrpPaise: 3360, gstRatePct: 5, hsn: '3004', mfgDate: null, schemeNote: '10+1', gtin: '8901234567890' },
      { itemId: pan.id, batchNo: 'PAN7712', expiryDate: addDays(today, 600), qtyPacks: 10, freePacks: 0, ratePaise: 11800, discountPct: 8, mrpPaise: 16500, gstRatePct: 5, hsn: '3004', mfgDate: null, schemeNote: null, gtin: null },
    ],
  });
  setDuty(db, { ...ctx, userId: pharmacistId, username: 'pharmacist', name: 'Sneha Kulkarni', role: 'pharmacist', pharmacistRegNo: 'MH/PH/67890' }, true);
  const duty = { userId: pharmacistId, name: 'Sneha Kulkarni', regNo: 'MH/PH/67890' };
  const doloBatch = db.select({ id: schema.batch.id }).from(schema.batch).where(eq(schema.batch.itemId, dolo.id)).orderBy(schema.batch.expiryDate).get()!;
  const aziBatch = db.select({ id: schema.batch.id }).from(schema.batch).where(eq(schema.batch.itemId, azi.id)).orderBy(desc(schema.batch.expiryDate)).get()!;
  const cust = db.select({ id: schema.customer.id }).from(schema.customer).where(eq(schema.customer.phone, '9876543210')).get()!;
  postSale(db, ctx, saleSchema.parse({ lines: [{ batchId: doloBatch.id, unitMode: 'pack', qty: 2 }], payments: [{ mode: 'cash', amountPaise: 10000 }], clientRef: 'seed-sale-0001' }), duty);
  postSale(db, ctx, saleSchema.parse({
    customerId: cust.id, lines: [{ batchId: aziBatch.id, unitMode: 'pack', qty: 1, discountPct: 5 }, { batchId: doloBatch.id, unitMode: 'unit', qty: 10 }], payments: [{ mode: 'upi', amountPaise: 10000 }],
    rx: { doctorName: 'Dr. Anil Deshmukh', doctorRegNo: 'MMC/2009/04567', patientName: 'Suresh Iyer', patientAddress: '12, Rohan Mithila, Viman Nagar, Pune', prescriptionDate: today }, clientRef: 'seed-sale-0002',
  }), duty);
  console.log(`Seeded ${rows.length} items, ${opening.length} batches, 1 GRN, 2 bills.`);
} else {
  console.log('Items already present; skipped demo data.');
}
console.log('Logins: owner / owner1234 · pharmacist / pharma1234 · clerk / clerk1234');
sqlite.close();
