import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Combobox, type ComboOption } from '@/components/ui';
import { type ItemSearchRow, useDebounced } from './item-shared';

interface Props {
  /** Currently chosen item (id + name are enough to render the label). */
  value: { id: number; name: string } | null;
  onPick: (row: ItemSearchRow | null) => void;
  id?: string;
  dense?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  inStockOnly?: boolean;
  /** Offer "Create item" for a name that does not match. */
  onCreate?: (name: string) => void;
  allowClear?: boolean;
  ariaLabel?: string;
}

/** Server-searched item combobox. Keeps the chosen item in the option list so the label stays visible after the search is cleared. */
export function ItemPicker({ value, onPick, id, dense, invalid, disabled, placeholder = 'Type brand or salt…', inStockOnly, onCreate, allowClear, ariaLabel }: Props) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const query = useQuery({
    queryKey: ['items-picker', dq, inStockOnly ?? false],
    queryFn: () => api.get<{ rows: ItemSearchRow[] }>('/items', { q: dq, pageSize: 20, inStockOnly: inStockOnly || undefined }),
    enabled: dq.length > 0, placeholderData: (p) => p,
  });
  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const options = useMemo<ComboOption<number>[]>(() => {
    const list: ComboOption<number>[] = rows.map((r) => ({ value: r.id, label: r.name, description: [r.genericText, r.manufacturer, `${r.unitsPerPack} ${r.baseUnit}/${r.packName}`].filter(Boolean).join(' · '), keywords: r.genericText }));
    if (value && !list.some((o) => o.value === value.id)) list.unshift({ value: value.id, label: value.name });
    return list;
  }, [rows, value]);
  return (
    <Combobox<number>
      id={id} dense={dense} invalid={invalid} disabled={disabled} allowClear={allowClear} placeholder={placeholder} ariaLabel={ariaLabel} loading={query.isFetching && rows.length === 0}
      emptyText={dq ? `No item matches “${dq}”` : 'Type to search items'}
      options={options} value={value?.id ?? null} onSearch={setQ}
      onChange={(v) => { if (v === null) { onPick(null); return; } const r = rows.find((x) => x.id === v); if (r) onPick(r); }}
      onCreate={onCreate} createLabel={(s) => `Create item “${s}”`}
    />
  );
}
