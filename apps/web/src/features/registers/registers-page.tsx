import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { BookOpen, Download, Printer, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { financialYear, LICENCE_LABELS, type LicenceType } from '@pharma/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { formatDateIN, formatExpiry, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, EmptyState, Input, NativeSelect, PageHeader, Pagination, Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';

type RegisterKind = 'RX' | 'H1' | 'X';
interface Row { id: number; serialNo: number; date: string; invoiceNo: string; doctorName: string | null; doctorRegNo: string | null; patientName: string | null; patientAddress: string | null; itemName: string; genericName: string | null; manufacturer: string | null; batchNo: string; expiryDate: string; qtyUnits: number; qtyText: string; pharmacistName: string | null; pharmacistRegNo: string | null; prescriptionRef: string | null; saleStatus: string | null; saleId: number | null }
interface ListResp { rows: Row[]; total: number; page: number; pageSize: number; fy: string; fys: string[] }
interface PrintStore { name: string; legalName: string | null; addressLine1: string; addressLine2: string | null; city: string; state: string; pincode: string; phone: string; gstin: string | null; pharmacistName: string | null; pharmacistRegNo: string | null; licences: { id: number; type: string; number: string; validTill: string | null }[] }
interface PrintResp { rows: Row[]; store: PrintStore }

const PAGE_SIZE = 50;
const REGISTERS: { key: RegisterKind; tab: string; title: string; note: string; retention: string }[] = [
  { key: 'RX', tab: 'Prescription register (Rule 65(3))', title: 'Prescription register — Rule 65(3), Drugs Rules 1945', note: 'Rule 65(3) entries for Schedule H/C sales; keep 5 years per PCI regulations', retention: 'Retain for 5 years (PCI Pharmacy Practice Regulations 2015, reg. 6.2).' },
  { key: 'H1', tab: 'Schedule H1 register', title: 'Schedule H1 register — Drugs and Cosmetics Rules, Schedule H1', note: 'Kept for 3 years, open for inspection; entries are written automatically when an H1 medicine is billed and cannot be edited', retention: 'Retain for 3 years and produce for inspection on demand.' },
  { key: 'X', tab: 'Schedule X register', title: 'Schedule X register — Rule 65(5) and Schedule X, Drugs Rules 1945', note: 'Prescription in duplicate, one copy retained 2 years; stock under lock and key', retention: 'Retain the prescription copy and this register for 2 years.' },
];

function isRegister(v: string | undefined): v is RegisterKind { return v === 'RX' || v === 'H1' || v === 'X'; }

export function RegistersPage() {
  const search = useSearch({ from: '/app/registers' });
  const nav = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const register: RegisterKind = isRegister(search.register) ? search.register : 'H1';
  const fy = search.fy ?? financialYear(todayIST());
  const page = search.page ?? 1;
  const [q, setQ] = useState(search.q ?? '');
  const [printData, setPrintData] = useState<PrintResp | null>(null);
  const [printing, setPrinting] = useState(false);
  const meta = REGISTERS.find((r) => r.key === register)!;

  const set = (patch: Partial<typeof search>) => nav({ to: '/registers', search: (s) => ({ ...s, page: 1, ...patch }) });
  const list = useQuery({ queryKey: ['registers', register, fy, search.q, page], queryFn: () => api.get<ListResp>('/registers', { register, fy, q: search.q, page, pageSize: PAGE_SIZE }), placeholderData: (p) => p, enabled: can('register.view') });

  useEffect(() => {
    if (!printData) return;
    const t = setTimeout(() => { window.print(); setPrinting(false); }, 300);
    return () => clearTimeout(t);
  }, [printData]);

  const doPrint = async () => {
    setPrinting(true);
    try { setPrintData(await api.get<PrintResp>('/registers/print', { register, fy })); }
    catch (e) { setPrinting(false); toast.error('Could not prepare the register for printing', (e as Error).message); }
  };

  if (!can('register.view')) return <Callout tone="warning" title="Registers are available to the owner and pharmacists">Ask the owner or the pharmacist on duty if you need a register printed.</Callout>;

  const fys = list.data?.fys?.length ? Array.from(new Set([...list.data.fys, fy])).sort().reverse() : [fy];

  return (
    <div>
      <div className="no-print">
        <PageHeader title="Schedule registers" description="Statutory registers written automatically when prescription medicines are billed. Entries cannot be edited; if a bill is cancelled its entry stays and is marked 'Bill cancelled'."
          actions={<>
            <a href={api.downloadUrl('/registers/export', { register, fy })} download={`register-${register}-${fy}.csv`} className="inline-flex h-11 items-center gap-2 rounded-md border border-transparent px-4 text-sm font-medium text-text-2 hover:bg-surface-2 hover:text-text"><Download className="h-4 w-4" aria-hidden />Export CSV</a>
            <Button variant="primary" icon={<Printer className="h-4 w-4" />} onClick={doPrint} loading={printing}>Print register</Button>
          </>} />

        <Tabs value={register} onValueChange={(v) => set({ register: v })}>
          <TabsList>{REGISTERS.map((r) => <TabsTrigger key={r.key} value={r.key}>{r.tab}</TabsTrigger>)}</TabsList>
          {/* Empty panels keep the triggers' aria-controls valid; the register body renders below for the active tab. */}
          {REGISTERS.map((r) => <TabsContent key={r.key} value={r.key} forceMount className="h-0 overflow-hidden" />)}
        </Tabs>

        <Callout tone={register === 'X' ? 'warning' : 'accent'} className="my-3" title={meta.tab}>{meta.note}.</Callout>

        <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: q || undefined }); }}>
          <label className="text-xs text-text-2">Financial year<NativeSelect dense value={fy} onChange={(e) => set({ fy: e.target.value })} aria-label="Financial year" className="w-36">{fys.map((f) => <option key={f} value={f}>{f}</option>)}</NativeSelect></label>
          <Input dense value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill no, patient, prescriber, drug or batch" aria-label="Search register entries" addonStart={<Search className="h-4 w-4" />} className="w-80" />
          <Button type="submit" size="sm">Search</Button>
        </form>

        <div className="table-wrap">
          {list.isLoading ? <div className="p-6"><Spinner /></div>
            : list.isError ? <div className="p-4"><Callout tone="danger" title="Could not load the register">{(list.error as Error).message}</Callout></div>
            : !list.data?.rows.length ? <EmptyState icon={BookOpen} title={search.q ? 'No entries match' : `No entries in FY ${fy}`}>{search.q ? 'Try the bill number or part of the drug name.' : `Entries appear here automatically when a ${register === 'RX' ? 'Schedule H or C' : `Schedule ${register}`} medicine is billed against a prescription.`}</EmptyState>
            : (
              <table className="tbl dense min-w-[1100px]">
                <thead><tr>
                  <th scope="col" className="num">S.No</th><th scope="col">Date</th><th scope="col">Bill no</th><th scope="col">Prescriber</th><th scope="col">Patient</th><th scope="col">Drug</th><th scope="col">Batch</th><th scope="col">Expiry</th><th scope="col">Quantity</th><th scope="col">Pharmacist</th><th scope="col">Bill status</th>
                </tr></thead>
                <tbody>{list.data.rows.map((r) => <RegisterRow key={r.id} r={r} />)}</tbody>
              </table>
            )}
        </div>
        {list.data && <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-text-2">{meta.retention}</p><Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={(p) => nav({ to: '/registers', search: (s) => ({ ...s, page: p }) })} /></div>}
      </div>

      {printData && <div className="print-only"><RegisterPrint data={printData} title={meta.title} fy={fy} retention={meta.retention} /></div>}
    </div>
  );
}

