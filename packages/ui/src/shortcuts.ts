/**
 * Single-key shortcuts for Luci's toolbars (DESIGN.md section 7: tooltips show the name and the
 * key). A key works only while that surface is open, never while the person types (in the page or in
 * Luci), and never with Ctrl, Alt, Meta or Shift, so the page's own shortcuts keep working. A key Luci
 * handles stops there; every other key reaches the page.
 */
import { useEffect, useRef } from 'preact/hooks';

export interface Shortcut {
  /** One letter, upper case ("C"), or a key name ("Escape"). */
  key: string;
  run: () => void;
  enabled?: boolean;
}

/** Is the key going into a field, a text area or editable content (the page's or Luci's own)? */
export function typingIn(e: KeyboardEvent): boolean {
  const t = e.composedPath()[0] as { tagName?: string; isContentEditable?: boolean } | undefined;
  return Boolean(t && ((t.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) || t.isContentEditable));
}

/** The shortcut a key press means, if any (exported for tests). */
export function shortcutFor(e: KeyboardEvent, shortcuts: readonly Shortcut[]): Shortcut | undefined {
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || typingIn(e)) return undefined;
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return shortcuts.find(s => s.key === key && s.enabled !== false);
}

export function useShortcuts(doc: Document, shortcuts: readonly Shortcut[], active = true): void {
  const current = useRef(shortcuts);
  current.current = shortcuts;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const s = shortcutFor(e, current.current);
      if (!s) return;
      e.preventDefault();
      e.stopPropagation();
      s.run();
    };
    doc.addEventListener('keydown', onKey, true);
    return () => doc.removeEventListener('keydown', onKey, true);
  }, [doc, active]);
}
