/**
 * Drug-interaction, duplicate-therapy and look-alike checks for a bill.
 * Rules are simple salt pairs (see the starter set in the API seed); matching is by
 * normalised salt name so "Amoxicillin trihydrate" still matches "amoxicillin".
 */
import { hasTallMan, tallMan } from './drugname.js';

export type Severity = 'major' | 'moderate' | 'minor';

export interface InteractionRuleLike { id?: number; saltA: string; saltB: string; severity: Severity; message: string; advice?: string | null }
export interface CartItemLike { itemId: number; name: string; salts: string[]; source?: 'cart' | 'history'; historyDate?: string }

export interface InteractionFinding { kind: 'interaction'; severity: Severity; ruleId?: number; a: CartItemLike; b: CartItemLike; saltA: string; saltB: string; message: string; advice?: string | null }
export interface DuplicateFinding { kind: 'duplicate'; salt: string; items: CartItemLike[] }
export interface LasaFinding { kind: 'lasa'; a: CartItemLike; b: CartItemLike; saltA: string; saltB: string }
export type Finding = InteractionFinding | DuplicateFinding | LasaFinding;

export interface CheckResult { findings: Finding[]; highest: Severity | null; hasMajor: boolean }

export function normSalt(s: string): string {
  return s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** "Amoxicillin 500 mg + Clavulanic acid 125 mg" → ["Amoxicillin", "Clavulanic acid"]. */
export function saltsFromGenericText(generic: string | null | undefined): string[] {
  if (!generic) return [];
  return generic
    .split(/\s*\+\s*/)
    .map((p) => p.replace(/\s*\d+(?:\.\d+)?\s*(mg|mcg|g|ml|iu|%|units?|mmol|meq|lakh iu|million iu)?(\s*(?:per|\/)\s*\d*\s*(?:ml|g|tab|tablet|dose|puff|actuation|drop)s?)?\s*$/i, '').trim())
    .filter(Boolean);
}

export function matchSalt(ruleSalt: string, itemSalt: string): boolean {
  const r = normSalt(ruleSalt);
  const i = normSalt(itemSalt);
  if (!r || !i) return false;
  return i === r || i.startsWith(`${r} `) || i.endsWith(` ${r}`) || i.includes(` ${r} `);
}

const SEV_RANK: Record<Severity, number> = { minor: 1, moderate: 2, major: 3 };

/** Runs all checks. `items` = cart lines (source 'cart') plus optional recent history lines (source 'history'). */
export function checkInteractions(items: CartItemLike[], rules: InteractionRuleLike[]): CheckResult {
  const findings: Finding[] = [];
  const cart = items.filter((i) => (i.source ?? 'cart') === 'cart');
  // 1. Pairwise interactions (cart×cart and cart×history; never history×history)
  const seen = new Set<string>();
  for (let x = 0; x < items.length; x++) {
    for (let y = x + 1; y < items.length; y++) {
      const a = items[x]!, b = items[y]!;
      if (a.itemId === b.itemId) continue;
      if ((a.source ?? 'cart') === 'history' && (b.source ?? 'cart') === 'history') continue;
      for (const rule of rules) {
        for (const sa of a.salts) for (const sb of b.salts) {
          const hit = (matchSalt(rule.saltA, sa) && matchSalt(rule.saltB, sb)) || (matchSalt(rule.saltB, sa) && matchSalt(rule.saltA, sb));
          if (!hit) continue;
          const key = `${rule.saltA}|${rule.saltB}|${Math.min(a.itemId, b.itemId)}|${Math.max(a.itemId, b.itemId)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          findings.push({ kind: 'interaction', severity: rule.severity, ruleId: rule.id, a, b, saltA: sa, saltB: sb, message: rule.message, advice: rule.advice });
        }
      }
    }
  }
  // 2. Duplicate therapy inside the cart (same salt in two different items)
  const bySalt = new Map<string, { salt: string; items: CartItemLike[] }>();
  for (const it of cart) for (const s of it.salts) {
    const k = normSalt(s);
    if (!k) continue;
    const e = bySalt.get(k) ?? { salt: s, items: [] };
    if (!e.items.some((i) => i.itemId === it.itemId)) e.items.push(it);
    bySalt.set(k, e);
  }
  for (const e of bySalt.values()) if (e.items.length > 1) findings.push({ kind: 'duplicate', salt: e.salt, items: e.items });
  // 3. Look-alike / sound-alike: two different Tall Man salts on the same bill
  for (let x = 0; x < cart.length; x++) for (let y = x + 1; y < cart.length; y++) {
    const a = cart[x]!, b = cart[y]!;
    for (const sa of a.salts) for (const sb of b.salts) {
      if (normSalt(sa) !== normSalt(sb) && hasTallMan(sa) && hasTallMan(sb) && similar(normSalt(sa), normSalt(sb))) findings.push({ kind: 'lasa', a, b, saltA: tallMan(sa), saltB: tallMan(sb) });
    }
  }
  const inter = findings.filter((f): f is InteractionFinding => f.kind === 'interaction');
  const highest = inter.length ? inter.reduce<Severity>((h, f) => (SEV_RANK[f.severity] > SEV_RANK[h] ? f.severity : h), 'minor') : null;
  return { findings, highest, hasMajor: inter.some((f) => f.severity === 'major') };
}

/** Same first 3 letters and Levenshtein distance ≤ 3 → worth a second look. */
function similar(a: string, b: string): boolean {
  if (a.slice(0, 3) !== b.slice(0, 3)) return false;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return false;
  const d: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0]!; d[0] = i;
    for (let j = 1; j <= n; j++) { const tmp = d[j]!; d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return d[n]! <= 3;
}
