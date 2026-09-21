/** Text helpers shared by the raw printer-language generators. Printer fonts are ASCII/CP437 only. */

const REPLACEMENTS: [RegExp, string][] = [
  [/₹/g, 'Rs.'], [/[·•]/g, '-'], [/[–—−]/g, '-'], [/[‘’‚]/g, "'"], [/[“”„]/g, '"'], [/…/g, '...'], [/×/g, 'x'], [/ /g, ' '],
];

/** Replaces ₹ with "Rs.", common punctuation with ASCII equivalents, strips diacritics and drops anything else non-ASCII. */
export function asciiSafe(input: string): string {
  let s = input;
  for (const [re, to] of REPLACEMENTS) s = s.replace(re, to);
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x20-\x7e]/g, '');
}

/** Rupee amount for printer text: "Rs.1234.50". */
export function rsText(paise: number): string {
  const neg = paise < 0 ? '-' : '';
  return `${neg}Rs.${(Math.abs(paise) / 100).toFixed(2)}`;
}

export function padRight(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}
export function padLeft(s: string, w: number): string {
  return s.length >= w ? s.slice(s.length - w) : ' '.repeat(w - s.length) + s;
}
export function center(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w);
  const left = Math.floor((w - s.length) / 2);
  return ' '.repeat(left) + s;
}

/** Word-wraps to `w` columns; lines after the first get `indent` spaces. Long words are broken. */
export function wrap(text: string, w: number, indent = 0): string[] {
  const out: string[] = [];
  const words = text.split(/\s+/).filter(Boolean);
  let line = '';
  const limit = () => w - (out.length ? indent : 0);
  const flush = () => { if (line) { out.push((out.length ? ' '.repeat(indent) : '') + line); line = ''; } };
  for (let word of words) {
    while (word.length > limit()) {
      const room = limit() - (line ? line.length + 1 : 0);
      if (room >= 4 || !line) { const take = Math.max(1, room); line = line ? `${line} ${word.slice(0, take)}` : word.slice(0, take); word = word.slice(take); }
      flush();
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= limit()) line += ` ${word}`;
    else { flush(); line = word; }
  }
  flush();
  return out.length ? out : [''];
}

/** Left and right text on one line; the left side is truncated when both do not fit. */
export function leftRight(left: string, right: string, w: number): string {
  const room = w - right.length - 1;
  const l = left.length > room ? left.slice(0, Math.max(0, room)) : left;
  return padRight(l, Math.max(0, w - right.length)) + right;
}
