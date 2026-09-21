import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateIN, formatINRCompact, formatIntIN, formatStock, rupees } from '@/lib/utils';
import { Badge, Callout, EmptyState, Money, Spinner, Stat } from '@/components/ui';

interface Analytics {
  asOf: string; months: number;
  monthly: { month: string; salesPaise: number; taxablePaise: number; costPaise: number; marginPaise: number; bills: number; avgBillPaise: number }[];
  topMovers: { itemId: number; name: string; units30: number; units30Prev: number; changePct: number; revenuePaise: number }[];
  slowMovers: { itemId: number; name: string; stockUnits: number; unitsPerPack: number; packName: string; baseUnit: string; valueCostPaise: number; lastSold: string | null }[];
  suppliers: { supplierId: number; name: string; purchasesPaise: number; receipts: number; returnsPaise: number; returnSharePct: number; soldRevenuePaise: number; avgMarginPct: number | null }[];
  paymentMix: { mode: string; amountPaise: number; n: number }[];
  hourOfDay: { hour: number; bills: number }[];
  scheduleShare: { schedule: string; lines: number; netPaise: number; sharePct: number }[];
}

const monthLabel = (ym: string, withYear = false) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1)); return d.toLocaleString('en-IN', { month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }); };
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
/** Axis tick: whole rupees, compact above a lakh. */
const tick = (paise: number) => (paise >= 1e7 ? formatINRCompact(paise) : `₹${formatIntIN(Math.round(paise / 100))}`);
const hourText = (h: number) => `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`;

