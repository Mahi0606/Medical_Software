import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Pill } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button, Callout, Field, Input } from '@/components/ui';

export function LoginPage() {
  const { login, store } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try { await login(username.trim(), password); void nav({ to: '/' }); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-page p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6" aria-labelledby="login-title">
        <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-white"><Pill className="h-5 w-5" aria-hidden /></span><div><h1 id="login-title" className="text-lg">{store?.name || 'DawaDesk'}</h1><p className="text-sm text-text-2">Sign in to continue</p></div></div>
        {error && <Callout tone="danger" className="mb-4" title="Sign-in failed">{error}</Callout>}
        <div className="space-y-4">
          <Field label="Username" required>{(id, by) => <Input id={id} aria-describedby={by} autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required autoCapitalize="none" />}</Field>
          <Field label="Password" required>{(id, by) => <Input id={id} aria-describedby={by} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
          <Button type="submit" variant="primary" className="w-full" loading={busy}>Sign in</Button>
        </div>
      </form>
    </main>
  );
}
