import { computeSaleLine, missingRxFields, roundToRupee, strictestSchedule, unitPriceFor, type PaymentMode, type Schedule } from '@pharma/shared';

export interface CartLine {
  key: string;
  batchId: number; itemId: number; itemName: string; genericText: string; manufacturer: string | null;
  batchNo: string; expiryDate: string; mrpPaise: number; unitsPerPack: number; packName: string; baseUnit: string; allowLoose: boolean;
  schedule: Schedule; gstRatePct: number; availableUnits: number; rack: string | null; purchaseRatePaise: number;
  unitMode: 'pack' | 'unit'; qty: number; discountPct: number; unitPricePaise: number | null; priceReason: string | null;
}
export interface Customer { id: number; name: string; phone: string; address: string | null; gstin: string | null; balancePaise: number; creditLimitPaise: number }
export interface Rx { doctorId: number | null; doctorName: string; doctorRegNo: string; patientName: string; patientAddress: string; patientAge: string; prescriptionDate: string; prescriptionRef: string; prescriptionImageId: number | null; prescriptionImageName: string | null; refillDays: string }
export interface Payment { mode: PaymentMode; amountPaise: number; reference: string }

export interface BillState {
  clientRef: string; lines: CartLine[]; customer: Customer | null; customerName: string; customerPhone: string; customerGstin: string;
  billDiscountPct: number; rx: Rx; payments: Payment[]; notes: string; selectedKey: string | null;
}

export const emptyRx: Rx = { doctorId: null, doctorName: '', doctorRegNo: '', patientName: '', patientAddress: '', patientAge: '', prescriptionDate: '', prescriptionRef: '', prescriptionImageId: null, prescriptionImageName: null, refillDays: '' };

export function newBill(clientRef: string): BillState {
  return { clientRef, lines: [], customer: null, customerName: '', customerPhone: '', customerGstin: '', billDiscountPct: 0, rx: { ...emptyRx }, payments: [], notes: '', selectedKey: null };
}

export type Action =
  | { type: 'reset'; clientRef: string }
  | { type: 'load'; state: BillState }
  | { type: 'addLine'; line: Omit<CartLine, 'key' | 'unitMode' | 'qty' | 'discountPct' | 'unitPricePaise' | 'priceReason'>; unitMode?: 'pack' | 'unit'; qty?: number }
  | { type: 'updateLine'; key: string; patch: Partial<CartLine> }
  | { type: 'removeLine'; key: string }
  | { type: 'select'; key: string | null }
  | { type: 'customer'; customer: Customer | null }
  | { type: 'quickCustomer'; name?: string; phone?: string; gstin?: string }
  | { type: 'billDiscount'; pct: number }
  | { type: 'rx'; patch: Partial<Rx> }
  | { type: 'payments'; payments: Payment[] }
  | { type: 'notes'; notes: string };

export function reducer(s: BillState, a: Action): BillState {
  switch (a.type) {
    case 'reset': return newBill(a.clientRef);
    case 'load': return a.state;
    case 'addLine': {
      const mode = a.unitMode ?? 'pack';
      const existing = s.lines.find((l) => l.batchId === a.line.batchId && l.unitMode === mode);
      if (existing) return { ...s, selectedKey: existing.key, lines: s.lines.map((l) => (l === existing ? { ...l, qty: l.qty + (a.qty ?? 1) } : l)) };
      const key = `${a.line.batchId}-${mode}-${Date.now()}`;
      return { ...s, selectedKey: key, lines: [...s.lines, { ...a.line, key, unitMode: mode, qty: a.qty ?? 1, discountPct: 0, unitPricePaise: null, priceReason: null }] };
    }
    case 'updateLine': return { ...s, lines: s.lines.map((l) => (l.key === a.key ? { ...l, ...a.patch } : l)) };
    case 'removeLine': { const lines = s.lines.filter((l) => l.key !== a.key); return { ...s, lines, selectedKey: s.selectedKey === a.key ? (lines.at(-1)?.key ?? null) : s.selectedKey }; }
    case 'select': return { ...s, selectedKey: a.key };
    case 'customer': return { ...s, customer: a.customer, customerName: a.customer ? '' : s.customerName, customerPhone: a.customer ? '' : s.customerPhone, customerGstin: a.customer?.gstin ?? s.customerGstin };
    case 'quickCustomer': return { ...s, customerName: a.name ?? s.customerName, customerPhone: a.phone ?? s.customerPhone, customerGstin: a.gstin ?? s.customerGstin };
    case 'billDiscount': return { ...s, billDiscountPct: a.pct };
    case 'rx': return { ...s, rx: { ...s.rx, ...a.patch } };
    case 'payments': return { ...s, payments: a.payments };
    case 'notes': return { ...s, notes: a.notes };
  }
}

