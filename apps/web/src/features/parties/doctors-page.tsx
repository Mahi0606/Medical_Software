import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Pencil, Plus, Search, Stethoscope } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { doctorSchema, type DoctorInput } from '@pharma/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Badge, Button, Callout, EmptyState, Field, Input, PageHeader, Sheet, Spinner, Switch, Textarea } from '@/components/ui';
import { applyApiErrors, fieldIds, FormErrorSummary } from './form-utils';

interface Doctor { id: number; name: string; regNo: string | null; council: string | null; qualification: string | null; phone: string | null; address: string | null; active: boolean; createdAt: string }

export function DoctorsPage() {
  const search = useSearch({ from: '/app/doctors' });
  const nav = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState(search.q ?? '');
  const [editing, setEditing] = useState<Doctor | null | 'new'>(null);
  const list = useQuery({ queryKey: ['doctors', search.q], queryFn: () => api.get<Doctor[]>('/doctors', { q: search.q }), placeholderData: (p) => p });
  const set = (patch: Partial<typeof search>) => nav({ to: '/doctors', search: (s) => ({ ...s, ...patch }) });
  const missingReg = (list.data ?? []).filter((d) => !d.regNo).length;

  return (
    <div>
      <PageHeader title="Prescribers" description="Doctors whose prescriptions you dispense. New names typed at billing are added here automatically."
        actions={can('party.write') && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add prescriber</Button>} />

      <Callout tone="accent" className="mb-3" title="Why the registration number matters">
        The Schedule H1 register must record the prescriber's name and registration number for every H1 sale (Drugs Rules, Schedule H1 note). Keeping it here means it fills in automatically at billing.
        {missingReg > 0 && <span className="ml-1 font-medium text-text">{missingReg} {missingReg === 1 ? 'prescriber is' : 'prescribers are'} missing a registration number.</span>}
      </Callout>

      <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: q || undefined }); }}>
        <Input dense value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or registration number" aria-label="Search prescribers" addonStart={<Search className="h-4 w-4" />} className="w-72" />
        <Button type="submit" size="sm">Search</Button>
      </form>

      <div className="table-wrap">
        {list.isLoading ? <div className="p-6"><Spinner /></div>
          : list.isError ? <div className="p-4"><Callout tone="danger" title="Could not load prescribers">{(list.error as Error).message}</Callout></div>
          : !list.data?.length ? <EmptyState icon={Stethoscope} title={search.q ? 'No prescribers match' : 'No prescribers yet'} action={can('party.write') && !search.q ? <Button variant="primary" onClick={() => setEditing('new')}>Add a prescriber</Button> : undefined}>{search.q ? 'Try part of the name or the registration number.' : 'Add the doctors whose prescriptions you see most often, with their registration numbers.'}</EmptyState>
          : (
            <table className="tbl dense">
              <thead><tr><th scope="col">Name</th><th scope="col">Reg no</th><th scope="col">Council</th><th scope="col">Qualification</th><th scope="col">Phone</th>{can('party.write') && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>{list.data.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium">{d.name}</td>
                  <td>{d.regNo ? <span className="font-mono text-xs">{d.regNo}</span> : <Badge tone="warning">Missing</Badge>}</td>
                  <td>{d.council ?? <span className="text-text-3">—</span>}</td>
                  <td>{d.qualification ?? <span className="text-text-3">—</span>}</td>
                  <td>{d.phone ?? <span className="text-text-3">—</span>}</td>
                  {can('party.write') && <td className="text-right"><Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(d)} aria-label={`Edit ${d.name}`}>Edit</Button></td>}
                </tr>
              ))}</tbody>
            </table>
          )}
      </div>
      {list.data && <p className="mt-2 text-xs text-text-2">{list.data.length} {list.data.length === 1 ? 'prescriber' : 'prescribers'}{list.data.length >= 100 && ' shown — search to narrow down'}</p>}

      {editing !== null && <DoctorForm doctor={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const LABELS: Record<string, string> = { name: 'Name', regNo: 'Registration number', council: 'Council', qualification: 'Qualification', phone: 'Phone', address: 'Address', active: 'Active' };

function DoctorForm({ doctor, onClose }: { doctor: Doctor | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const idFor = fieldIds('doc');
  const [headline, setHeadline] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError, watch, setValue } = useForm<DoctorInput>({
    resolver: zodResolver(doctorSchema),
    defaultValues: { name: doctor?.name ?? '', regNo: doctor?.regNo ?? '', council: doctor?.council ?? '', qualification: doctor?.qualification ?? '', phone: doctor?.phone ?? '', address: doctor?.address ?? '', active: doctor?.active ?? true },
  });
  const active = watch('active');
  useEffect(() => { if (Object.keys(errors).length) setHeadline((h) => h ?? 'Please correct the highlighted fields'); }, [errors]);
  const save = useMutation({
    mutationFn: (v: DoctorInput) => (doctor ? api.put<Doctor>(`/doctors/${doctor.id}`, v) : api.post<Doctor>('/doctors', v)),
    onSuccess: (d) => { toast.success(doctor ? 'Prescriber updated' : 'Prescriber added', d.name); qc.invalidateQueries({ queryKey: ['doctors'] }); onClose(); },
    onError: (e: unknown) => setHeadline(applyApiErrors(e, setError)),
  });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={doctor ? `Edit ${doctor.name}` : 'Add prescriber'} width="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" form="doctor-form" type="submit" loading={save.isPending || isSubmitting}>{doctor ? 'Save changes' : 'Add prescriber'}</Button></>}>
      <form id="doctor-form" noValidate onSubmit={handleSubmit((v) => { setHeadline(null); save.mutate(v); }, () => setHeadline('Please correct the highlighted fields'))} className="grid gap-3">
        <FormErrorSummary message={headline} errors={errors} idFor={idFor} labels={LABELS} />
        <Field label="Name" required htmlFor={idFor('name')} hint="As written on the prescription, e.g. Dr. A. Sharma" error={errors.name?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.name} autoFocus {...register('name')} />}</Field>
        <Field label="Registration number" htmlFor={idFor('regNo')} hint="State medical council number; required on the H1 register" error={errors.regNo?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.regNo} {...register('regNo')} />}</Field>
        <Field label="Council" htmlFor={idFor('council')} hint="e.g. Maharashtra Medical Council" error={errors.council?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.council} {...register('council')} />}</Field>
        <Field label="Qualification" htmlFor={idFor('qualification')} hint="e.g. MBBS, MD (Medicine)" error={errors.qualification?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.qualification} {...register('qualification')} />}</Field>
        <Field label="Phone" htmlFor={idFor('phone')} hint="10-digit mobile, for clarifying a prescription" error={errors.phone?.message}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" maxLength={10} invalid={!!errors.phone} {...register('phone')} />}</Field>
        <Field label="Clinic address" htmlFor={idFor('address')} error={errors.address?.message}>{(id, d) => <Textarea id={id} aria-describedby={d} className="min-h-16" invalid={!!errors.address} {...register('address')} />}</Field>
        {doctor && <Field label="Active" htmlFor={idFor('active')} hint="Inactive prescribers are hidden from billing suggestions.">{(id) => <Switch id={id} checked={!!active} onCheckedChange={(v) => setValue('active', v, { shouldDirty: true })} label="Active prescriber" />}</Field>}
      </form>
    </Sheet>
  );
}
