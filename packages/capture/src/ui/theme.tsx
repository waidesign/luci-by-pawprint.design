/**
 * Shared UI appearance preferences (System / Light / Dark theme and Right / Left panel dock)
 * and the Luci brand mark, shared by the Capture extension toolbar and the Dev Toolbar.
 */
import { useEffect, useState } from 'preact/hooks';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type DockChoice = 'right' | 'left';

export interface UiPrefs {
  theme: ThemeChoice;
  dock: DockChoice;
}

export const DEFAULT_UI_PREFS: UiPrefs = {
  theme: 'system',
  dock: 'right'
};

export const UI_PREFS_KEY = 'luci.ui';
const UI_PREFS_EVENT = 'luci-ui-prefs';

export const THEME_OPTIONS: readonly { id: ThemeChoice; label: string; title: string }[] = [
  { id: 'system', label: 'System', title: 'Match your operating system or browser appearance' },
  { id: 'light', label: 'Light', title: 'Muzzle White surface (#F5EFEA) with #2B2B2B primary ink' },
  { id: 'dark', label: 'Dark', title: 'Charcoal surface (#1F1F1F) with Muzzle White (#F5EFEA) ink' }
];

export const DOCK_OPTIONS: readonly { id: DockChoice; label: string; title: string }[] = [
  { id: 'right', label: 'Right', title: 'Keep Luci docked on the right side of the window' },
  { id: 'left', label: 'Left', title: 'Move Luci to the left side when inspecting elements on the right' }
];

/** Read saved UI preferences from localStorage (with safe fallback in sandboxed frames). */
export function readUiPrefs(doc: Document): UiPrefs {
  try {
    const raw = (doc.defaultView ?? window).localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return DEFAULT_UI_PREFS;
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    const theme: ThemeChoice = parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system' ? parsed.theme : 'system';
    const dock: DockChoice = parsed.dock === 'left' || parsed.dock === 'right' ? parsed.dock : 'right';
    return { theme, dock };
  } catch {
    return DEFAULT_UI_PREFS;
  }
}

/** Save UI preferences and notify any mounted Luci root on the page. */
export function writeUiPrefs(doc: Document, next: UiPrefs): void {
  try {
    (doc.defaultView ?? window).localStorage.setItem(UI_PREFS_KEY, JSON.stringify(next));
  } catch {
    /* localStorage may be blocked in sandboxed frames */
  }
  doc.dispatchEvent(new CustomEvent<UiPrefs>(UI_PREFS_EVENT, { detail: next }));
}

/** Reactive hook for theme and dock preferences across all Luci modes. */
export function useUiPrefs(doc: Document): [UiPrefs, (patch: Partial<UiPrefs>) => void] {
  const [prefs, setPrefs] = useState<UiPrefs>(() => readUiPrefs(doc));
  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<UiPrefs>).detail;
      if (detail) setPrefs(detail);
      else setPrefs(readUiPrefs(doc));
    };
    doc.addEventListener(UI_PREFS_EVENT, onUpdate);
    return () => doc.removeEventListener(UI_PREFS_EVENT, onUpdate);
  }, [doc]);
  const update = (patch: Partial<UiPrefs>) => {
    const next: UiPrefs = { ...prefs, ...patch };
    setPrefs(next);
    writeUiPrefs(doc, next);
  };
  return [prefs, update];
}

/** Luci architectural component-frame logo mark (uses currentColor / CSS variables, never pure #fff or #000). */
export function LuciLogo(props: { compact?: boolean }) {
  return (
    <span class={props.compact ? 'logo-mark compact' : 'logo-mark'} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={props.compact ? '15' : '18'} height={props.compact ? '15' : '18'} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
        <path d="M3.5 9.5h17M9.5 9.5v11" />
        <rect x="12.5" y="12.5" width="5" height="5" rx="1" fill="currentColor" fill-opacity="0.18" stroke="none" />
      </svg>
    </span>
  );
}

/** Reusable Theme (System / Light / Dark) and Panel position (Right / Left) controls for Settings panels. */
export function AppearanceControls(props: { prefs: UiPrefs; onChange: (patch: Partial<UiPrefs>) => void }) {
  const { prefs, onChange } = props;
  return (
    <div class="settings-appearance" data-part="appearance-settings">
      <div class="setting-row">
        <div class="setting-copy">
          <span class="field-label">Appearance</span>
          <span class="dim">System, Muzzle White light, or charcoal dark</span>
        </div>
        <div class="seg" role="group" aria-label="Theme">
          {THEME_OPTIONS.map(t => (
            <button type="button" data-theme-choice={t.id} aria-pressed={prefs.theme === t.id} title={t.title} onClick={() => onChange({ theme: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-copy">
          <span class="field-label">Panel position</span>
          <span class="dim">Move Luci to the other side if it covers an element</span>
        </div>
        <div class="seg" role="group" aria-label="Panel position">
          {DOCK_OPTIONS.map(d => (
            <button type="button" data-dock-choice={d.id} aria-pressed={prefs.dock === d.id} title={d.title} onClick={() => onChange({ dock: d.id })}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