function RegisterRow({ r }: { r: Row }) {
  const cancelled = r.saleStatus === 'cancelled';
  return (
    <tr data-tone={cancelled ? 'danger' : undefined}>
      <td className="num">{r.serialNo}</td>
      <td className="whitespace-nowrap">{formatDateIN(r.date)}</td>
      <td>{r.saleId ? <Link to="/sales/$id" params={{ id: String(r.saleId) }} className="font-medium text-accent hover:underline">{r.invoiceNo}</Link> : r.invoiceNo}{r.prescriptionRef && <div className="text-[11px] text-text-2">Rx {r.prescriptionRef}</div>}</td>
      <td><div>{r.doctorName ?? <span className="text-text-3">—</span>}</div>{r.doctorRegNo ? <div className="text-[11px] text-text-2">Reg {r.doctorRegNo}</div> : <div className="text-[11px] text-warning">Reg no missing</div>}</td>
      <td><div>{r.patientName ?? <span className="text-text-3">—</span>}</div>{r.patientAddress && <div className="max-w-[180px] truncate text-[11px] text-text-2" title={r.patientAddress}>{r.patientAddress}</div>}</td>
      <td><div className="font-medium">{r.itemName}</div>{r.genericName && <div className="text-[11px] text-text-2">{r.genericName}</div>}{r.manufacturer && <div className="text-[11px] text-text-2">{r.manufacturer}</div>}</td>
      <td className="font-mono text-xs">{r.batchNo}</td>
      <td className="whitespace-nowrap">{formatExpiry(r.expiryDate)}</td>
      <td>{r.qtyText}</td>
      <td><div>{r.pharmacistName ?? <span className="text-text-3">—</span>}</div>{r.pharmacistRegNo && <div className="text-[11px] text-text-2">Reg {r.pharmacistRegNo}</div>}</td>
      <td>{cancelled ? <Badge tone="danger">Bill cancelled</Badge> : <Badge tone="success">Posted</Badge>}</td>
    </tr>
  );
}

