import { describe, expect, it } from 'vitest';
import { GS, buildGs1ElementString, classifyScan, internalBatchCode, parseFreeText, validGtinCheck } from '../src/gs1.js';

describe('scan classification', () => {
  it('internal batch and item codes', () => {
    expect(classifyScan('PB000123')).toEqual({ kind: 'internal_batch', batchId: 123, raw: 'PB000123' });
    expect(classifyScan(internalBatchCode(7))).toMatchObject({ kind: 'internal_batch', batchId: 7 });
    expect(classifyScan('PI000009\r\n')).toMatchObject({ kind: 'internal_item', itemId: 9 });
  });
  it('EAN-13 with valid check digit', () => {
    expect(validGtinCheck('8901030865275')).toBe(true);
    expect(classifyScan('8901030865275')).toMatchObject({ kind: 'gtin', gtin: '08901030865275' });
    expect(classifyScan('8901030865278').kind).not.toBe('gtin');
  });
  it('GS1 DataMatrix with AIM prefix and GS separators', () => {
    const payload = `]d20108901030865275172708001012AB34${GS}21SER123`;
    const r = classifyScan(payload);
    expect(r).toMatchObject({ kind: 'gs1', gtin: '08901030865275', expiry: '2027-08-31', batch: '12AB34', serial: 'SER123' });
  });
  it('GS1 without AIM prefix, batch last', () => {
    const r = classifyScan('01089010308652751727123110LOT-9');
    expect(r).toMatchObject({ kind: 'gs1', batch: 'LOT-9', expiry: '2027-12-31' });
  });
  it('GS1 Digital Link URL', () => {
    const r = classifyScan('https://id.gs1.org/01/08901030865275/10/AB12?17=270800');
    expect(r).toMatchObject({ kind: 'gs1', gtin: '08901030865275', batch: 'AB12', expiry: '2027-08-31' });
  });
  it('Schedule H2 free text QR', () => {
    const txt = 'Brand: Dolo 650\nMfr: Micro Labs\nBatch No: DLE2345\nMfg: 03/2026\nExp: 02/2028\nLic No: KTK/28/2023';
    const r = classifyScan(txt);
    expect(r).toMatchObject({ kind: 'text', batch: 'DLE2345', expiry: '2028-02-29', brand: 'Dolo 650' });
    expect(parseFreeText('B.No. XY123 EXP AUG 2027')).toMatchObject({ batch: 'XY123', expiry: '2027-08-31' });
  });
  it('unknown', () => expect(classifyScan('hello').kind).toBe('unknown'));
  it('builds element strings', () => {
    expect(buildGs1ElementString({ gtin: '8901030865275', batch: 'AB1', expiryIso: '2027-08-31' })).toBe('010890103086527517270831' + '10AB1');
  });
});
