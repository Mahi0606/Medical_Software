import type { Role } from '@pharma/shared';

/** Who is acting, for audit and permission checks. */
export interface Ctx {
  userId: number;
  username: string;
  name: string;
  role: Role;
  pharmacistRegNo: string | null;
  branchId: number;
  ip: string | null;
}

export const SYSTEM_CTX: Ctx = { userId: 0, username: 'system', name: 'System', role: 'owner', pharmacistRegNo: null, branchId: 1, ip: null };
