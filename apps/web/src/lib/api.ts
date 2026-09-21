export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: unknown) {
    super(message);
  }
  get fieldErrors(): { path: string; message: string }[] {
    return Array.isArray(this.details) ? (this.details as { path: string; message: string }[]) : [];
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, url: string, body?: unknown, opts: { query?: Query; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`/api${url}${qs(opts.query)}`, {
    method,
    credentials: 'include',
    headers: opts.form ? undefined : body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    let payload: { error?: string; message?: string; details?: unknown } = {};
    try { payload = ct.includes('json') ? await res.json() : { message: await res.text() }; } catch { /* ignore */ }
    if (res.status === 401) window.dispatchEvent(new CustomEvent('pms:unauthorized'));
    throw new ApiError(res.status, payload.error ?? 'error', payload.message ?? `Request failed (${res.status})`, payload.details);
  }
  if (ct.includes('json')) return res.json() as Promise<T>;
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T>(url: string, query?: Query) => request<T>('GET', url, undefined, { query }),
  post: <T>(url: string, body?: unknown, query?: Query) => request<T>('POST', url, body, { query }),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, file: File, field = 'file') => { const f = new FormData(); f.append(field, file); return request<T>('POST', url, undefined, { form: f }); },
  downloadUrl: (url: string, query?: Query) => `/api${url}${qs(query)}`,
};

/** POST rows to the server and trigger a CSV download. */
export async function downloadCsv(filename: string, rows: Record<string, unknown>[], columns?: { key: string; label: string; paise?: boolean }[]) {
  const res = await fetch('/api/reports/export', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename, rows, columns }) });
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
