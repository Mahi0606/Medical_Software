import { describe, expect, it } from 'vitest';
import { daysBetween, financialYear, formatDateIN, formatExpiry, parseExpiry } from '../src/dates.js';
import { expiryStatus, sortFefo } from '../src/expiry.js';

describe('expiry parsing', () => {
  it('MM/YY → last day of month', () => expect(parseExpiry('08/27')).toBe('2027-08-31'));
  it('MM/YYYY', () => expect(parseExpiry('02/2028')).toBe('2028-02-29'));
  it('MM-YY and MMYY', () => {
    expect(parseExpiry('11-26')).toBe('2026-11-30');
    expect(parseExpiry('0426')).toBe('2026-04-30');
  });
  it('GS1 YYMMDD with day 00', () => {
    expect(parseExpiry('270800')).toBe('2027-08-31');
    expect(parseExpiry('270815')).toBe('2027-08-15');
  });
  it('DD/MM/YYYY and ISO', () => {
    expect(parseExpiry('15/08/2027')).toBe('2027-08-15');
    expect(parseExpiry('2027-08-15')).toBe('2027-08-15');
  });
  it('rejects invalid', () => {
    expect(parseExpiry('13/27')).toBeNull();
    expect(parseExpiry('abc')).toBeNull();
  });
  it('formats', () => {
    expect(formatExpiry('2027-08-31')).toBe('08/27');
    expect(formatDateIN('2026-09-19')).toBe('19/09/2026');
  });
});

describe('FY and status', () => {
  it('financial year', () => {
    expect(financialYear('2026-09-19')).toBe('2026-27');
    expect(financialYear('2027-03-31')).toBe('2026-27');
    expect(financialYear('2027-04-01')).toBe('2027-28');
  });
  it('days between', () => expect(daysBetween('2026-09-19', '2026-10-19')).toBe(30));
  it('expiry status thresholds', () => {
    const today = '2026-09-19';
    expect(expiryStatus('2026-09-18', today)).toBe('expired');
    expect(expiryStatus('2026-09-19', today)).toBe('critical');
    expect(expiryStatus('2026-11-30', today)).toBe('warning');
    expect(expiryStatus('2027-02-28', today)).toBe('watch');
    expect(expiryStatus('2028-01-31', today)).toBe('ok');
  });
  it('FEFO sorts soonest first and drops expired/empty', () => {
    const today = '2026-09-19';
    const out = sortFefo(
      [
        { id: 1, expiryDate: '2027-01-31', qtyUnits: 5 },
        { id: 2, expiryDate: '2026-08-31', qtyUnits: 5 },
        { id: 3, expiryDate: '2026-12-31', qtyUnits: 0 },
        { id: 4, expiryDate: '2026-10-31', qtyUnits: 2 },
      ],
      today,
    );
    expect(out.map((b) => b.id)).toEqual([4, 1]);
  });
});
