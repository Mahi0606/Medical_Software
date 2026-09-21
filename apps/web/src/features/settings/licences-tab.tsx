import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileBadge, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { LICENCE_LABELS, LICENCE_TYPES, licenceSchema, type LicenceInput, type LicenceType } from '@pharma/shared';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { daysBetween, formatDateIN, todayIST } from '@/lib/utils';
import { Badge, Button, Callout, ConfirmDialog, EmptyState, Field, Input, NativeSelect, Sheet, Spinner, Textarea } from '@/components/ui';
import { applyApiErrors, fieldIds, FormErrorSummary } from './form-utils';
import type { Licence } from './settings-shared';

function labelFor(type: string) { return LICENCE_LABELS[type as LicenceType] ?? type; }

/** Badge for a due/expiry date: danger when past, warning within 90 days. Text carries the meaning, not just colour. */
function DueBadge({ date, kind }: { date: string | null; kind: 'fee' | 'validity' }) {
  if (!date) return <span className="text-text-3">—</span>;
  const d = daysBetween(todayIST(), date);
  const when = formatDateIN(date);
  if (d < 0) return <Badge tone="danger">{kind === 'fee' ? 'Fee overdue' : 'Expired'} · {when}</Badge>;
  if (d <= 90) return <Badge tone="warning">{kind === 'fee' ? 'Fee due' : 'Expires'} in {d} d · {when}</Badge>;
  return <span>{when}</span>;
}

