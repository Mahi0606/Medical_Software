import { schema, type DB, type Tx } from '../db/index.js';
import type { Ctx } from './ctx.js';

export interface AuditEntry {
  entity: string;
  entityId: string | number | null;
  action: 'create' | 'update' | 'delete' | 'post' | 'cancel' | 'login' | 'logout' | 'duty_on' | 'duty_off' | 'print' | 'export' | 'backup' | 'restore' | string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export function audit(tx: Tx | DB, ctx: Ctx, e: AuditEntry): void {
  tx.insert(schema.auditLog).values({
    userId: ctx.userId || null,
    username: ctx.username,
    entity: e.entity,
    entityId: e.entityId === null || e.entityId === undefined ? null : String(e.entityId),
    action: e.action,
    beforeJson: e.before === undefined ? null : JSON.stringify(e.before),
    afterJson: e.after === undefined ? null : JSON.stringify(e.after),
    reason: e.reason ?? null,
    ip: ctx.ip,
  }).run();
}
