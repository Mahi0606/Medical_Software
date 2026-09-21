import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { changePasswordSchema } from '@pharma/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Button, Callout, Field, Input } from '@/components/ui';
import { ROLE_LABELS } from './settings-shared';

export function AccountTab() {
  const { user } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [headline, setHeadline] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => api.post('/auth/change-password', body),
    onSuccess: () => { toast.success('Password changed', 'Use the new password next time you sign in.'); setCurrent(''); setNext(''); setConfirm(''); setErrors({}); setHeadline(null); },
    onError: (e: unknown) => {
      if (e instanceof ApiError) { const fe: Record<string, string> = {}; for (const f of e.fieldErrors) fe[f.path] = f.message; setErrors(fe); setHeadline(e.message); }
      else setHeadline(e instanceof Error ? e.message : 'Could not change the password');
    },
  });

  const submit = () => {
    const fe: Record<string, string> = {};
    const parsed = changePasswordSchema.safeParse({ currentPassword: current, newPassword: next });
    if (!parsed.success) for (const i of parsed.error.issues) fe[i.path.join('.')] = i.path[0] === 'newPassword' ? 'At least 8 characters' : 'Enter your current password';
    if (next && confirm !== next) fe.confirm = 'Does not match the new password';
    if (next && current && next === current) fe.newPassword = 'Choose a password different from the current one';
    if (Object.keys(fe).length) { setErrors(fe); setHeadline('Please correct the highlighted fields'); return; }
    setErrors({}); setHeadline(null);
    change.mutate({ currentPassword: current, newPassword: next });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="card space-y-3 p-4">
        <h2 className="text-base font-semibold">Change password</h2>
        <p className="text-sm text-text-2">Signed in as <span className="font-medium text-text">{user?.name}</span> ({user ? ROLE_LABELS[user.role] : ''}).</p>
        {headline && <Callout tone="danger" title={headline} />}
        <Field label="Current password" required error={errors.currentPassword}>{(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="current-password" value={current} invalid={!!errors.currentPassword} onChange={(e) => setCurrent(e.target.value)} />}</Field>
        <Field label="New password" required hint="At least 8 characters. A short phrase you can remember works well." error={errors.newPassword}>{(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={next} invalid={!!errors.newPassword} onChange={(e) => setNext(e.target.value)} />}</Field>
        <Field label="Repeat new password" required error={errors.confirm}>{(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={confirm} invalid={!!errors.confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
        <div className="flex justify-end"><Button type="submit" variant="primary" loading={change.isPending}>Change password</Button></div>
      </form>
      <div className="space-y-3">
        <div className="card p-4">
          <h2 className="text-base font-semibold">Appearance</h2>
          <p className="mt-1 text-sm text-text-2">Light and dark themes are switched from the button in the header. The choice is saved on this device only, so each counter can pick what reads best under its lighting.</p>
        </div>
        <div className="card p-4">
          <h2 className="text-base font-semibold">Pharmacist on duty</h2>
          <p className="mt-1 text-sm text-text-2">Duty is marked from the header indicator, not from settings, so it can be changed quickly at shift handover. Each prescription bill records who was on duty.</p>
        </div>
      </div>
    </div>
  );
}
