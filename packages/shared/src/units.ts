import { roundHalfUp, type Paise } from './money.js';

/**
 * Pack configuration for an item.
 * - baseUnit: smallest countable unit (tablet, capsule, ml, unit)
 * - unitsPerPack: base units in one sellable pack (10 tablets per strip; 1 for a bottle)
 * - packName: what the pack is called at the counter (strip, bottle, vial, tube, pack)
 * - allowLoose: whether base units may be sold individually
 */
export interface PackConfig {
  baseUnit: string;
  unitsPerPack: number;
  packName: string;
  allowLoose: boolean;
  packsPerBox?: number | null;
}

export type UnitMode = 'pack' | 'unit' | 'box';

export function toBaseUnits(qty: number, mode: UnitMode, pack: PackConfig): number {
  if (!Number.isInteger(qty) || qty < 0) throw new Error('Quantity must be a non-negative integer');
  switch (mode) {
    case 'unit':
      if (!pack.allowLoose && pack.unitsPerPack !== 1) throw new Error('Loose sale not allowed for this item');
      return qty;
    case 'pack':
      return qty * pack.unitsPerPack;
    case 'box':
      return qty * pack.unitsPerPack * (pack.packsPerBox ?? 1);
  }
}

/** Loose unit price = pack MRP / units per pack, rounded half up to a paisa. */
export function loosePricePaise(packPricePaise: Paise, unitsPerPack: number): Paise {
  if (unitsPerPack <= 0) throw new Error('unitsPerPack must be positive');
  return roundHalfUp(packPricePaise / unitsPerPack);
}

export function unitPriceFor(mode: UnitMode, packPricePaise: Paise, pack: PackConfig): Paise {
  switch (mode) {
    case 'pack':
      return packPricePaise;
    case 'unit':
      return loosePricePaise(packPricePaise, pack.unitsPerPack);
    case 'box':
      return packPricePaise * (pack.packsPerBox ?? 1);
  }
}

export interface StockBreakdown {
  packs: number;
  loose: number;
  units: number;
}

export function breakdownStock(units: number, pack: PackConfig): StockBreakdown {
  const packs = Math.floor(units / pack.unitsPerPack);
  return { packs, loose: units - packs * pack.unitsPerPack, units };
}

export function formatStock(units: number, pack: PackConfig): string {
  if (pack.unitsPerPack === 1) return `${units} ${plural(units, pack.packName)}`;
  const { packs, loose } = breakdownStock(units, pack);
  const parts: string[] = [];
  if (packs > 0 || loose === 0) parts.push(`${packs} ${plural(packs, pack.packName)}`);
  if (loose > 0) parts.push(`${loose} ${plural(loose, pack.baseUnit)}`);
  return parts.join(' + ');
}

export function plural(n: number, word: string): string {
  if (n === 1) return word;
  if (/(s|x|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}