export function LicencesTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Licence | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Licence | null>(null);
  const list = useQuery({ queryKey: ['licences'], queryFn: () => api.get<Licence[]>('/licences') });
  const del = useMutation({
    mutationFn: (id: number) => api.del(`/licences/${id}`),
    onSuccess: () => { toast.success('Licence removed'); qc.invalidateQueries({ queryKey: ['licences'] }); qc.invalidateQueries({ queryKey: ['store'] }); setDeleting(null); },
    onError: (e: Error) => toast.error('Could not remove the licence', e.message),
  });
  const today = todayIST();
  const dueSoon = (list.data ?? []).filter((l) => [l.retentionFeeDue, l.validTill].some((d) => d && daysBetween(today, d) <= 90));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-text-2">Drug licence numbers are printed on every bill and on the registers. Since 2017 retail drug licences (Form 20/21) are perpetual, but a retention fee is due every 5 years — track that date here so it is never missed.</p>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add licence</Button>
      </div>
      {dueSoon.length > 0 && <Callout tone="warning" title={`${dueSoon.length} ${dueSoon.length === 1 ? 'licence needs' : 'licences need'} attention`}>{dueSoon.map((l) => labelFor(l.type)).join(', ')} — a retention fee or validity date is within 90 days or already past.</Callout>}
      <div className="table-wrap">
        {list.isLoading ? <div className="p-6"><Spinner /></div>
          : list.isError ? <div className="p-4"><Callout tone="danger" title="Could not load licences">{(list.error as Error).message}</Callout></div>
          : !list.data?.length ? <EmptyState icon={FileBadge} title="No licences recorded" action={<Button variant="primary" onClick={() => setEditing('new')}>Add the drug licence</Button>}>Add at least the Form 20 and Form 21 retail licences so their numbers print on bills.</EmptyState>
          : (
            <table className="tbl dense">
              <thead><tr><th scope="col">Licence</th><th scope="col">Number</th><th scope="col">Issued by / on</th><th scope="col">Valid till</th><th scope="col">Retention fee due</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{list.data.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium">{labelFor(l.type)}{l.notes && <div className="text-[11px] font-normal text-text-2">{l.notes}</div>}</td>
                  <td className="font-mono text-xs">{l.number}</td>
                  <td>{l.issuedBy ?? <span className="text-text-3">—</span>}{l.issuedOn && <div className="text-[11px] text-text-2">{formatDateIN(l.issuedOn)}</div>}</td>
                  <td>{l.validTill ? <DueBadge date={l.validTill} kind="validity" /> : <span className="text-text-2">Perpetual</span>}</td>
                  <td><DueBadge date={l.retentionFeeDue} kind="fee" /></td>
                  <td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(l)} aria-label={`Edit ${labelFor(l.type)}`}>Edit</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(l)} aria-label={`Remove ${labelFor(l.type)}`}>Remove</Button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
      </div>
      {editing !== null && <LicenceForm licence={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title={`Remove ${deleting ? labelFor(deleting.type) : 'licence'}?`} confirmLabel="Remove licence" onConfirm={() => deleting && del.mutate(deleting.id)} loading={del.isPending}>
        Number {deleting?.number} will no longer print on bills or registers. Past bills are not changed.
      </ConfirmDialog>
    </div>
  );
}

const LABELS: Record<string, string> = { type: 'Licence type', number: 'Number', issuedBy: 'Issued by', issuedOn: 'Issued on', validTill: 'Valid till', retentionFeeDue: 'Retention fee due', notes: 'Notes' };
const dateOrNull = { setValueAs: (v: string) => (v ? v : null) };

function LicenceForm({ licence, onClose }: { licence: Licence | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const idFor = fieldIds('lic');
  const [headline, setHeadline] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<LicenceInput>({
    resolver: zodResolver(licenceSchema),
    defaultValues: { type: (licence?.type as LicenceType) ?? 'FORM_20', number: licence?.number ?? '', issuedBy: licence?.issuedBy ?? '', issuedOn: licence?.issuedOn ?? null, validTill: licence?.validTill ?? null, retentionFeeDue: licence?.retentionFeeDue ?? null, notes: licence?.notes ?? '' },
  });
  useEffect(() => { if (Object.keys(errors).length) setHeadline((h) => h ?? 'Please correct the highlighted fields'); }, [errors]);
  const save = useMutation({
    mutationFn: (v: LicenceInput) => (licence ? api.put<Licence>(`/licences/${licence.id}`, v) : api.post<Licence>('/licences', v)),
    onSuccess: () => { toast.success(licence ? 'Licence updated' : 'Licence added'); qc.invalidateQueries({ queryKey: ['licences'] }); qc.invalidateQueries({ queryKey: ['store'] }); onClose(); },
    onError: (e: unknown) => setHeadline(applyApiErrors(e, setError)),
  });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={licence ? 'Edit licence' : 'Add licence'} width="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" form="licence-form" type="submit" loading={save.isPending || isSubmitting}>{licence ? 'Save changes' : 'Add licence'}</Button></>}>
      <form id="licence-form" noValidate onSubmit={handleSubmit((v) => { setHeadline(null); save.mutate(v); }, () => setHeadline('Please correct the highlighted fields'))} className="grid gap-3">
        <FormErrorSummary message={headline} errors={errors} idFor={idFor} labels={LABELS} />
        <Field label="Licence type" required htmlFor={idFor('type')} error={errors.type?.message}>{(id, d) => <NativeSelect id={id} aria-describedby={d} invalid={!!errors.type} {...register('type')}>{LICENCE_TYPES.map((t) => <option key={t} value={t}>{LICENCE_LABELS[t]}</option>)}</NativeSelect>}</Field>
        <Field label="Licence number" required htmlFor={idFor('number')} hint="Exactly as printed on the certificate" error={errors.number?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.number} autoFocus {...register('number')} />}</Field>
        <Field label="Issued by" htmlFor={idFor('issuedBy')} hint="e.g. FDA Maharashtra, Pune zone" error={errors.issuedBy?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.issuedBy} {...register('issuedBy')} />}</Field>
        <Field label="Issued on" htmlFor={idFor('issuedOn')} error={errors.issuedOn?.message}>{(id, d) => <Input id={id} aria-describedby={d} type="date" invalid={!!errors.issuedOn} {...register('issuedOn', dateOrNull)} />}</Field>
        <Field label="Valid till" htmlFor={idFor('validTill')} hint="Leave blank for perpetual drug licences; fill for FSSAI, Shop Act and similar" error={errors.validTill?.message}>{(id, d) => <Input id={id} aria-describedby={d} type="date" invalid={!!errors.validTill} {...register('validTill', dateOrNull)} />}</Field>
        <Field label="Retention fee due" htmlFor={idFor('retentionFeeDue')} hint="Since 2017 drug licences are perpetual with a retention fee every 5 years — track the due date here" error={errors.retentionFeeDue?.message}>{(id, d) => <Input id={id} aria-describedby={d} type="date" invalid={!!errors.retentionFeeDue} {...register('retentionFeeDue', dateOrNull)} />}</Field>
        <Field label="Notes" htmlFor={idFor('notes')} error={errors.notes?.message}>{(id, d) => <Textarea id={id} aria-describedby={d} className="min-h-16" invalid={!!errors.notes} {...register('notes')} />}</Field>
      </form>
    </Sheet>
  );
}
