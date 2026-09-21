import { describe, expect, it } from 'vitest';
import { amountInWords, formatINR, formatINRCompact } from '../src/format.js';
import { displayGenericName, formatStrength, tallMan } from '../src/drugname.js';
import { missingRxFields, strictestSchedule } from '../src/schedule.js';
import { itemSchema, saleSchema } from '../src/schemas/index.js';

describe('formatting', () => {
  it('Indian grouping', () => {
    expect(formatINR(123456789)).toBe('₹12,34,567.89');
    expect(formatINR(50, { symbol: false })).toBe('0.50');
    expect(formatINRCompact(12345600)).toBe('₹1.23 L');
  });
  it('amount in words', () => {
    expect(amountInWords(123456)).toBe('One Thousand Two Hundred Thirty Four Rupees and Fifty Six Paise Only');
    expect(amountInWords(10000000)).toBe('One Lakh Rupees Only');
  });
});

describe('drug names', () => {
  it('tall man', () => {
    expect(tallMan('Metformin')).toBe('metFORMIN');
    expect(tallMan('paracetamol')).toBe('paracetamol');
  });
  it('strength without trailing zeros', () => {
    expect(formatStrength(500.0, 'mg')).toBe('500 mg');
    expect(formatStrength('0.5', 'mg')).toBe('0.5 mg');
    expect(displayGenericName([{ salt: 'Amoxicillin', strength: 500, unit: 'mg' }, { salt: 'Clavulanic acid', strength: 125, unit: 'mg' }])).toBe('Amoxicillin 500 mg + Clavulanic acid 125 mg');
  });
});

describe('schedule gating', () => {
  it('strictest wins', () => expect(strictestSchedule(['NONE', 'H', 'H1', 'G'])).toBe('H1'));
  it('H1 requires prescriber reg no and patient address', () => {
    const missing = missingRxFields('H1', { doctorName: 'Dr A', patientName: 'P' }, true);
    expect(missing).toEqual(["Prescriber's registration number", "Patient's address"]);
  });
  it('H requires pharmacist on duty', () => {
    expect(missingRxFields('H', { doctorName: 'Dr A', patientName: 'P' }, false)).toEqual(['A registered pharmacist must be on duty']);
    expect(missingRxFields('NONE', {}, false)).toEqual([]);
  });
});

describe('schemas', () => {
  it('item defaults', () => {
    const item = itemSchema.parse({ name: 'Dolo 650', gstRatePct: 5, salts: [{ salt: 'Paracetamol', strength: 650, unit: 'mg' }] });
    expect(item.unitsPerPack).toBe(10);
    expect(item.schedule).toBe('NONE');
  });
  it('sale requires lines and clientRef', () => {
    expect(() => saleSchema.parse({ lines: [], clientRef: 'abc' })).toThrow();
    const s = saleSchema.parse({ lines: [{ batchId: 1, unitMode: 'pack', qty: 2 }], clientRef: 'client-ref-0001' });
    expect(s.payments).toEqual([]);
    expect(s.counter).toBe('C1');
  });
});
