/** Minimal CSV writer for report exports (RFC 4180 quoting). */
export function toCsv(rows: Record<string, unknown>[], columns?: { key: string; label: string; paise?: boolean }[]): string {
  if (!rows.length) return '';
  const cols = columns ?? Object.keys(rows[0]!).map((k) => ({ key: k, label: k, paise: /Paise$/.test(k) }));
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => cols.map((c) => { const v = r[c.key]; return esc(c.paise && typeof v === 'number' ? (v / 100).toFixed(2) : v); }).join(',')).join('\r\n');
  return `﻿${head}\r\n${body}\r\n`;
}
