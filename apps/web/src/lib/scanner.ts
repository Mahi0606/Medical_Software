import { useEffect, useRef } from 'react';

/**
 * Keyboard-wedge barcode scanner detection.
 * Scanners type very fast (< 30 ms between keys) and end with Enter (or Tab).
 * When such a burst is detected anywhere on the page (outside a text field that opted in),
 * `onScan` fires with the payload and the keystrokes are swallowed.
 */
export function useScanner(onScan: (code: string) => void, opts: { enabled?: boolean; minLength?: number } = {}) {
  const buf = useRef('');
  const last = useRef(0);
  const cb = useRef(onScan);
  cb.current = onScan;
  const enabled = opts.enabled ?? true;
  const minLength = opts.minLength ?? 4;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const now = performance.now();
      const target = e.target as HTMLElement | null;
      const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const fieldAllows = inField && (target as HTMLElement).dataset.scan === 'allow';
      if (inField && !fieldAllows) return;
      if (now - last.current > 60) buf.current = '';
      last.current = now;
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buf.current.length >= minLength) {
          e.preventDefault();
          e.stopPropagation();
          const code = buf.current;
          buf.current = '';
          cb.current(code);
          if (fieldAllows) (target as HTMLInputElement).value = (target as HTMLInputElement).value.slice(0, -code.length);
        }
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) buf.current += e.key;
      else if (e.key === 'Shift') return;
      else buf.current += e.key === 'GroupSeparator' ? String.fromCharCode(29) : '';
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, minLength]);
}
