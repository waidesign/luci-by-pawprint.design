/**
 * Shared UI appearance preferences (System / Light / Dark theme and Right / Left panel dock)
 * and the Luci brand mark, shared by the Capture extension toolbar and the Dev Toolbar.
 */
import { useEffect, useState } from 'preact/hooks';
import { LuciAvatar } from '@luci/ui';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type DockChoice = 'right' | 'left';

/**
 * Where the person dragged the extension's bar: the corner it is nearest, and its distance from that
 * corner's edges in px (so it stays in place relative to that corner when the window resizes).
 */
export interface BarPlace {
  h: 'left' | 'right';
  v: 'top' | 'bottom';
  x: number;
  y: number;
}

export interface UiPrefs {
  theme: ThemeChoice;
  dock: DockChoice;
  /** Luci greeted the person once (first run); never again after that. */
  greeted?: boolean;
  /** The dragged bar's place (the extension); none: the dock's top corner. */
  place?: BarPlace | null;
  /** The dev toolbar's dragged place; none: the dock's bottom corner, next to its button. */
  devPlace?: BarPlace | null;
}

const validPlace = (p: unknown): BarPlace | null => {
  const o = p as Partial<BarPlace> | null;
  return o && (o.h === 'left' || o.h === 'right') && (o.v === 'top' || o.v === 'bottom') && Number.isFinite(o.x) && Number.isFinite(o.y)
    ? { h: o.h, v: o.v, x: Math.max(0, Math.round(o.x!)), y: Math.max(0, Math.round(o.y!)) }
    : null;
};

export const DEFAULT_UI_PREFS: UiPrefs = {
  theme: 'system',
  dock: 'right',
  greeted: false
};

export const UI_PREFS_KEY = 'luci.ui';
/** Sent on the document when the preferences change, so every Luci on the page follows. */
export const UI_PREFS_EVENT = 'luci-ui-prefs';

export const THEME_OPTIONS: readonly { id: ThemeChoice; label: string; title: string }[] = [
  { id: 'system', label: 'System', title: 'Match your operating system or browser appearance' },
  { id: 'light', label: 'Light', title: 'Muzzle White surface with Charcoal text' },
  { id: 'dark', label: 'Dark', title: 'Charcoal surface with Muzzle White text' }
];

export const DOCK_OPTIONS: readonly { id: DockChoice; label: string; title: string }[] = [
  // In the order they sit on screen: Left, then Right (the default)
  { id: 'left', label: 'Left', title: 'Move Luci to the left side when inspecting elements on the right' },
  { id: 'right', label: 'Right', title: 'Keep Luci docked on the right side of the window' }
];

/** Read saved UI preferences from localStorage (with safe fallback in sandboxed frames). */
export function readUiPrefs(doc: Document): UiPrefs {
  try {
    const raw = (doc.defaultView ?? window).localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return DEFAULT_UI_PREFS;
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    const theme: ThemeChoice = parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system' ? parsed.theme : 'system';
    const dock: DockChoice = parsed.dock === 'left' || parsed.dock === 'right' ? parsed.dock : 'right';
    const place = validPlace(parsed.place);
    const devPlace = validPlace(parsed.devPlace);
    return { theme, dock, greeted: parsed.greeted === true, ...(place ? { place } : {}), ...(devPlace ? { devPlace } : {}) };
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
export function LuciLogo(props: { compact?: boolean; size?: number }) {
  return <LuciAvatar size={props.size ?? (props.compact ? 32 : 44)} />;
}

/** Reusable Theme (System / Light / Dark) and Panel position (Right / Left) controls for Settings panels. */
/**
 * `movable`: the bar can be dragged (the hint says how); `moved`: it is where it was dropped, so
 * neither side is chosen. Right or Left puts a dragged bar back in that side's corner.
 */
export function AppearanceControls(props: { prefs: UiPrefs; onChange: (patch: Partial<UiPrefs>) => void; movable?: boolean; moved?: boolean }) {
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
          <span class="dim">{props.movable ? 'Drag the bar by its edge or Luci. Left or Right resets it.' : 'Move Luci to the other side if it covers an element'}</span>
        </div>
        <div class="seg" role="group" aria-label="Panel position">
          {DOCK_OPTIONS.map(d => (
            <button type="button" data-dock-choice={d.id} aria-pressed={prefs.dock === d.id} title={d.title} onClick={() => onChange({ dock: d.id, place: null, devPlace: null })}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
