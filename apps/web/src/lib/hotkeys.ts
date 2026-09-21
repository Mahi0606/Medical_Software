import { useEffect } from 'react';

export interface Hotkey { key: string; alt?: boolean; ctrl?: boolean; shift?: boolean; handler: (e: KeyboardEvent) => void; allowInInput?: boolean; description?: string }

/** Global hotkeys. F-keys and Alt combos work even inside inputs (Marg-style billing). */
export function useHotkeys(keys: Hotkey[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      for (const k of keys) {
        if (e.key.toLowerCase() !== k.key.toLowerCase()) continue;
        if (!!k.alt !== e.altKey || !!k.ctrl !== (e.ctrlKey || e.metaKey) || !!k.shift !== e.shiftKey) continue;
        const isFn = /^F\d+$/.test(k.key) || k.alt || k.ctrl;
        if (inField && !k.allowInInput && !isFn) continue;
        e.preventDefault();
        k.handler(e);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys, enabled]);
}
