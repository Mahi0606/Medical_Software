import type { FieldErrors, FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@/lib/api';
import { Callout } from '@/components/ui';

/** Copy server-side field errors (ApiError.fieldErrors) onto the form; returns the headline message. */
export function applyApiErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>): string {
  if (err instanceof ApiError) {
    for (const fe of err.fieldErrors) if (fe.path) setError(fe.path as Path<T>, { type: 'server', message: fe.message });
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}

function flatten(errors: FieldErrors, prefix = ''): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  for (const [k, v] of Object.entries(errors)) {
    if (!v) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && 'message' in v && typeof v.message === 'string' && v.message) out.push({ path, message: v.message });
    else if (typeof v === 'object' && !('type' in v)) out.push(...flatten(v as FieldErrors, path));
  }
  return out;
}

/** Error summary shown above a form (WCAG 3.3.1): headline plus a link per field. `idFor` maps a field path to its input id. */
export function FormErrorSummary({ message, errors, idFor, labels }: { message?: string | null; errors: FieldErrors; idFor: (path: string) => string; labels?: Record<string, string> }) {
  const list = flatten(errors);
  if (!message && list.length === 0) return null;
  return (
    <Callout tone="danger" title={message ?? 'Please correct the highlighted fields'} className="mb-3">
      {list.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4">
          {list.map((e) => (
            <li key={e.path}><a href={`#${idFor(e.path)}`} className="text-accent underline" onClick={(ev) => { ev.preventDefault(); document.getElementById(idFor(e.path))?.focus(); }}>{labels?.[e.path] ?? e.path}</a>: {e.message}</li>
          ))}
        </ul>
      )}
    </Callout>
  );
}

/** Build a stable id factory for a form so error-summary links can focus fields. */
export function fieldIds(prefix: string) {
  return (path: string) => `${prefix}-${path.replace(/\./g, '-')}`;
}
