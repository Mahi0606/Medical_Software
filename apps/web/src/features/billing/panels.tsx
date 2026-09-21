import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, FileImage, Phone, QrCode, Trash2, UserPlus, Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { scheduleRequirements, type PaymentMode, type Schedule } from '@pharma/shared';
import { api, ApiError } from '@/lib/api';
import { data } from '@/lib/offline';
import { useToast } from '@/lib/toast';
import { cn, formatDateTimeIN, rupees, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, Combobox, Field, Input, MoneyInput, Sheet, Textarea } from '@/components/ui';
import type { Customer, Payment, Rx } from './billing-state';

// ---------- Customer ----------
export function CustomerBar({ customer, name, phone, onCustomer, onQuick, phoneRef }: { customer: Customer | null; name: string; phone: string; onCustomer: (c: Customer | null) => void; onQuick: (p: { name?: string; phone?: string }) => void; phoneRef: React.RefObject<HTMLInputElement | null> }) {
  const [lookup, setLookup] = useState<'idle' | 'notfound' | 'found'>('idle');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddr, setNewAddr] = useState('');
  const toast = useToast();
  const qc = useQueryClient();
  const find = async (p: string) => {
    if (!/^[6-9]\d{9}$/.test(p)) return;
    const c = (await data.customerByPhone(p)) as Customer | null;
    if (c) { onCustomer(c); setLookup('found'); } else { setLookup('notfound'); }
  };
  const create = useMutation({
    mutationFn: () => api.post<Customer>('/customers', { name: newName, phone, address: newAddr || null }),
    onSuccess: (c) => { onCustomer(c); setAdding(false); setLookup('found'); qc.invalidateQueries({ queryKey: ['customers'] }); toast.success(`${c.name} added`); },
    onError: (e: Error) => toast.error('Could not add customer', e.message),
  });
  if (customer) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-accent-border bg-accent-bg px-3 py-2 text-sm">
        <Phone className="h-4 w-4 text-accent" aria-hidden />
        <div className="min-w-0 flex-1"><span className="font-semibold">{customer.name}</span> <span className="text-text-2">{customer.phone}</span>{customer.balancePaise > 0 && <Badge tone="warning" className="ml-2">Dues {rupees(customer.balancePaise)}</Badge>}</div>
        <Button size="sm" variant="ghost" onClick={() => { onCustomer(null); setLookup('idle'); onQuick({ phone: '' }); setTimeout(() => phoneRef.current?.focus(), 0); }}>Change</Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input ref={phoneRef} dense inputMode="numeric" maxLength={10} placeholder="Customer mobile (optional)" aria-label="Customer mobile number" value={phone} addonStart={<Phone className="h-4 w-4" />}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); onQuick({ phone: v }); setLookup('idle'); if (v.length === 10) void find(v); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void find(phone); } }} />
        <Input dense placeholder="Name (walk-in)" aria-label="Customer name" value={name} onChange={(e) => onQuick({ name: e.target.value })} className="max-w-[45%]" />
      </div>
      {lookup === 'notfound' && !adding && (
        <div className="flex items-center justify-between gap-2 rounded border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-2"><span>No customer with this number.</span><Button size="sm" variant="link" icon={<UserPlus className="h-4 w-4" />} onClick={() => { setAdding(true); setNewName(name); }}>Save as new customer</Button></div>
      )}
      {adding && (
        <div className="space-y-2 rounded border border-border p-3">
          <Field label="Full name" required>{(id) => <Input id={id} dense value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />}</Field>
          <Field label="Address" hint="Needed on Schedule H1/X bills and for credit">{(id) => <Input id={id} dense value={newAddr} onChange={(e) => setNewAddr(e.target.value)} />}</Field>
          <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button size="sm" variant="primary" disabled={!newName.trim()} loading={create.isPending} onClick={() => create.mutate()}>Save customer</Button></div>
        </div>
      )}
    </div>
  );
}

