/** Lower-case, strip punctuation and collapse spaces for prefix search. */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9+.%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nowIso(): string {
  return new Date().toISOString();
}
