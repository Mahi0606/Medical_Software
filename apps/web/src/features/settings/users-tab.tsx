import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ROLES, userCreateSchema, userUpdateSchema, type Role } from '@pharma/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Badge, Button, Callout, EmptyState, Field, Input, NativeSelect, Sheet, Spinner, Switch } from '@/components/ui';
import { applyApiErrors, fieldIds, FormErrorSummary } from './form-utils';
import { ROLE_LABELS } from './settings-shared';

interface User { id: number; name: string; username: string; role: Role; pharmacistRegNo: string | null; phone: string | null; active: boolean; createdAt: string }

export function UsersTab() {
  const { user: me } = useAuth();
  const [editing, setEditing] = useState<User | null | 'new'>(null);
  const list = useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/users') });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Callout tone="accent" className="max-w-3xl flex-1" title="What each role can do">
          <ul className="list-disc space-y-0.5 pl-4">
            <li><span className="font-medium text-text">Owner</span> — everything, including settings, users, backups and finance reports.</li>
            <li><span className="font-medium text-text">Pharmacist</span> — billing including prescription items, purchases, stock, returns and the schedule registers. Needs a registration number.</li>
            <li><span className="font-medium text-text">Clerk</span> — billing (non-prescription items unless a pharmacist is on duty) and customers.</li>
          </ul>
        </Callout>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add user</Button>
      </div>
      <div className="table-wrap">
        {list.isLoading ? <div className="p-6"><Spinner /></div>
          : list.isError ? <div className="p-4"><Callout tone="danger" title="Could not load users">{(list.error as Error).message}</Callout></div>
          : !list.data?.length ? <EmptyState icon={UserRound} title="No users" action={<Button variant="primary" onClick={() => setEditing('new')}>Add a user</Button>} />
          : (
            <table className="tbl dense">
              <thead><tr><th scope="col">Name</th><th scope="col">Username</th><th scope="col">Role</th><th scope="col">Pharmacist reg no</th><th scope="col">Phone</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{list.data.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}{u.id === me?.id && <span className="ml-1 text-xs font-normal text-text-2">(you)</span>}</td>
                  <td className="font-mono text-xs">{u.username}</td>
                  <td>{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td>{u.pharmacistRegNo ?? (u.role === 'pharmacist' ? <Badge tone="warning">Missing</Badge> : <span className="text-text-3">—</span>)}</td>
                  <td>{u.phone ?? <span className="text-text-3">—</span>}</td>
                  <td>{u.active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Deactivated</Badge>}</td>
                  <td className="text-right"><Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`}>Edit</Button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
      </div>
      <p className="text-xs text-text-2">To remove someone's access, edit the user and switch off Active. Their name stays on past bills and the audit log.</p>
      {editing !== null && <UserForm user={editing === 'new' ? null : editing} isSelf={editing !== 'new' && editing.id === me?.id} onClose={() => setEditing(null)} />}
    </div>
  );
}

interface FormValues { name: string; username: string; password?: string; role: Role; pharmacistRegNo: string | null; phone: string | null; active: boolean }
const LABELS: Record<string, string> = { name: 'Name', username: 'Username', password: 'Password', role: 'Role', pharmacistRegNo: 'Pharmacist reg no', phone: 'Phone', active: 'Active' };

function UserForm({ user, isSelf, onClose }: { user: User | null; isSelf: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const idFor = fieldIds('usr');
  const [headline, setHeadline] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError, watch, setValue } = useForm<FormValues>({
    resolver: zodResolver(user ? userUpdateSchema : userCreateSchema),
    defaultValues: { name: user?.name ?? '', username: user?.username ?? '', password: '', role: user?.role ?? 'clerk', pharmacistRegNo: user?.pharmacistRegNo ?? '', phone: user?.phone ?? '', active: user?.active ?? true },
  });
  const role = watch('role');
  const active = watch('active');
  useEffect(() => { if (Object.keys(errors).length) setHeadline((h) => h ?? 'Please correct the highlighted fields'); }, [errors]);
  const save = useMutation({
    mutationFn: (v: FormValues) => (user ? api.put<User>(`/users/${user.id}`, v) : api.post<User>('/users', v)),
    onSuccess: (u) => { toast.success(user ? 'User updated' : 'User added', u.name); qc.invalidateQueries({ queryKey: ['users'] }); onClose(); },
    onError: (e: unknown) => setHeadline(applyApiErrors(e, setError)),
  });
  const onValid = (v: FormValues) => {
    if (role === 'pharmacist' && !(v.pharmacistRegNo ?? '').trim()) { setError('pharmacistRegNo', { message: 'Required for the pharmacist role — it is printed on the H1 register' }); setHeadline('Please correct the highlighted fields'); return; }
    setHeadline(null);
    save.mutate(v);
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={user ? `Edit ${user.name}` : 'Add user'} width="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" form="user-form" type="submit" loading={save.isPending || isSubmitting}>{user ? 'Save changes' : 'Add user'}</Button></>}>
      <form id="user-form" noValidate onSubmit={handleSubmit(onValid, () => setHeadline('Please correct the highlighted fields'))} className="grid gap-3">
        <FormErrorSummary message={headline} errors={errors} idFor={idFor} labels={LABELS} />
        <Field label="Full name" required htmlFor={idFor('name')} hint="Printed on bills as the person who billed" error={errors.name?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.name} autoFocus {...register('name')} />}</Field>
        <Field label="Username" required htmlFor={idFor('username')} hint="3–32 lowercase letters, digits, dot, dash or underscore" error={errors.username?.message}>{(id, d) => <Input id={id} aria-describedby={d} autoCapitalize="none" autoComplete="off" invalid={!!errors.username} {...register('username')} />}</Field>
        <Field label={user ? 'New password' : 'Password'} required={!user} htmlFor={idFor('password')} hint={user ? 'Leave blank to keep the current password' : 'At least 8 characters'} error={errors.password?.message}>{(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password', user ? { setValueAs: (v: string) => (v ? v : undefined) } : {})} />}</Field>
        <Field label="Role" required htmlFor={idFor('role')} error={errors.role?.message}>{(id, d) => <NativeSelect id={id} aria-describedby={d} invalid={!!errors.role} disabled={isSelf} {...register('role')}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</NativeSelect>}</Field>
        {isSelf && <p className="-mt-2 text-xs text-text-2">You cannot change your own role; ask another owner.</p>}
        <Field label="Pharmacist registration number" required={role === 'pharmacist'} htmlFor={idFor('pharmacistRegNo')} hint={role === 'owner' ? 'Fill this if the owner is also a registered pharmacist, so they can be marked on duty' : 'State pharmacy council number; printed on the H1 register'} error={errors.pharmacistRegNo?.message}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.pharmacistRegNo} {...register('pharmacistRegNo')} />}</Field>
        <Field label="Phone" htmlFor={idFor('phone')} error={errors.phone?.message}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" maxLength={10} invalid={!!errors.phone} {...register('phone')} />}</Field>
        {user && <Field label="Active" htmlFor={idFor('active')} hint={isSelf ? 'You cannot deactivate your own account.' : 'Switch off to block sign-in immediately. The user is signed out everywhere.'}>{(id) => <Switch id={id} checked={!!active} disabled={isSelf} onCheckedChange={(v) => setValue('active', v, { shouldDirty: true })} label="Account active" />}</Field>}
      </form>
    </Sheet>
  );
}
