const IST = 'Asia/Kolkata';

/** Today's date in IST as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * Parses an expiry as printed on Indian packs: MM/YY, MM/YYYY, MM-YY, MMYY,
 * YYYY-MM, YYMMDD (GS1 AI 17, DD may be 00) or a full ISO date.
 * Expiry is taken as the LAST day of the month unless a day is given.
 * Returns ISO YYYY-MM-DD or null.
 */
export function parseExpiry(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    return validIso(+m[1]!, +m[2]!, +m[3]!);
  }
  if ((m = s.match(/^(\d{4})-(\d{1,2})$/))) {
    return monthEnd(+m[1]!, +m[2]!);
  }
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{2}|\d{4})$/))) {
    const mm = +m[1]!;
    const yy = m[2]!.length === 2 ? 2000 + +m[2]! : +m[2]!;
    return monthEnd(yy, mm);
  }
  if ((m = s.match(/^(\d{2})(\d{2})$/))) {
    return monthEnd(2000 + +m[2]!, +m[1]!);
  }
  if ((m = s.match(/^(\d{2})(\d{2})(\d{2})$/))) {
    // GS1 YYMMDD
    const yy = 2000 + +m[1]!;
    const mm = +m[2]!;
    const dd = +m[3]!;
    return dd === 0 ? monthEnd(yy, mm) : validIso(yy, mm, dd);
  }
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/))) {
    // DD/MM/YYYY
    const yy = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    return validIso(yy, +m[2]!, +m[1]!);
  }
  return null;
}

function monthEnd(y: number, m: number): string | null {
  if (m < 1 || m > 12 || y < 2000 || y > 2099) return null;
  return `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}`;
}

function validIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > lastDayOfMonth(y, m)) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** ISO date → MM/YY as printed on packs. */
export function formatExpiry(iso: string): string {
  const [y, m] = iso.split('-');
  return `${m}/${y!.slice(2)}`;
}

/** ISO date → DD/MM/YYYY. */
export function formatDateIN(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTimeIN(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
}

/** Whole days from `fromIso` to `toIso` (negative if in the past). */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + days));
  return d.toISOString().slice(0, 10);
}

/** Indian financial year label for a date, e.g. 2026-09-19 → "2026-27". */
export function financialYear(iso: string): string {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

export function financialYearRange(fy: string): { from: string; to: string } {
  const start = +fy.slice(0, 4);
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}
