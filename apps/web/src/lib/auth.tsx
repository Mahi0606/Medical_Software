import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasPermission, type Permission, type Role } from '@pharma/shared';
import { api } from './api';

export interface Me {
  user: { id: number; username: string; name: string; role: Role; pharmacistRegNo: string | null } | null;
  duty: { id: number; userId: number; name: string; regNo: string | null; onAt: string }[];
  store: { name: string; setupComplete: boolean; gstScheme: 'regular' | 'composition'; printFormat: string; nearExpiryDays: number; maxDiscountPctClerk: number; maxDiscountPctPharmacist: number; city: string; stateCode: string };
}

interface AuthCtx {
  me: Me | undefined;
  loading: boolean;
  user: Me['user'];
  store: Me['store'] | undefined;
  duty: Me['duty'];
  pharmacistOnDuty: boolean;
  can: (p: Permission) => boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/auth/me'), staleTime: 60_000, retry: false });
  const [, force] = useState(0);

  useEffect(() => {
    const h = () => { qc.setQueryData<Me>(['me'], (old) => (old ? { ...old, user: null, duty: [] } : old)); force((n) => n + 1); };
    window.addEventListener('pms:unauthorized', h);
    return () => window.removeEventListener('pms:unauthorized', h);
  }, [qc]);

  const login = useCallback(async (username: string, password: string) => {
    const me = await api.post<Me>('/auth/login', { username, password });
    qc.setQueryData(['me'], me);
    qc.invalidateQueries();
  }, [qc]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    qc.clear();
    qc.setQueryData<Me>(['me'], { user: null, duty: [], store: q.data?.store ?? { name: '', setupComplete: false, gstScheme: 'regular', printFormat: 'thermal80', nearExpiryDays: 90, maxDiscountPctClerk: 10, maxDiscountPctPharmacist: 20, city: '', stateCode: '27' } });
  }, [qc, q.data]);

  const value = useMemo<AuthCtx>(() => ({
    me: q.data, loading: q.isLoading, user: q.data?.user ?? null, store: q.data?.store, duty: q.data?.duty ?? [], pharmacistOnDuty: (q.data?.duty.length ?? 0) > 0,
    can: (p) => (q.data?.user ? hasPermission(q.data.user.role, p) : false), login, logout, refresh: () => qc.invalidateQueries({ queryKey: ['me'] }),
  }), [q.data, q.isLoading, login, logout, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
