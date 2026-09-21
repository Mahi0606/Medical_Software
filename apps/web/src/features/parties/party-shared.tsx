import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { PAYMENT_MODES, partyPaymentSchema } from '@pharma/shared';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { formatDateIN, rupees, todayIST } from '@/lib/utils';
import { Button, Callout, Dialog, EmptyState, Field, Input, Money, MoneyInput, NativeSelect, Textarea } from '@/components/ui';

export type PartyType = 'supplier' | 'customer';

export interface LedgerRow { id: number; date: string; docType: string; docId: number | null; docNo: string | null; debitPaise: number; creditPaise: number; note: string | null; balancePaise: number }
export interface PaymentRow { id: number; date: string; mode: string; amountPaise: number; reference: string | null; note: string | null; createdAt: string }

export const MODE_LABELS: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', credit: 'Credit', other: 'Other' };

const SUPPLIER_DOC: Record<string, string> = { PURCHASE: 'Receipt', PURCHASE_RETURN: 'Return', PAYMENT: 'Payment', PURCHASE_CANCEL: 'Receipt cancelled' };
const CUSTOMER_DOC: Record<string, string> = { SALE: 'Credit bill', RECEIPT: 'Payment received', SALE_RETURN: 'Credit note', SALE_CANCEL: 'Bill cancelled' };

export function docTypeLabel(party: PartyType, docType: string): string {
  const map = party === 'supplier' ? SUPPLIER_DOC : CUSTOMER_DOC;
  return map[docType] ?? docType.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** Key/value line inside a detail panel. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:gap-3">
      <dt className="text-sm text-text-2 sm:w-36 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 text-sm text-text">{children ?? <span className="text-text-3">—</span>}</dd>
    </div>
  );
}

/** Ledger with running balance. Column wording avoids accounting jargon. */
export function LedgerTable({ party, rows }: { party: PartyType; rows: LedgerRow[] }) {
  if (!rows.length) return <EmptyState title="No entries yet">{party === 'supplier' ? 'Receipts on credit and payments will appear here.' : 'Credit bills and payments received will appear here.'}</EmptyState>;
  const plus = party === 'supplier' ? 'We owe (+)' : 'Customer owes (+)';
  const minus = party === 'supplier' ? 'Paid / returned (−)' : 'Paid / credited (−)';
  const ordered = [...rows].reverse();
  return (
    <div className="table-wrap">
      <table className="tbl dense">
        <thead><tr><th scope="col">Date</th><th scope="col">Entry</th><th scope="col" className="num">{plus}</th><th scope="col" className="num">{minus}</th><th scope="col" className="num">Balance</th></tr></thead>
        <tbody>
          {ordered.map((r) => {
            const add = party === 'supplier' ? r.creditPaise : r.debitPaise;
            const sub = party === 'supplier' ? r.debitPaise : r.creditPaise;
            return (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{formatDateIN(r.date)}</td>
                <td><div className="font-medium">{docTypeLabel(party, r.docType)}{r.docNo && <span className="ml-1 font-normal text-text-2">{r.docNo}</span>}</div>{r.note && <div className="text-xs text-text-2">{r.note}</div>}</td>
                <td className="num">{add > 0 ? <Money paise={add} /> : <span className="text-text-3">—</span>}</td>
                <td className="num">{sub > 0 ? <Money paise={sub} /> : <span className="text-text-3">—</span>}</td>
                <td className="num font-medium"><Money paise={r.balancePaise} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  if (!rows.length) return <EmptyState title="No payments recorded">Use the payment button above to record one.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="tbl dense">
        <thead><tr><th scope="col">Date</th><th scope="col">Mode</th><th scope="col">Reference</th><th scope="col">Note</th><th scope="col" className="num">Amount</th></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id}><td className="whitespace-nowrap">{formatDateIN(p.date)}</td><td>{MODE_LABELS[p.mode] ?? p.mode}</td><td>{p.reference ?? <span className="text-text-3">—</span>}</td><td className="text-text-2">{p.note ?? <span className="text-text-3">—</span>}</td><td className="num"><Money paise={p.amountPaise} /></td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

interface PaymentDialogProps { open: boolean; onOpenChange: (o: boolean) => void; party: PartyType; partyId: number; partyName: string; balancePaise: number; onSaved?: () => void }

/** Record a payment to a supplier or a receipt from a customer. */
export function PaymentDialog({ open, onOpenChange, party, partyId, partyName, balancePaise, onSaved }: PaymentDialogProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const [amountPaise, setAmount] = useState(0);
  const [mode, setMode] = useState<string>('cash');
  const [date, setDate] = useState(todayIST());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [headline, setHeadline] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setAmount(balancePaise > 0 ? balancePaise : 0); setMode('cash'); setDate(todayIST()); setReference(''); setNote(''); setErrors({}); setHeadline(null); }
  }, [open, balancePaise]);

  const save = useMutation({
    mutationFn: (body: unknown) => api.post(`/${party}s/${partyId}/payments`, body),
    onSuccess: () => {
      toast.success(party === 'supplier' ? 'Payment recorded' : 'Payment received', `${rupees(amountPaise)} ${party === 'supplier' ? 'paid to' : 'received from'} ${partyName}`);
      qc.invalidateQueries({ queryKey: [party] });
      qc.invalidateQueries({ queryKey: [`${party}s`] });
      onOpenChange(false);
      onSaved?.();
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) { const fe: Record<string, string> = {}; for (const f of e.fieldErrors) fe[f.path] = f.message; setErrors(fe); setHeadline(e.message); }
      else setHeadline(e instanceof Error ? e.message : 'Could not save the payment');
    },
  });

  const submit = () => {
    const parsed = partyPaymentSchema.safeParse({ amountPaise, mode, date, reference, note });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) fe[i.path.join('.')] = i.message;
      setErrors(fe); setHeadline('Please correct the highlighted fields');
      return;
    }
    setErrors({}); setHeadline(null);
    save.mutate(parsed.data);
  };

  const title = party === 'supplier' ? `Record payment to ${partyName}` : `Receive payment from ${partyName}`;
  const desc = party === 'supplier' ? `Outstanding payable: ${rupees(Math.max(0, balancePaise))}. The ledger balance drops by the amount you enter.` : `Outstanding dues: ${rupees(Math.max(0, balancePaise))}. The customer's dues drop by the amount you enter.`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={desc} size="md"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={submit}>{party === 'supplier' ? 'Save payment' : 'Save receipt'}</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        {headline && <div className="sm:col-span-2"><Callout tone="danger" title={headline} /></div>}
        <Field label="Amount (₹)" required error={errors.amountPaise}>{(id, d) => <MoneyInput id={id} aria-describedby={d} invalid={!!errors.amountPaise} valuePaise={amountPaise} onChangePaise={setAmount} autoFocus />}</Field>
        <Field label="Mode" required error={errors.mode}>{(id, d) => <NativeSelect id={id} aria-describedby={d} value={mode} onChange={(e) => setMode(e.target.value)}>{PAYMENT_MODES.filter((m) => m !== 'credit').map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}</NativeSelect>}</Field>
        <Field label="Date" required error={errors.date}>{(id, d) => <Input id={id} aria-describedby={d} type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} invalid={!!errors.date} />}</Field>
        <Field label="Reference" hint="Cheque no, UPI ref or receipt no" error={errors.reference}>{(id, d) => <Input id={id} aria-describedby={d} value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>
        <Field label="Note" className="sm:col-span-2" error={errors.note}>{(id, d) => <Textarea id={id} aria-describedby={d} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[64px]" />}</Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