export interface Totals {
  lines: { key: string; unitPricePaise: number; mrpUnitPaise: number; qtyUnits: number; grossPaise: number; discountPaise: number; netPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; effectiveDiscountPct: number; overStock: boolean; belowCost: boolean }[];
  grossPaise: number; discountPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; netPaise: number; roundOffPaise: number; totalPaise: number;
  paidPaise: number; tenderedPaise: number; changePaise: number; creditPaise: number; schedule: Schedule; missingRx: string[];
}

export function computeTotals(s: BillState, scheme: 'regular' | 'composition', pharmacistOnDuty: boolean): Totals {
  const lines = s.lines.map((l) => {
    const pack = { baseUnit: l.baseUnit, unitsPerPack: l.unitsPerPack, packName: l.packName, allowLoose: l.allowLoose };
    const mrpUnitPaise = unitPriceFor(l.unitMode, l.mrpPaise, pack);
    const unitPricePaise = l.unitPricePaise ?? mrpUnitPaise;
    const effectiveDiscountPct = l.discountPct + s.billDiscountPct - (l.discountPct * s.billDiscountPct) / 100;
    const c = computeSaleLine({ unitPricePaise, qty: l.qty, discountPct: effectiveDiscountPct, gstRatePct: l.gstRatePct, scheme });
    const qtyUnits = l.unitMode === 'unit' ? l.qty : l.qty * l.unitsPerPack;
    const cost = Math.round((l.purchaseRatePaise * qtyUnits) / l.unitsPerPack);
    return { key: l.key, unitPricePaise, mrpUnitPaise, qtyUnits, grossPaise: c.grossPaise, discountPaise: c.discountPaise, netPaise: c.netPaise, taxablePaise: c.taxablePaise, cgstPaise: c.cgstPaise, sgstPaise: c.sgstPaise, effectiveDiscountPct, overStock: qtyUnits > l.availableUnits, belowCost: cost > 0 && c.netPaise < cost };
  });
  const sum = (k: keyof (typeof lines)[number]) => lines.reduce((a, l) => a + (l[k] as number), 0);
  const netPaise = sum('netPaise');
  const { roundedPaise: totalPaise, roundOffPaise } = roundToRupee(netPaise);
  const tenderedPaise = s.payments.reduce((a, p) => a + p.amountPaise, 0);
  const cash = s.payments.find((p) => p.mode === 'cash')?.amountPaise ?? 0;
  const changePaise = Math.max(0, Math.min(cash, tenderedPaise - totalPaise));
  const paidPaise = Math.min(totalPaise, tenderedPaise - changePaise);
  const creditPaise = Math.max(0, totalPaise - paidPaise);
  const schedule = strictestSchedule(s.lines.map((l) => l.schedule));
  const missingRx = missingRxFields(schedule, { doctorName: s.rx.doctorName, doctorRegNo: s.rx.doctorRegNo, patientName: s.rx.patientName, patientAddress: s.rx.patientAddress }, pharmacistOnDuty);
  return { lines, grossPaise: sum('grossPaise'), discountPaise: sum('discountPaise'), taxablePaise: sum('taxablePaise'), cgstPaise: sum('cgstPaise'), sgstPaise: sum('sgstPaise'), netPaise, roundOffPaise, totalPaise, paidPaise, tenderedPaise, changePaise, creditPaise, schedule, missingRx };
}

/** Payload for POST /sales. */
export function toSalePayload(s: BillState, t: Totals, counter = 'C1', interactionOverride: string | null = null) {
  return {
    clientRef: s.clientRef, counter, interactionOverride, refillDays: s.rx.refillDays ? Number(s.rx.refillDays) : null,
    customerId: s.customer?.id ?? null, customerName: s.customerName || null, customerPhone: s.customerPhone || null, customerGstin: s.customerGstin || null,
    billDiscountPct: s.billDiscountPct,
    lines: s.lines.map((l) => { const tl = t.lines.find((x) => x.key === l.key)!; return { batchId: l.batchId, unitMode: l.unitMode, qty: l.qty, discountPct: l.discountPct, unitPricePaise: l.unitPricePaise ?? undefined, priceReason: l.priceReason || null, _mrp: tl.mrpUnitPaise }; }).map(({ _mrp, ...rest }) => rest),
    payments: s.payments.filter((p) => p.amountPaise > 0).map((p) => ({ mode: p.mode, amountPaise: p.amountPaise, reference: p.reference || null })),
    rx: t.schedule === 'NONE' && !s.rx.doctorName && !s.rx.patientName ? undefined : {
      doctorId: s.rx.doctorId, doctorName: s.rx.doctorName || null, doctorRegNo: s.rx.doctorRegNo || null, patientName: s.rx.patientName || null, patientAddress: s.rx.patientAddress || null,
      patientAge: s.rx.patientAge ? Number(s.rx.patientAge) : null, prescriptionDate: s.rx.prescriptionDate || null, prescriptionRef: s.rx.prescriptionRef || null, prescriptionImageId: s.rx.prescriptionImageId,
    },
    notes: s.notes || null,
  };
}