/** Owner analytics: trend, movers, suppliers, payment mix and busy hours. Self-contained; mount anywhere under the reports page. */
export function AnalyticsPanel({ months = 12 }: { months?: number }) {
  const q = useQuery({ queryKey: ['analytics', months], queryFn: () => api.get<Analytics>('/reports/analytics', { months }), staleTime: 5 * 60_000 });
  if (q.isLoading) return <Spinner label="Working out the numbers" />;
  if (q.error) return <Callout tone="danger" title="Could not load analytics">{(q.error as Error).message}</Callout>;
  const d = q.data!;
  const cur = d.monthly[d.monthly.length - 1]!;
  const prev = d.monthly[d.monthly.length - 2];
  if (d.monthly.every((m) => m.bills === 0)) return <EmptyState icon={BarChart3} title="No sales yet">Trends, top movers and supplier performance appear here once bills are posted.</EmptyState>;
  const marginPct = pct(cur.marginPaise, cur.taxablePaise);
  const delta = (now: number, before: number | undefined) => before && before > 0 ? `${now >= before ? '+' : '−'}${Math.abs(Math.round(((now - before) / before) * 100))}% vs last month` : 'No sales last month';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sales this month" value={rupees(cur.salesPaise)} sub={delta(cur.salesPaise, prev?.salesPaise)} />
        <Stat label="Margin this month" value={`${marginPct}%`} sub={`${rupees(cur.marginPaise)} on ${rupees(cur.taxablePaise)} taxable`} tone={marginPct >= 15 ? 'success' : marginPct >= 8 ? 'neutral' : 'warning'} />
        <Stat label="Average bill" value={rupees(cur.avgBillPaise)} sub={delta(cur.avgBillPaise, prev?.avgBillPaise)} />
        <Stat label="Bills this month" value={cur.bills} sub={delta(cur.bills, prev?.bills)} />
      </div>

      <MonthlyChart monthly={d.monthly} />

      <div className="grid gap-4 xl:grid-cols-2">
        <section aria-labelledby="an-top" className="card min-w-0">
          <div className="flex items-baseline justify-between border-b border-border px-4 py-2"><h3 id="an-top" className="text-sm font-semibold">Top movers, last 30 days</h3><span className="text-xs text-text-2">by revenue · change vs the 30 days before</span></div>
          {d.topMovers.length === 0 ? <EmptyState title="No sales in the last 30 days" /> : (
            <div className="overflow-x-auto"><table className="tbl dense"><thead><tr><th scope="col">Item</th><th scope="col" className="num">Units</th><th scope="col" className="num">Before</th><th scope="col">Change</th><th scope="col" className="num">Revenue</th></tr></thead>
              <tbody>{d.topMovers.map((m) => <tr key={m.itemId}><td><Link to="/items/$id" params={{ id: String(m.itemId) }} className="font-medium text-accent hover:underline">{m.name}</Link></td><td className="num">{m.units30}</td><td className="num text-text-2">{m.units30Prev}</td><td><ChangeBadge pct={m.changePct} /></td><td className="num"><Money paise={m.revenuePaise} /></td></tr>)}</tbody></table></div>
          )}
        </section>
        <section aria-labelledby="an-slow" className="card min-w-0">
          <div className="flex items-baseline justify-between border-b border-border px-4 py-2"><h3 id="an-slow" className="text-sm font-semibold">Slow movers</h3><span className="text-xs text-text-2">in stock, no sale for 60 days · by value</span></div>
          {d.slowMovers.length === 0 ? <EmptyState title="Nothing sitting idle">Every stocked item sold at least once in the last 60 days.</EmptyState> : (
            <div className="overflow-x-auto"><table className="tbl dense"><thead><tr><th scope="col">Item</th><th scope="col" className="num">Stock</th><th scope="col" className="num">At cost</th><th scope="col">Last sold</th></tr></thead>
              <tbody>{d.slowMovers.map((m) => <tr key={m.itemId}><td><Link to="/items/$id" params={{ id: String(m.itemId) }} className="font-medium text-accent hover:underline">{m.name}</Link></td><td className="num">{formatStock(m.stockUnits, { baseUnit: m.baseUnit, unitsPerPack: m.unitsPerPack, packName: m.packName, allowLoose: true })}</td><td className="num"><Money paise={m.valueCostPaise} /></td><td>{m.lastSold ? formatDateIN(m.lastSold) : <span className="text-text-2">Never</span>}</td></tr>)}</tbody></table></div>
          )}
        </section>
      </div>

      <section aria-labelledby="an-sup" className="card min-w-0">
        <div className="flex items-baseline justify-between border-b border-border px-4 py-2"><h3 id="an-sup" className="text-sm font-semibold">Supplier performance, last 12 months</h3><span className="text-xs text-text-2">margin is on their batches you sold</span></div>
        {d.suppliers.length === 0 ? <EmptyState title="No purchases in the last 12 months" /> : (
          <div className="overflow-x-auto"><table className="tbl dense"><thead><tr><th scope="col">Supplier</th><th scope="col" className="num">Purchases</th><th scope="col" className="num">Receipts</th><th scope="col" className="num">Returned</th><th scope="col">Return share</th><th scope="col">Avg margin</th></tr></thead>
            <tbody>{d.suppliers.map((s) => <tr key={s.supplierId}><td className="font-medium">{s.name}</td><td className="num"><Money paise={s.purchasesPaise} /></td><td className="num">{s.receipts}</td><td className="num"><Money paise={s.returnsPaise} /></td><td>{s.purchasesPaise === 0 ? <span className="text-text-2">—</span> : s.returnSharePct >= 5 ? <Badge tone="warning">High · {s.returnSharePct}%</Badge> : <Badge tone="neutral">{s.returnSharePct}%</Badge>}</td><td>{s.avgMarginPct === null ? <span className="text-text-2">No sales yet</span> : s.avgMarginPct < 8 ? <Badge tone="warning">Low · {s.avgMarginPct}%</Badge> : <span className="tabular-nums">{s.avgMarginPct}%</span>}</td></tr>)}</tbody></table></div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <PaymentMix mix={d.paymentMix} />
        <BusyHours hours={d.hourOfDay} />
        <section aria-labelledby="an-sched" className="card p-4">
          <h3 id="an-sched" className="text-sm font-semibold">Scheduled drugs share, last 30 days</h3>
          <p className="mt-0.5 text-xs text-text-2">Share of sales value by drug schedule.</p>
          {d.scheduleShare.length === 0 ? <p className="mt-3 text-sm text-text-2">No sales.</p> : <ul className="mt-3 space-y-2">{d.scheduleShare.map((s) => <li key={s.schedule}><div className="flex justify-between text-sm"><span>{s.schedule === 'NONE' ? 'Not scheduled (OTC)' : `Schedule ${s.schedule}`}</span><span className="tabular-nums">{s.sharePct}% · {rupees(s.netPaise)}</span></div><div className="mt-1 h-2 rounded bg-surface-2" aria-hidden><div className="h-2 rounded bg-accent" style={{ width: `${Math.max(1, s.sharePct)}%` }} /></div></li>)}</ul>}
        </section>
      </div>
    </div>
  );
}

function ChangeBadge({ pct: p }: { pct: number }) {
  if (p > 0) return <Badge tone="success">↑ +{p}%</Badge>;
  if (p < 0) return <Badge tone="warning">↓ {p}%</Badge>;
  return <Badge tone="neutral">→ 0%</Badge>;
}

/** Twelve columns of sales with a thinner, darker margin column inside each. Inline SVG scaled by viewBox; values in the aria-label and per-column tooltips. */
function MonthlyChart({ monthly }: { monthly: Analytics['monthly'] }) {
  const W = 960, H = 240, padL = 56, padR = 12, padT = 20, padB = 32;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(1, ...monthly.map((m) => m.salesPaise));
  const step = niceStep(max / 100);
  const top = Math.ceil(max / 100 / step) * step * 100;
  const ticks = Array.from({ length: Math.round(top / 100 / step) + 1 }, (_, i) => i * step * 100);
  const band = plotW / monthly.length;
  const barW = Math.min(24, band * 0.55);
  const marginW = Math.max(4, barW * 0.4);
  const y = (paise: number) => padT + plotH - (paise / top) * plotH;
  const maxIdx = monthly.reduce((best, m, i) => (m.salesPaise > monthly[best]!.salesPaise ? i : best), 0);
  const label = `Monthly sales and margin, last ${monthly.length} months. ${monthly.map((m) => `${monthLabel(m.month, true)}: sales ${rupees(m.salesPaise)}, margin ${rupees(m.marginPaise)}, ${m.bills} bills`).join('; ')}.`;
  return (
    <section aria-labelledby="an-trend" className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="an-trend" className="text-sm font-semibold">Sales and margin by month</h3>
        <ul className="flex gap-4 text-xs text-text-2" aria-hidden><li className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-accent" />Sales (incl. GST)</li><li className="flex items-center gap-1.5"><span className="inline-block h-3 w-1.5 rounded-sm bg-accent-hover" />Margin</li></ul>
      </div>
      <div className="mt-2 overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full min-w-[640px]" style={{ height: 'auto' }}>
        <title>Sales and margin by month</title>
        {ticks.map((t) => <g key={t}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} /><text x={padL - 8} y={y(t)} dy="0.35em" textAnchor="end" fontSize={11} fill="var(--color-text-3)" style={{ fontVariantNumeric: 'tabular-nums' }}>{t === 0 ? '0' : tick(t)}</text></g>)}
        {monthly.map((m, i) => {
          const cx = padL + band * i + band / 2;
          const sh = Math.max(0, padT + plotH - y(m.salesPaise));
          const mh = Math.max(0, padT + plotH - y(Math.max(0, m.marginPaise)));
          const r = Math.min(4, sh / 2);
          const isLast = i === monthly.length - 1;
          const showLabel = (i === maxIdx || isLast) && m.salesPaise > 0;
          return (
            <g key={m.month}>
              <title>{`${monthLabel(m.month, true)} · Sales ${rupees(m.salesPaise)} · Margin ${rupees(m.marginPaise)} · ${m.bills} bills`}</title>
              <rect x={cx - band / 2} y={padT} width={band} height={plotH} fill="transparent" />
              {sh > 0 && <path d={`M${cx - barW / 2},${padT + plotH} v${-(sh - r)} a${r},${r} 0 0 1 ${r},${-r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${sh - r} z`} fill="var(--color-accent)" />}
              {mh > 0 && <rect x={cx - marginW / 2} y={padT + plotH - mh} width={marginW} height={mh} fill="var(--color-accent-hover)" stroke="var(--color-surface)" strokeWidth={2} />}
              {showLabel && <text x={cx} y={y(m.salesPaise) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-text)" style={{ fontVariantNumeric: 'tabular-nums' }}>{tick(m.salesPaise)}</text>}
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={11} fill={isLast ? 'var(--color-text)' : 'var(--color-text-2)'} fontWeight={isLast ? 600 : 400}>{monthLabel(m.month)}{m.month.endsWith('-01') || i === 0 ? ` ’${m.month.slice(2, 4)}` : ''}</text>
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke="var(--color-border-strong)" strokeWidth={1} />
      </svg></div>
    </section>
  );
}

function niceStep(maxRupees: number) {
  const target = maxRupees / 4;
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, target)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * mag >= target) return f * mag;
  return 10 * mag;
}

function PaymentMix({ mix }: { mix: Analytics['paymentMix'] }) {
  const total = mix.reduce((a, m) => a + m.amountPaise, 0);
  const name: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'On credit (udhaar)', other: 'Other' };
  return (
    <section aria-labelledby="an-pay" className="card p-4">
      <h3 id="an-pay" className="text-sm font-semibold">Payment mix, last 30 days</h3>
      <p className="mt-0.5 text-xs text-text-2">How customers paid, by value.</p>
      {mix.length === 0 ? <p className="mt-3 text-sm text-text-2">No collections.</p> : (
        <ul className="mt-3 space-y-2">{mix.map((m) => { const share = pct(m.amountPaise, total); return <li key={m.mode}><div className="flex justify-between text-sm"><span>{name[m.mode] ?? m.mode}</span><span className="tabular-nums">{share}% · {rupees(m.amountPaise)}</span></div><div className="mt-1 h-2 rounded bg-surface-2" aria-hidden><div className={m.mode === 'credit' ? 'h-2 rounded bg-warning' : 'h-2 rounded bg-accent'} style={{ width: `${Math.max(1, share)}%` }} /></div></li>; })}</ul>
      )}
    </section>
  );
}

function BusyHours({ hours }: { hours: Analytics['hourOfDay'] }) {
  const max = Math.max(1, ...hours.map((h) => h.bills));
  const total = hours.reduce((a, h) => a + h.bills, 0);
  const peak = hours.reduce((b, h) => (h.bills > b.bills ? h : b), hours[0]!);
  const busy = hours.filter((h) => h.bills > 0);
  const first = busy[0]?.hour ?? 8, last = busy[busy.length - 1]?.hour ?? 21;
  const shown = hours.slice(Math.max(0, Math.min(first, 8) - 1), Math.min(24, Math.max(last, 21) + 2));
  const label = `Bills by hour of day, last 30 days. ${busy.map((h) => `${hourText(h.hour)}: ${h.bills}`).join('; ') || 'No bills'}.`;
  return (
    <section aria-labelledby="an-hours" className="card p-4">
      <h3 id="an-hours" className="text-sm font-semibold">Busiest hours, last 30 days</h3>
      <p className="mt-0.5 text-xs text-text-2">{total === 0 ? 'No bills yet.' : <>Peak <strong className="text-text">{hourText(peak.hour)}</strong> with {peak.bills} {peak.bills === 1 ? 'bill' : 'bills'}. Plan staff and lunch breaks around it.</>}</p>
      <div role="img" aria-label={label} className="mt-3">
        <div className="flex h-20 items-end gap-[2px]" aria-hidden>{shown.map((h) => <div key={h.hour} title={`${hourText(h.hour)}: ${h.bills} bills`} className="flex-1 rounded-t-sm bg-accent" style={{ height: `${Math.max(h.bills ? 4 : 1, (h.bills / max) * 100)}%`, opacity: h.bills ? 1 : 0.25 }} />)}</div>
        <div className="mt-1 flex gap-[2px] text-[10px] tabular-nums text-text-3" aria-hidden>{shown.map((h) => <div key={h.hour} className="flex-1 text-center">{h.hour % 3 === 0 ? String(h.hour).padStart(2, '0') : ''}</div>)}</div>
      </div>
    </section>
  );
}
