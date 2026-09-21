import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ComboOption<T> { value: T; label: string; description?: ReactNode; keywords?: string }
export interface ComboboxProps<T> {
  options: ComboOption<T>[];
  value: T | null;
  onChange: (v: T | null, opt: ComboOption<T> | null) => void;
  onSearch?: (q: string) => void;
  placeholder?: string;
  emptyText?: string;
  loading?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  id?: string;
  invalid?: boolean;
  dense?: boolean;
  renderOption?: (o: ComboOption<T>) => ReactNode;
  onCreate?: (q: string) => void;
  createLabel?: (q: string) => string;
  ariaLabel?: string;
}

/** Accessible searchable select (combobox pattern with listbox popup). */
export function Combobox<T extends string | number>({ options, value, onChange, onSearch, placeholder = 'Search…', emptyText = 'No matches', loading, disabled, allowClear, id, invalid, dense, renderOption, onCreate, createLabel, ariaLabel }: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    if (onSearch || !q) return options;
    const t = q.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(t) || o.keywords?.toLowerCase().includes(t));
  }, [options, q, onSearch]);
  useEffect(() => { setActive(0); }, [filtered.length, q]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  const pick = (o: ComboOption<T>) => { onChange(o.value, o); setOpen(false); setQ(''); };
  const showCreate = !!onCreate && q.trim().length > 1 && !filtered.some((o) => o.label.toLowerCase() === q.trim().toLowerCase());
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="relative">
        <Popover.Trigger asChild>
          <button type="button" id={id} disabled={disabled} aria-invalid={invalid || undefined} aria-label={ariaLabel} role="combobox" aria-expanded={open} aria-controls={listId} aria-haspopup="listbox"
            className={cn('flex w-full items-center justify-between gap-2 rounded-md border border-border-strong/80 bg-surface px-3 text-left text-text disabled:bg-surface-2 aria-[invalid=true]:border-danger', dense ? 'h-9 text-sm' : 'h-11 text-base', !selected && 'text-text-3')}>
            <span className="truncate">{selected ? selected.label : placeholder}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-3" aria-hidden />
          </button>
        </Popover.Trigger>
        {allowClear && selected && !disabled && (
          <button type="button" aria-label="Clear selection" onClick={() => onChange(null, null)} className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-1 text-text-3 hover:bg-surface-2 hover:text-text"><X className="h-4 w-4" /></button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="card z-[85] w-[var(--radix-popover-trigger-width)] min-w-[280px] p-1 shadow-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); onSearch?.(e.target.value); }} placeholder="Type to search" aria-autocomplete="list" aria-controls={listId} aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
            className="mb-1 h-10 w-full rounded border border-border bg-surface px-3 text-base"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); const o = filtered[active]; if (o) pick(o); else if (showCreate) { onCreate!(q.trim()); setOpen(false); setQ(''); } }
              else if (e.key === 'Escape') setOpen(false);
            }} />
          <ul id={listId} role="listbox" className="max-h-72 overflow-auto">
            {loading && <li className="px-3 py-2 text-sm text-text-2">Searching…</li>}
            {!loading && filtered.length === 0 && !showCreate && <li className="px-3 py-2 text-sm text-text-2">{emptyText}</li>}
            {filtered.map((o, i) => (
              <li key={String(o.value)} id={`${listId}-${i}`} role="option" aria-selected={o.value === value} onMouseEnter={() => setActive(i)} onClick={() => pick(o)}
                className={cn('flex cursor-pointer items-center justify-between gap-2 rounded px-3 py-2 text-sm', i === active && 'bg-accent-bg', o.value === value && 'font-medium')}>
                <span className="min-w-0">{renderOption ? renderOption(o) : <><span className="block truncate">{o.label}</span>{o.description && <span className="block truncate text-xs text-text-2">{o.description}</span>}</>}</span>
                {o.value === value && <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
              </li>
            ))}
            {showCreate && <li role="option" aria-selected={false} onClick={() => { onCreate!(q.trim()); setOpen(false); setQ(''); }} className="cursor-pointer rounded px-3 py-2 text-sm text-accent hover:bg-accent-bg">{createLabel ? createLabel(q.trim()) : `Add “${q.trim()}”`}</li>}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
