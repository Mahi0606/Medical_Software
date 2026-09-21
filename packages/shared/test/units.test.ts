import { describe, expect, it } from 'vitest';
import { breakdownStock, formatStock, loosePricePaise, toBaseUnits, unitPriceFor } from '../src/units.js';

const strip = { baseUnit: 'tablet', unitsPerPack: 10, packName: 'strip', allowLoose: true, packsPerBox: 10 };
const bottle = { baseUnit: 'bottle', unitsPerPack: 1, packName: 'bottle', allowLoose: false };

describe('units', () => {
  it('converts strips and boxes to base units', () => {
    expect(toBaseUnits(3, 'pack', strip)).toBe(30);
    expect(toBaseUnits(2, 'box', strip)).toBe(200);
    expect(toBaseUnits(4, 'unit', strip)).toBe(4);
  });
  it('rejects loose sale when not allowed', () => {
    expect(() => toBaseUnits(1, 'unit', { ...strip, allowLoose: false })).toThrow();
    expect(toBaseUnits(1, 'unit', bottle)).toBe(1);
  });
  it('computes loose price rounded half up', () => {
    expect(loosePricePaise(2000, 10)).toBe(200);
    expect(loosePricePaise(12550, 15)).toBe(837); // 836.67
    expect(unitPriceFor('unit', 12550, { ...strip, unitsPerPack: 15 })).toBe(837);
  });
  it('formats stock', () => {
    expect(breakdownStock(123, strip)).toEqual({ packs: 12, loose: 3, units: 123 });
    expect(formatStock(123, strip)).toBe('12 strips + 3 tablets');
    expect(formatStock(10, strip)).toBe('1 strip');
    expect(formatStock(0, strip)).toBe('0 strips');
    expect(formatStock(2, bottle)).toBe('2 bottles');
  });
});
