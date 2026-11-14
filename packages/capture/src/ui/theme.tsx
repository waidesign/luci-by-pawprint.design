/**
 * Shared UI appearance preferences (System / Light / Dark theme and Right / Left panel dock)
 * and the Luci brand mark, shared by the Capture extension toolbar and the Dev Toolbar.
 */
import { useEffect, useState } from 'preact/hooks';
import { LuciAvatar } from '@luci/ui';

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
  { id: 'light', label: 'Light', title: 'Muzzle White surface with Charcoal text' },
  { id: 'dark', label: 'Dark', title: 'Charcoal surface with Muzzle White text' }
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

/** Luci's head in a Ginger circle, from the brand kit (brand/BRAND.md section 8). Decorative: the name is beside it. */
export function LuciLogo(props: { compact?: boolean }) {
  return <LuciAvatar size={props.compact ? 32 : 44} />;
}

/** Reusable Theme (System / Light / Dark) and Panel position (Right / Left) controls for Settings panels. */
export function AppearanceControls(props: { prefs: UiPrefs; onChange: (patch: Partial<UiPrefs>) => void }) {
  const { prefs, onChange } = props;
  return (
    <div class="settings-appearance" data-part="appearance-settings">
      <div class="setting-row">
        <div class="setting-copy">
          <span class="field-label">Appearance</span>
          <span class="dim">System, light or dark</span>
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

/** Meaningful inline SVG icons (aria-hidden so button.innerText stays purely the text label). */
export function CopyIcon(props: { copied?: boolean }) {
  return props.copied ? (
    <svg class="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ) : (
    <svg class="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg class="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function BasketIcon(props: { added?: boolean }) {
  return (
    <svg class="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 8h14l-1.4 11a2 2 0 0 1-2 1.7H8.4a2 2 0 0 1-2-1.7L5 8Z" />
      <path d="M9 8V5.5a3 3 0 0 1 6 0V8" />
      {props.added ? <polyline points="9.5 14 11.3 15.8 14.8 12.2" /> : <path d="M12 11.5v5M9.5 14h5" />}
    </svg>
  );
}

export function PickAgainIcon() {
  return (
    <svg class="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}
