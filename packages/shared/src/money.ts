/** All money is stored and computed as integer paise. */
export type Paise = number;

/** Round half away from zero to an integer (paise). */
export function roundHalfUp(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(n) + 0.5);
}

export function toPaise(rupees: number | string): Paise {
  const n = typeof rupees === 'string' ? Number(rupees.replace(/[^0-9.-]/g, '')) : rupees;
  if (!Number.isFinite(n)) throw new Error(`Invalid rupee amount: ${rupees}`);
  return roundHalfUp(n * 100);
}

export function fromPaise(p: Paise): number {
  return p / 100;
}

/** Percentage of an amount, in paise, rounded half up. */
export function pct(amountPaise: Paise, percent: number): Paise {
  return roundHalfUp((amountPaise * percent) / 100);
}

/**
 * GST invoices are conventionally rounded to the nearest rupee with a
 * "Round off" line. Returns the rounded total and the signed adjustment.
 */
export function roundToRupee(totalPaise: Paise): { roundedPaise: Paise; roundOffPaise: Paise } {
  const roundedPaise = roundHalfUp(totalPaise / 100) * 100;
  return { roundedPaise, roundOffPaise: roundedPaise - totalPaise };
}

export function sumPaise(values: Iterable<Paise>): Paise {
  let s = 0;
  for (const v of values) s += v;
  return s;
}
