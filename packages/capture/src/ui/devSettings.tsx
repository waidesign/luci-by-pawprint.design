import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { PALETTE, RepoButton, Select } from '@luci/ui';
import { DETAIL_LEVELS, type DetailLevel } from '@luci/format/feedback';
import type { CaptureSettings } from '@luci/format/capture';
import { AppearanceControls, type UiPrefs } from './theme.js';
import { TOOLS } from './tools.js';

export const FEEDBACK_SETTINGS_KEY = 'luci.feedback.settings';
export const CAPTURE_SETTINGS_KEY = 'luci.capture.settings';

export const CAPTURE_KEYS = { component: 'V', text: 'T', color: 'C', spacing: 'S', page: 'P', check: 'K', basket: 'B', menu: 'M' } as const;

export const MARKER_COLORS = [
  PALETTE['muzzle-900'],
  PALETTE['ginger-500'],
  PALETTE['collar-lime-500'],
  PALETTE['nose-pink-500'],
  PALETTE['info-700']
] as const;

export interface FeedbackSettings {
  markerColor: string;
  detail: DetailLevel;
  webhookUrl?: string;
}

export const DEFAULT_FEEDBACK_SETTINGS: FeedbackSettings = {
  markerColor: MARKER_COLORS[0],
  detail: 'standard'
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readSettings<T>(store: StorageLike | undefined, key: string, fallback: T): T {
  try {
    const raw = store ? store.getItem(key) : (typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeSettings<T>(store: StorageLike | undefined, key: string, val: T): void {
  try {
    const str = JSON.stringify(val);
    if (store) store.setItem(key, str);
    else if (typeof localStorage !== 'undefined') localStorage.setItem(key, str);
  } catch {
    // ignore in sandboxed or storage-restricted frames
  }
}

export type DevToolTab = 'feedback' | 'layout' | 'capture';

export interface DevSettingsPanelProps {
  /** The currently active tool/mode in dev toolbar: 'feedback' | 'layout' | 'capture'. */
  currentMode: DevToolTab;
  /** UI preferences (theme, dock, placement). */
  uiPrefs: UiPrefs;
  onUiPrefsChange: (patch: Partial<UiPrefs>) => void;
  /** Project info from luci serve. */
  projectInfo?: {
    get: () => Promise<{ project?: string; name?: string; url?: string } | null>;
    setUrl?: (url: string) => Promise<void>;
  };
  /** Storage for dev settings (defaults to localStorage if available). */
  store?: StorageLike;
  /** Feedback settings and updater (if passed directly). */
  feedbackSettings?: FeedbackSettings;
  onFeedbackSettingsChange?: (s: FeedbackSettings) => void;
  /** Capture settings and updater (if passed directly). */
  captureSettings?: CaptureSettings;
  onCaptureSettingsChange?: (s: CaptureSettings) => void;
  /** Debugger permission info (if in extension or supported). */
  debuggerPermission?: {
    get: () => Promise<boolean>;
    request?: () => void;
  };
  /** If in feedback mode and there are notes, allow clearing all. */
  feedbackNotesCount?: number;
  onClearAllFeedbackNotes?: () => void;
}

/**
 * Unified DevTool settings modal with 3 tool tabs: [ Feedback ] | [ Layout ] | [ Capture ].
 * Shared settings (Connected project card, Appearance theme & position) stay outside the tool tabs.
 */
export function DevSettingsPanel(props: DevSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<DevToolTab>(props.currentMode);

  // Feedback settings
  const [fbSettings, setFbSettings] = useState<FeedbackSettings>(() =>
    props.feedbackSettings ?? readSettings<FeedbackSettings>(props.store, FEEDBACK_SETTINGS_KEY, DEFAULT_FEEDBACK_SETTINGS)
  );
  const [hook, setHook] = useState(fbSettings.webhookUrl ?? '');
  const [confirmClear, setConfirmClear] = useState(false);
  const validHook = !hook || /^https?:\/\/\S+$/.test(hook);

  const updateFbSettings = (next: FeedbackSettings) => {
    setFbSettings(next);
    writeSettings(props.store, FEEDBACK_SETTINGS_KEY, next);
    props.onFeedbackSettingsChange?.(next);
  };

  // Capture settings
  const [capSettings, setCapSettings] = useState<CaptureSettings>(() =>
    props.captureSettings ?? readSettings<CaptureSettings>(props.store, CAPTURE_SETTINGS_KEY, {})
  );

  const updateCapSettings = (next: CaptureSettings) => {
    setCapSettings(next);
    writeSettings(props.store, CAPTURE_SETTINGS_KEY, next);
    props.onCaptureSettingsChange?.(next);
  };

  // Project info
  const [activeProject, setActiveProject] = useState<{ project?: string; name?: string; url?: string } | null>(null);
  const [bridgePortInput, setBridgePortInput] = useState('');

  const refreshProject = () => {
    if (props.projectInfo?.get) {
      void props.projectInfo.get().then(p => {
        setActiveProject(p);
        if (p?.url) setBridgePortInput(p.url);
      });
    }
  };

  useEffect(() => {
    refreshProject();
  }, []);

  // Debugger info
  const [debuggerGranted, setDebuggerGranted] = useState(false);
  useEffect(() => {
    if (props.debuggerPermission?.get) {
      void props.debuggerPermission.get().then(setDebuggerGranted);
    }
  }, []);
  const useDebugger = capSettings.useDebugger ?? true;

  return (
    <div class="panel" role="dialog" aria-label="Settings" data-part="settings">
      <div class="settings-head">
        <h2>Settings</h2>
        <RepoButton />
      </div>

      {/* Shared settings (outside tool tabs): Connected Project */}
      <div class="project-card" data-part="connected-project">
        <div class="project-header">
          <span class={`status-dot ${activeProject?.project ? 'online' : 'offline'}`} aria-hidden="true"></span>
          <div class="project-info">
            <span class="project-name">{activeProject?.name ? `Connected to ${activeProject.name}` : 'Not connected to a project'}</span>
            {activeProject?.project && <span class="project-path dim" title={activeProject.project}>{activeProject.project}</span>}
            {!activeProject?.project && <span class="project-hint dim">Run <code>luci serve</code> in your project terminal</span>}
          </div>
        </div>
        {props.projectInfo?.setUrl && (
          <div class="project-port-row">
            <label class="dim" for="luci-bridge-url">Bridge:</label>
            <input
              id="luci-bridge-url"
              type="text"
              class="port-input"
              data-part="port-input"
              value={bridgePortInput}
              placeholder="http://127.0.0.1:4545"
              onChange={(e: Event) => {
                const val = (e.currentTarget as HTMLInputElement).value;
                setBridgePortInput(val);
                void props.projectInfo?.setUrl?.(val).then(refreshProject);
              }}
            />
          </div>
        )}
      </div>

      {/* Shared settings (outside tool tabs): Appearance */}
      <AppearanceControls
        prefs={props.uiPrefs}
        onChange={props.onUiPrefsChange}
        movable
        moved={Boolean(props.uiPrefs.devPlace)}
      />

      <hr class="settings-divider" />

      {/* Tool tabs bar */}
      <div class="setting-tools-header">
        <span class="field-label">Tool preferences</span>
        <div class="seg tool-tabs" role="tablist" aria-label="Tool preferences">
          <button
            type="button"
            role="tab"
            class="tab-btn"
            data-tool-tab="feedback"
            aria-selected={activeTab === 'feedback'}
            aria-pressed={activeTab === 'feedback'}
            onClick={() => setActiveTab('feedback')}
          >
            Feedback
          </button>
          <button
            type="button"
            role="tab"
            class="tab-btn"
            data-tool-tab="layout"
            aria-selected={activeTab === 'layout'}
            aria-pressed={activeTab === 'layout'}
            onClick={() => setActiveTab('layout')}
          >
            Layout
          </button>
          <button
            type="button"
            role="tab"
            class="tab-btn"
            data-tool-tab="capture"
            aria-selected={activeTab === 'capture'}
            aria-pressed={activeTab === 'capture'}
            onClick={() => setActiveTab('capture')}
          >
            Capture
          </button>
        </div>
      </div>

      {/* Tool tab panels */}
      {activeTab === 'feedback' && (
        <div class="tool-settings-body" data-part="feedback-settings-tab">
          <div class="stack">
            <span class="field-label">Marker color</span>
            <div class="swatches" role="group" aria-label="Marker color">
              {MARKER_COLORS.map(c => (
                <button
                  type="button"
                  aria-label={c}
                  aria-pressed={fbSettings.markerColor === c}
                  data-color={c}
                  style={{ background: c }}
                  onClick={() => updateFbSettings({ ...fbSettings, markerColor: c })}
                />
              ))}
            </div>
          </div>
          <label class="field-stack">
            <span class="field-label">Prompt detail</span>
            <Select
              data-part="detail"
              value={fbSettings.detail}
              onChange={(e: Event) => updateFbSettings({ ...fbSettings, detail: (e.currentTarget as HTMLSelectElement).value as DetailLevel })}
            >
              {DETAIL_LEVELS.map(d => <option value={d}>{d}</option>)}
            </Select>
          </label>
          <p class="dim">compact: selector and text. standard: + source file and components. detailed: + computed styles.</p>
          <div class="stack">
            <span class="field-label">Webhook (optional)</span>
            <input
              type="url"
              class="field"
              data-part="webhook"
              placeholder="https://..."
              value={hook}
              onInput={(e: Event) => setHook((e.currentTarget as HTMLInputElement).value.trim())}
            />
            <div class="row">
              <button
                type="button"
                class="btn-secondary"
                data-action="save-webhook"
                disabled={!validHook}
                onClick={() => {
                  const { webhookUrl: _w, ...rest } = fbSettings;
                  updateFbSettings(hook ? { ...rest, webhookUrl: hook } : rest);
                }}
              >
                Save webhook
              </button>
              <span class="dim">Sent only when you press Send to webhook.</span>
            </div>
          </div>
          {props.onClearAllFeedbackNotes && (
            <div class="row danger">
              <button
                class="btn-danger"
                type="button"
                data-action="clear-all"
                disabled={!props.feedbackNotesCount}
                onClick={() => {
                  if (!confirmClear) { setConfirmClear(true); return; }
                  props.onClearAllFeedbackNotes?.();
                  setConfirmClear(false);
                }}
              >
                {confirmClear ? 'Delete every note on every page?' : 'Clear all notes'}
              </button>
              {confirmClear && <button type="button" onClick={() => setConfirmClear(false)}>Cancel</button>}
            </div>
          )}
        </div>
      )}

      {activeTab === 'layout' && (
        <div class="tool-settings-body" data-part="layout-settings-tab">
          <div class="stack">
            <span class="field-label">Spacing & layout guidance</span>
            <p class="tip-box">
              Values snap to the page's detected spacing scale (e.g. 4px / 8px). Elements can be moved, resized and spaced freely.
            </p>
            <p class="dim">
              Preview changes live in the browser without modifying code. When finished, Copy prompt generates a structured layout plan for your agent.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'capture' && (
        <div class="tool-settings-body" data-part="capture-settings-tab">
          <div class="stack">
            <span class="field-label">Default file format</span>
            <div class="settings-grid">
              <label class="field-stack">
                <span class="dim">Units</span>
                <Select
                  data-setting="units"
                  value={capSettings.units ?? 'px'}
                  onChange={(e: Event) => updateCapSettings({ ...capSettings, units: (e.currentTarget as HTMLSelectElement).value as 'px' })}
                >
                  <option value="px">px</option><option value="rem">rem</option><option value="both">both</option>
                </Select>
              </label>
              <label class="field-stack">
                <span class="dim">Colours</span>
                <Select
                  data-setting="colors"
                  value={capSettings.colors ?? 'hex'}
                  onChange={(e: Event) => updateCapSettings({ ...capSettings, colors: (e.currentTarget as HTMLSelectElement).value as 'hex' })}
                >
                  <option value="hex">hex</option><option value="rgb">rgb</option><option value="hsl">hsl</option><option value="oklch">oklch</option>
                </Select>
              </label>
              <label class="field-stack" title="The file's source line: the page address, or only the site name">
                <span class="dim">Source</span>
                <Select
                  data-setting="source"
                  value={capSettings.source ?? 'page'}
                  onChange={(e: Event) => updateCapSettings({ ...capSettings, source: (e.currentTarget as HTMLSelectElement).value as 'page' })}
                >
                  <option value="page">page address</option><option value="site">site name only</option>
                </Select>
              </label>
              <label class="field-stack" title="The file you copy, download and export: Luci's tables, or DESIGN.md for Google Stitch">
                <span class="dim">File</span>
                <Select
                  data-setting="style"
                  value={capSettings.style ?? 'luci'}
                  onChange={(e: Event) => updateCapSettings({ ...capSettings, style: (e.currentTarget as HTMLSelectElement).value as 'luci' })}
                >
                  <option value="luci">Luci tables</option><option value="stitch">DESIGN.md (Stitch)</option>
                </Select>
              </label>
            </div>
          </div>
          {props.debuggerPermission && (
            <div class="project-card" data-part="debugger-permission">
              <div class="project-header">
                <span class={`status-dot ${debuggerGranted && useDebugger ? 'online' : 'offline'}`} aria-hidden="true"></span>
                <div class="project-info">
                  <span class="project-name">
                    {debuggerGranted
                      ? (useDebugger ? 'Debugger: active' : 'Debugger: disabled')
                      : 'Debugger: optional (not enabled)'}
                  </span>
                  <span class="project-hint dim">
                    {debuggerGranted
                      ? (useDebugger
                        ? 'Briefly attaches only during captures for exact CDP states'
                        : 'CSS rules & hidden frames active. Debugger will never be attached.')
                      : 'CSS rules & frame fallback active'}
                  </span>
                </div>
              </div>
              <div class="project-port-row">
                {debuggerGranted ? (
                  <button
                    type="button"
                    class="btn-secondary"
                    data-action="toggle-debugger"
                    onClick={() => updateCapSettings({ ...capSettings, useDebugger: !useDebugger })}
                  >
                    {useDebugger ? 'Disable debugger' : 'Enable debugger'}
                  </button>
                ) : (
                  <button
                    type="button"
                    class="btn-secondary"
                    data-action="enable-debugger"
                    onClick={() => {
                      if (props.debuggerPermission?.request) {
                        props.debuggerPermission.request();
                      }
                    }}
                  >
                    Enable in Help
                  </button>
                )}
              </div>
            </div>
          )}
          <hr class="settings-divider" />
          <div class="stack">
            <span class="field-label">Keys</span>
            <div class="shortcut-list" data-part="keys">
              <span>{TOOLS.map(t => <><kbd class="kbd">{CAPTURE_KEYS[t]}</kbd> </>) }</span>
              <span class="dim">Component, Text, Colour, Spacing</span>
              <span><kbd class="kbd">{CAPTURE_KEYS.page}</kbd> <kbd class="kbd">{CAPTURE_KEYS.check}</kbd></span>
              <span class="dim">Whole page, Check a build</span>
              <span><kbd class="kbd">{CAPTURE_KEYS.basket}</kbd> <kbd class="kbd">{CAPTURE_KEYS.menu}</kbd></span>
              <span class="dim">Basket, this menu</span>
              <span><kbd class="kbd">↑</kbd> <kbd class="kbd">↓</kbd></span>
              <span class="dim">Wider or narrower selection</span>
              <span><kbd class="kbd">Enter</kbd></span>
              <span class="dim">Pick, then take This one</span>
              <span><kbd class="kbd">Esc</kbd></span>
              <span class="dim">Stop picking, or close the panel</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