// ---------- Prescription ----------
export function RxPanel({ rx, schedule, missing, onChange, pharmacistOnDuty }: { rx: Rx; schedule: Schedule; missing: string[]; onChange: (p: Partial<Rx>) => void; pharmacistOnDuty: boolean }) {
  const req = scheduleRequirements(schedule);
  const [docQ, setDocQ] = useState('');
  const doctors = useQuery({ queryKey: ['doctors', docQ], queryFn: () => data.doctors(docQ) as Promise<{ id: number; name: string; regNo: string | null; address: string | null }[]> });
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (f: File) => api.upload<{ id: number; filename: string }>('/uploads/prescription', f),
    onSuccess: (r) => onChange({ prescriptionImageId: r.id, prescriptionImageName: r.filename }),
    onError: (e: Error) => toast.error('Upload failed', e.message),
  });
  const needed = (k: keyof typeof req) => !!req[k];
  return (
    <section aria-labelledby="rx-h" className={cn('rounded-md border p-3', schedule !== 'NONE' ? 'border-warning-border bg-warning-bg/40' : 'border-border')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="rx-h" className="text-sm font-semibold">Prescription details {schedule !== 'NONE' && <Badge tone={schedule === 'X' ? 'danger' : 'warning'} className="ml-1">Schedule {schedule}</Badge>}</h3>
        {schedule !== 'NONE' && <span className="text-xs text-text-2">{req.label}</span>}
      </div>
      {schedule !== 'NONE' && !pharmacistOnDuty && <Callout tone="danger" className="mt-2" title="No pharmacist on duty">Schedule {schedule} medicines can only be handed over by or under the supervision of the registered pharmacist. Ask them to mark on duty (top right) before billing.</Callout>}
      {missing.length > 0 && pharmacistOnDuty && <p className="mt-1 text-xs text-warning" role="status">Still needed: {missing.join(', ')}</p>}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Prescriber (doctor)" required={needed('prescriberNameRequired')}>{(id) => (
          <Combobox<number> id={id} dense placeholder="Search or add doctor" value={rx.doctorId} onSearch={setDocQ} allowClear
            options={(doctors.data ?? []).map((d) => ({ value: d.id, label: d.name, description: d.regNo ?? 'No registration no. on file', keywords: d.regNo ?? '' }))}
            onChange={(v, opt) => { const d = doctors.data?.find((x) => x.id === v); onChange({ doctorId: v, doctorName: opt?.label ?? '', doctorRegNo: d?.regNo ?? rx.doctorRegNo }); }}
            onCreate={(name) => onChange({ doctorId: null, doctorName: name })} createLabel={(q) => `Use “${q}” (added on save)`} />
        )}</Field>
        <Field label="Prescriber registration no." required={needed('prescriberRegNoRequired')} hint={schedule === 'H1' || schedule === 'X' ? 'Mandatory in the register' : undefined}>{(id) => <Input id={id} dense value={rx.doctorRegNo} onChange={(e) => onChange({ doctorRegNo: e.target.value })} placeholder="e.g. MMC/2009/04567" />}</Field>
        {!rx.doctorId && rx.doctorName && <p className="text-xs text-text-2 sm:col-span-2">New prescriber “{rx.doctorName}” will be saved with this bill.</p>}
        <Field label="Patient name" required={needed('patientNameRequired')}>{(id) => <Input id={id} dense value={rx.patientName} onChange={(e) => onChange({ patientName: e.target.value })} />}</Field>
        <Field label="Patient age">{(id) => <Input id={id} dense inputMode="numeric" value={rx.patientAge} onChange={(e) => onChange({ patientAge: e.target.value.replace(/\D/g, '').slice(0, 3) })} className="max-w-[120px]" />}</Field>
        <Field label="Patient address" required={needed('patientAddressRequired')} className="sm:col-span-2">{(id) => <Input id={id} dense value={rx.patientAddress} onChange={(e) => onChange({ patientAddress: e.target.value })} />}</Field>
        <Field label="Prescription date">{(id) => <Input id={id} dense type="date" max={todayIST()} value={rx.prescriptionDate} onChange={(e) => onChange({ prescriptionDate: e.target.value })} />}</Field>
        <Field label="Prescription ref. / notes">{(id) => <Input id={id} dense value={rx.prescriptionRef} onChange={(e) => onChange({ prescriptionRef: e.target.value })} placeholder="e.g. Rx no., repeats allowed" />}</Field>
        <Field label="Days of supply" hint="Sets the refill reminder date">{(id) => <Input id={id} dense inputMode="numeric" value={rx.refillDays} onChange={(e) => onChange({ refillDays: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="e.g. 30" className="max-w-[120px]" />}</Field>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" id="rx-file" aria-label="Prescription image file" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }} />
          <Button size="sm" icon={<FileImage className="h-4 w-4" />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>{rx.prescriptionImageId ? 'Replace prescription image' : 'Attach prescription image'}</Button>
          {rx.prescriptionImageName && <span className="text-xs text-text-2">Attached: {rx.prescriptionImageName}</span>}
          {req.duplicateRxRetained && <span className="text-xs font-medium text-danger">Schedule X: retain one copy of the prescription for 2 years.</span>}
        </div>
      </div>
    </section>
  );
}

// ---------- Payments ----------
const MODES: { mode: PaymentMode; label: string; icon: typeof Banknote; kbd?: string }[] = [
  { mode: 'cash', label: 'Cash', icon: Banknote, kbd: 'F7' }, { mode: 'upi', label: 'UPI', icon: QrCode, kbd: 'F8' }, { mode: 'card', label: 'Card', icon: CreditCard }, { mode: 'other', label: 'Other', icon: Wallet },
];
export function PaymentPanel({ payments, totalPaise, tendered, change, credit, hasCustomer, onChange, firstRef }: { payments: Payment[]; totalPaise: number; tendered: number; change: number; credit: number; hasCustomer: boolean; onChange: (p: Payment[]) => void; firstRef: React.RefObject<HTMLInputElement | null> }) {
  const set = (mode: PaymentMode, amountPaise: number) => {
    const others = payments.filter((p) => p.mode !== mode);
    onChange(amountPaise > 0 || mode === 'cash' ? [...others, { mode, amountPaise, reference: payments.find((p) => p.mode === mode)?.reference ?? '' }] : others);
  };
  const remaining = Math.max(0, totalPaise - payments.filter((p) => p.mode !== 'cash').reduce((a, p) => a + p.amountPaise, 0));
  return (
    <section aria-labelledby="pay-h" className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between"><h3 id="pay-h" className="text-sm font-semibold">Payment</h3><span className="text-xs text-text-2">Click a mode to take the full balance</span></div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MODES.map(({ mode, label, icon: Icon, kbd }) => {
          const p = payments.find((x) => x.mode === mode);
          return (
            <div key={mode} className={cn('rounded-md border p-2', p && p.amountPaise > 0 ? 'border-accent bg-accent-bg/50' : 'border-border')}>
              <button type="button" onClick={() => set(mode, mode === 'cash' ? Math.max(remaining, 0) : remaining)} className="flex w-full items-center gap-1.5 text-left text-sm font-medium"><Icon className="h-4 w-4 text-text-2" aria-hidden />{label}{kbd && <span className="kbd ml-auto">{kbd}</span>}</button>
              <MoneyInput ref={mode === 'cash' ? firstRef : undefined} dense aria-label={`${label} amount`} valuePaise={p?.amountPaise ?? 0} onChangePaise={(v) => set(mode, v)} placeholder="0.00" className="mt-1" />
              {mode !== 'cash' && p && p.amountPaise > 0 && <Input dense className="mt-1" placeholder={mode === 'upi' ? 'UPI ref (optional)' : 'Reference'} aria-label={`${label} reference`} value={p.reference} onChange={(e) => onChange(payments.map((x) => (x.mode === mode ? { ...x, reference: e.target.value } : x)))} />}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-text-2">Tendered <span className="font-medium text-text">{rupees(tendered)}</span></span>
        {change > 0 && <span className="rounded bg-success-bg px-2 py-0.5 font-semibold text-success">Change to return {rupees(change)}</span>}
        {credit > 0 && (hasCustomer ? <span className="rounded bg-warning-bg px-2 py-0.5 font-semibold text-warning">On credit {rupees(credit)}</span> : <span className="rounded bg-danger-bg px-2 py-0.5 font-medium text-danger">Unpaid {rupees(credit)} · add a customer to allow credit</span>)}
      </div>
    </section>
  );
}

// ---------- Holds / drafts ----------
export interface HoldRow { id?: number; clientRef: string; label: string | null; createdAt?: string; updatedAt?: number; userName?: string | null; payload: unknown; source: 'server' | 'local' }
export function HoldsSheet({ open, onOpenChange, holds, onResume, onDelete }: { open: boolean; onOpenChange: (o: boolean) => void; holds: HoldRow[]; onResume: (h: HoldRow) => void; onDelete: (h: HoldRow) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Held bills" description="Bills parked while the customer fetches money or a prescription. Held bills do not reserve stock." width="sm">
      {holds.length === 0 ? <p className="text-sm text-text-2">Nothing on hold.</p> : (
        <ul className="divide-y divide-border">{holds.map((h) => {
          const lines = (h.payload as { lines?: unknown[] })?.lines?.length ?? 0;
          return (
            <li key={h.clientRef} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{h.label || 'Untitled'}</p><p className="text-xs text-text-2">{lines} {lines === 1 ? 'item' : 'items'} · {h.createdAt ? formatDateTimeIN(h.createdAt) : h.updatedAt ? formatDateTimeIN(new Date(h.updatedAt)) : ''}{h.userName && ` · ${h.userName}`}{h.source === 'local' && ' · saved on this device'}</p></div>
              <Button size="sm" variant="primary" onClick={() => onResume(h)}>Resume</Button>
              <Button size="sm" variant="ghost" aria-label="Discard held bill" onClick={() => onDelete(h)}><Trash2 className="h-4 w-4" /></Button>
            </li>
          );
        })}</ul>
      )}
    </Sheet>
  );
}

// ---------- Price override ----------
export function PriceOverride({ mrpUnitPaise, valuePaise, reason, onChange }: { mrpUnitPaise: number; valuePaise: number | null; reason: string | null; onChange: (p: { unitPricePaise: number | null; priceReason: string | null }) => void }) {
  const [v, setV] = useState(valuePaise ?? mrpUnitPaise);
  const [r, setR] = useState(reason ?? '');
  useEffect(() => { setV(valuePaise ?? mrpUnitPaise); }, [valuePaise, mrpUnitPaise]);
  const below = v < mrpUnitPaise;
  return (
    <div className="space-y-2 rounded border border-border bg-surface-2 p-2 text-xs">
      <div className="flex items-center gap-2"><span className="w-24 text-text-2">Rate (max MRP {rupees(mrpUnitPaise)})</span><MoneyInput dense aria-label="Selling rate" valuePaise={v} onChangePaise={(p) => setV(Math.min(p, mrpUnitPaise))} className="max-w-[140px]" /></div>
      {below && <div className="flex items-center gap-2"><span className="w-24 text-text-2">Reason</span><Textarea aria-label="Reason for selling below MRP" className="min-h-[40px] text-sm" value={r} onChange={(e) => setR(e.target.value)} placeholder="e.g. NPPA ceiling revised, scheme price" /></div>}
      <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => onChange({ unitPricePaise: null, priceReason: null })}>Reset to MRP</Button><Button size="sm" variant="primary" disabled={below && !r.trim()} onClick={() => onChange({ unitPricePaise: v === mrpUnitPaise ? null : v, priceReason: below ? r.trim() : null })}>Apply</Button></div>
    </div>
  );
}

export function describeApiError(e: unknown): { title: string; detail?: string; fields?: { path: string; message: string }[] } {
  if (e instanceof ApiError) return { title: e.message, fields: e.fieldErrors, detail: Array.isArray(e.details) ? undefined : (e.details as { missing?: string[] } | null)?.missing?.join(', ') };
  return { title: (e as Error).message };
}
