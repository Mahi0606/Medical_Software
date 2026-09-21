import { fromPaise, type Paise } from './money.js';

const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrNoSymbol = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹12,34,567.89 with Indian lakh/crore grouping. */
export function formatINR(paise: Paise, opts: { symbol?: boolean } = {}): string {
  const v = fromPaise(paise);
  return opts.symbol === false ? inrNoSymbol.format(v) : inrFmt.format(v);
}

export function formatIntIN(n: number): string {
  return intFmt.format(n);
}

/** Compact INR for dashboards: 1.2 L, 3.4 Cr. */
export function formatINRCompact(paise: Paise): string {
  const v = fromPaise(paise);
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return inrFmt.format(v);
}

/** Amount in words (Indian system) for invoices. */
export function amountInWords(paise: Paise): string {
  const rupees = Math.floor(Math.abs(paise) / 100);
  const p = Math.abs(paise) % 100;
  let s = `${numberToWordsIN(rupees)} Rupees`;
  if (p > 0) s += ` and ${numberToWordsIN(p)} Paise`;
  return `${s} Only`;
}

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below100(n: number): string {
  if (n < 20) return ones[n]!;
  return `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`;
}
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${h ? ones[h] + ' Hundred' : ''}${h && r ? ' ' : ''}${r ? below100(r) : ''}`;
}

export function numberToWordsIN(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${numberToWordsIN(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}