function RegisterPrint({ data, title, fy, retention }: { data: PrintResp; title: string; fy: string; retention: string }) {
  const s = data.store;
  const licences = s.licences.filter((l) => l.type !== 'GSTIN' && l.type !== 'FSSAI' && l.type !== 'SHOP_ACT');
  return (
    <div className="register-print">
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        .register-print { font: 10px/1.3 Inter, system-ui, sans-serif; color: #000; }
        .register-print h1 { font-size: 14px; margin: 0 0 2px; }
        .register-print h2 { font-size: 12px; margin: 6px 0 2px; }
        .register-print .hdr { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #000; padding-bottom: 6px; margin-bottom: 6px; }
        .register-print table { width: 100%; border-collapse: collapse; }
        .register-print th, .register-print td { border: 1px solid #000; padding: 3px 4px; vertical-align: top; text-align: left; }
        .register-print th { background: #eee; font-weight: 600; }
        .register-print thead { display: table-header-group; }
        .register-print tr { page-break-inside: avoid; }
        .register-print td.n { text-align: right; font-variant-numeric: tabular-nums; }
        .register-print .sub { color: #333; font-size: 9px; }
        .register-print .cancelled td { text-decoration: line-through; color: #555; }
        .register-print .cancelled td.status { text-decoration: none; font-weight: 600; color: #000; }
        .register-print .foot { margin-top: 8px; display: flex; justify-content: space-between; font-size: 9px; }
      `}</style>
      <div className="hdr">
        <div>
          <h1>{s.name}{s.legalName && s.legalName !== s.name ? ` (${s.legalName})` : ''}</h1>
          <div>{[s.addressLine1, s.addressLine2, s.city, s.state, s.pincode].filter(Boolean).join(', ')}</div>
          <div>Phone {s.phone}{s.gstin ? ` · GSTIN ${s.gstin}` : ''}</div>
          {licences.length > 0 && <div>{licences.map((l) => `${LICENCE_LABELS[l.type as LicenceType] ?? l.type}: ${l.number}`).join(' · ')}</div>}
          {s.pharmacistName && <div>Registered pharmacist: {s.pharmacistName}{s.pharmacistRegNo ? ` (Reg ${s.pharmacistRegNo})` : ''}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2>{title}</h2>
          <div>Financial year {fy}</div>
          <div>{data.rows.length} {data.rows.length === 1 ? 'entry' : 'entries'} · printed {formatDateIN(todayIST())}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>S.No</th><th>Date</th><th>Bill no</th><th>Prescriber &amp; reg no</th><th>Patient &amp; address</th><th>Drug (composition, manufacturer)</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Pharmacist &amp; reg no</th><th>Status</th></tr></thead>
        <tbody>
          {data.rows.map((r) => {
            const cancelled = r.saleStatus === 'cancelled';
            return (
              <tr key={r.id} className={cancelled ? 'cancelled' : undefined}>
                <td className="n">{r.serialNo}</td>
                <td>{formatDateIN(r.date)}</td>
                <td>{r.invoiceNo}{r.prescriptionRef && <div className="sub">Rx {r.prescriptionRef}</div>}</td>
                <td>{r.doctorName ?? '—'}{r.doctorRegNo && <div className="sub">Reg {r.doctorRegNo}</div>}</td>
                <td>{r.patientName ?? '—'}{r.patientAddress && <div className="sub">{r.patientAddress}</div>}</td>
                <td>{r.itemName}{(r.genericName || r.manufacturer) && <div className="sub">{[r.genericName, r.manufacturer].filter(Boolean).join(' · ')}</div>}</td>
                <td>{r.batchNo}</td>
                <td>{formatExpiry(r.expiryDate)}</td>
                <td>{r.qtyText}</td>
                <td>{r.pharmacistName ?? '—'}{r.pharmacistRegNo && <div className="sub">Reg {r.pharmacistRegNo}</div>}</td>
                <td className="status">{cancelled ? 'Bill cancelled' : 'Posted'}</td>
              </tr>
            );
          })}
          {data.rows.length === 0 && <tr><td colSpan={11}>No entries in this financial year.</td></tr>}
        </tbody>
      </table>
      <div className="foot">
        <span>{retention} Entries are system-generated at the time of sale and cannot be altered; cancelled bills remain listed with their status.</span>
        <span>Signature of registered pharmacist: ______________________</span>
      </div>
    </div>
  );
}
