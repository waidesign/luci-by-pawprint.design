/**
 * The on-page toolbar (FR1-FR5): tool modes, the picker with hover label and arrow-key navigation,
 * the eligibility check, the two outputs per pick, and the preview with copy and download.
 * Rendered by mount.ts inside a shadow root.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { RemapSection, pageTokenStore, remapOutput, type MyTokensSource } from './remap.js';
import type { ViewportWidth } from '../responsive.js';
import {
  CSS_VARS_FILE_NAME,
  STITCH_FILE_NAME,
  TAILWIND_V3_FILE_NAME,
  TAILWIND_V4_FILE_NAME,
  cleanSource,
  compareCaptures,
  estimatePalette,
  formatCapture,
  formatCssVariables,
  formatStitch,
  formatTailwind,
  formatTailwindV3,
  type CheckRun,
  formatCompareReport,
  groupOf,
  imageColorSystem,
  imageFileName,
  mergeGroups,
  withInstructions,
  type CompareResult,
  type Responsive,
  type BasketItem,
  type CaptureSettings,
  type ComponentCapture,
  type StyleSetting
} from '@luci-dev/format/capture';
import { addToBasket, exportBasket, exportItem, mergeInBasket, noteInBasket, removeFromBasket, renameInBasket, sourceLabel, type BasketStore } from './basket.js';
import type { Eligibility } from '../eligibility.js';
import type { ElementSnapshot } from '../model.js';
import { manualState, type ComputedMap, type StateName } from '../states.js';
import { elementName } from '../naming.js';
import { LUCI_UI_ATTRIBUTE } from '../dom.js';
import { elementAt, eligibilityOf, eventTarget, firstChildOf, hoverLabel, parentOf, scrollableAncestor, touchScreen } from './picker.js';
import { ButtonSpinner, Loading, nextPaint } from './loading.js';
import { projectLabel } from './projectLabel.js';
import { ModeSwitch, type ModeSwitchProps } from './modeSwitch.js';
import {
  Button, COPY, EmptyState, Icon, IconBasket, IconCheck, IconClose, IconColour, IconComponent, IconCopy, IconDownload, IconInfo, IconPage,
  IconSpacing, IconSuccess, IconText, LUCI_REPO_URL, Mascot, RepoButton, Select, useShortcuts, type LucideIcon, type MascotPose
} from '@luci-dev/ui';
import { AppearanceControls, LuciLogo, useUiPrefs } from './theme.js';
import { DevSettingsPanel, FEEDBACK_SETTINGS_KEY, type StorageLike } from './devSettings.js';
import { zip } from './zip.js';
import { CheckResultPanel, DEFAULT_DIFF_OVERLAY, DiffOverlay, DesignChooser, type AddCheckNotes, type DesignSource, type DiffOverlayState } from './check.js';
import {
  ALL_SPACING,
  TOOLS,
  captureComponent,
  checkAgainst,
  readResponsive,
  type CheckOutcome,
  type DesignChoice,
  capturePageInSteps,
  captureSection,
  captureDistance,
  readComponentStates,
  restingValues,
  stateTargets,
  type ForcedStatesReader,
  captureOne,
  capturePixel,
  captureSystem,
  liveSnapshot,
  spacingChoices,
  type LiveSnapshot,
  type Output,
  type Result,
  type ToolId
} from './tools.js';

export interface ToolbarProps {
  doc: Document;
  settings: CaptureSettings;
  onSettingsChange?: (settings: CaptureSettings) => void;
  /** Called with every file the user produces (the extension can save it). */
  onOutput?: (output: Output) => void;
  onClose: () => void;
  /** Lets the shell (or a test) feed an eyedropper color in. */
  registerPixelInput?: (pick: (hex: string) => void) => void;
  /** Exact states through the browser's debugger (the extension); without it, states come from stylesheet rules. */
  readForcedStates?: ForcedStatesReader;
  /** Where the basket is kept (the extension: its storage, shared by every tab and site). */
  basket?: BasketStore;
  /** A screenshot of the visible page as a data URL (the extension); Pixel mode reads colors from it. */
  captureScreen?: () => Promise<string>;
  /** Opens a help page (at a section, when given); the "?" button shows only when the shell has one. */
  onHelp?: (section?: string) => void;
  /** The dev toolbar's mode switch (Feedback, Capture, ...), first after "Luci". */
  modes?: ModeSwitchProps;
  /** Saves a file into the project's .luci/design/ (the dev toolbar, through luci serve); adds "Save to project". */
  saveToProject?: (fileName: string, markdown: string) => Promise<{ path: string; replaced: boolean }>;
  /** Active project details (from luci serve /health) for naming and port switching (v0.4.4). */
  projectInfo?: {
    get: () => Promise<{ project?: string; name?: string; url?: string; initialized?: boolean } | null>;
    setUrl?: (url: string) => Promise<void>;
  };
  /** Design files saved in the project, for the design check (the dev toolbar, through luci serve). */
  designs?: DesignSource;
  /** Pins a design check's differences as feedback notes (the dev toolbar); without it they are copied as a prompt. */
  addCheckNotes?: AddCheckNotes;
  /** Where those notes go, as the result says it: "your project" or "this browser". */
  checkNotesWhere?: string;
  /** Saves a component capture into the project and proposes a rule from it (the dev toolbar, through luci serve). */
  makeRule?: (fileName: string, markdown: string) => Promise<ProposedRule>;
  /** Resizes the window for reading other widths (the extension, through the debugger); without it, a hidden frame of the page is used. */
  setViewportWidth?: ViewportWidth;
  /** The bar can be dragged anywhere in the window, and stays there on this site (the extension). */
  movable?: boolean;
  /** Where "Use my tokens" finds the person's tokens (v0.4). Default: tokens pasted, kept in the page's storage. */
  myTokens?: MyTokensSource;
  /** Whether Chrome lets Luci use the debugger (the extension; a required permission there), and a way to open help about it. */
  debuggerPermission?: {
    get: () => Promise<boolean>;
    request?: () => void;
  };
  /** Check again whenever the page changes, from the start (v0.4, the dev toolbar); the person can switch it. */
  autoCheck?: boolean;
  /** Every design check run (and each automatic re-check), for the project (v0.4). */
  onCheckRun?: (run: CheckRun) => Promise<{ resolved?: string[]; updated?: string[] } | void> | void;
  /** Storage for settings in dev toolbar (v0.4.4). */
  store?: StorageLike;
}

/** The check being watched, kept for this tab so a reload picks it up again (v0.4). */
const AUTO_CHECK_KEY = 'luci.autoCheck';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));
/** The page's root font size in px (16 when it can't be read): what 1rem means on this page (B-27). */
const pageRootFontSize = (doc: Document) => {
  try { return parseFloat((doc.defaultView ?? window).getComputedStyle(doc.documentElement).fontSize) || 16; } catch { return 16; }
};
/** Keep at least this much of the window between the dragged bar and its edges. */
const EDGE = 8;

/** "Save to project", then where it went (or why not). */
function SaveButton(props: { save: () => Promise<{ path: string; replaced: boolean }>; projectName?: string; onDownload?: () => void }) {
  const [state, setState] = useState<{ busy?: boolean; done?: string; error?: string }>({});
  const run = async () => {
    setState({ busy: true });
    try {
      const r = await props.save();
      setState({ done: `${r.replaced ? 'Replaced' : 'Saved'} ${r.path}` });
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err) });
    }
  };
  const label = props.projectName ? `Save to ${props.projectName}` : 'Save to project';
  const title = props.projectName
    ? `Into ${props.projectName}/.luci/design/, where your agent reads it`
    : "Into the project's .luci/design/, where your agent reads it";
  return (
    <>
      <button type="button" data-action="save-to-project" disabled={state.busy} title={title} onClick={() => void run()}>
        {state.busy ? <><ButtonSpinner />Saving…</> : label}
      </button>
      {state.done && <span class="dim" data-part="saved">{state.done}</span>}
      {state.error && (
        <>
          <span class="error" data-part="save-error">{state.error}</span>
          {props.onDownload && (
            <button type="button" class="btn-secondary" data-action="download-fallback" onClick={props.onDownload}>
              Download file instead
            </button>
          )}
        </>
      )}
    </>
  );
}

/** What "Make it a rule" gives back: the proposal's path and the rule's line. */
export interface ProposedRule { path: string; existed: boolean; rule: string }

/**
 * "Make it a rule" (v0.3.2): the capture is saved into the project, then a rule pointing at it is
 * proposed in .luci/memory/proposed/; the person keeps it by moving the line into rules.md.
 */
function RuleButton(props: { make: () => Promise<ProposedRule> }) {
  const [state, setState] = useState<{ busy?: boolean; done?: ProposedRule; error?: string }>({});
  const run = async () => {
    setState({ busy: true });
    try {
      setState({ done: await props.make() });
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : String(err) });
    }
  };
  return (
    <>
      <button type="button" data-action="make-rule" disabled={state.busy || Boolean(state.done)}
        title="Save it into the project and propose a rule for .luci/rules.md that points at it; you review the rule before it counts" onClick={() => void run()}>
        {state.busy ? <><ButtonSpinner />Proposing…</> : state.done ? 'Rule proposed' : 'Make it a rule'}
      </button>
      {state.error && <span class="error" data-part="rule-error">{state.error}</span>}
      {state.done && (
        <div class="stack rule" data-part="rule">
          <span class="dim">{state.done.existed ? 'This rule is already waiting for your review' : 'Proposed for your review'} in <code>{state.done.path}</code> (the capture is saved too). To keep it, move this line into <code>.luci/rules.md</code>; Luci never edits rules.md itself.</span>
          <code data-part="rule-text">{state.done.rule}</code>
        </div>
      )}
    </>
  );
}

const STATE_ORDER: readonly StateName[] = ['hover', 'focus', 'focus-visible', 'active', 'disabled'];
/** The "Capture by hand" choice that walks through every state Luci could not read. */
const ALL_MISSING = 'all-missing';
type ManualTarget = StateName | typeof ALL_MISSING;
/** A state Luci checked through the browser and found no change in (not a gap to fill by hand). */
const checked = (s: ComponentCapture['states'][number]) => !s.detected && (s.method === 'forced' || s.method === 'pointer' || s.method === 'attribute');
/** States Luci could not be sure about. Disabled cannot be set by hand, so the guided walk skips it. */
const missingStates = (states: ComponentCapture['states']): StateName[] => states.filter(s => !s.detected && !checked(s) && s.state !== 'disabled').map(s => s.state);
/** How to put a component in each state, shown during the countdown. */
const STATE_HOW: Readonly<Record<StateName, string>> = {
  hover: 'point at it',
  focus: 'click into it, or Tab to it',
  'focus-visible': 'Tab to it',
  active: 'press and hold it',
  disabled: 'disable it'
};
const STATE_SECONDS = 3;

interface Picked {
  el: Element;
  entry: ElementSnapshot;
  live: LiveSnapshot;
  eligibility: Eligibility;
}

const DRAG_PX = 6;

/** What to do with each tool, shown under the bar while it is picking. */
export const TOOL_HINTS: Readonly<Record<ToolId, string>> = {
  component: 'Click a button, card, link or field.',
  text: 'Click any text.',
  color: 'Click an element. Or switch to Pixel for any spot.',
  spacing: 'Click for padding, margin and gap. Drag between two elements to measure.'
};

/** What each output gives, shown with the two buttons after a pick. */
export const OUTPUT_HINTS: Readonly<Record<ToolId, { one: string; system: string }>> = {
  component: { one: 'its parts, tokens and states', system: 'it, plus every variant on the page' },
  text: { one: 'this text style', system: 'every text style, grouped by role' },
  color: { one: 'this colour and where it is used', system: 'every colour, grouped by role' },
  spacing: { one: 'its padding, margin and gap, or one value', system: 'the page\'s scale, base unit and outliers' }
};
/** "This section" (v0.2), for the Component tool. */
export const SECTION_HINT = 'its layout, plus one file per kind of component in it. ↑ Wider takes the whole section';
/** Pixel mode's loupe: 15 × 15 pixels around the pointer, each drawn 8 px. */
const LOUPE_CELLS = 15;
const LOUPE_ZOOM = 8;
const LOUPE_PX = LOUPE_CELLS * LOUPE_ZOOM;

function Loupe(props: { shot: { ctx: CanvasRenderingContext2D; scale: number }; x: number; y: number; hex: string; left: number; top: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    c.width = LOUPE_PX;
    c.height = LOUPE_PX;
    g.imageSmoothingEnabled = false;
    const half = Math.floor(LOUPE_CELLS / 2);
    const sx = Math.floor(props.x * props.shot.scale) - half;
    const sy = Math.floor(props.y * props.shot.scale) - half;
    g.clearRect(0, 0, LOUPE_PX, LOUPE_PX);
    g.drawImage(props.shot.ctx.canvas, sx, sy, LOUPE_CELLS, LOUPE_CELLS, 0, 0, LOUPE_PX, LOUPE_PX);
    // Frame the picked pixel in whichever of Charcoal or Muzzle White stands out on it
    const [r, gr, b] = [1, 3, 5].map(i => parseInt(props.hex.slice(i, i + 2), 16));
    const light = 0.2126 * r! + 0.7152 * gr! + 0.0722 * b! > 140;
    g.lineWidth = 2;
    g.strokeStyle = getComputedStyle(c).getPropertyValue(light ? '--luci-color-muzzle-900' : '--luci-color-muzzle-50').trim();
    g.strokeRect(half * LOUPE_ZOOM + 1, half * LOUPE_ZOOM + 1, LOUPE_ZOOM - 2, LOUPE_ZOOM - 2);
  }, [props.x, props.y, props.hex, props.shot]);
  return <canvas ref={ref} class="loupe" data-part="pixel-loupe" aria-hidden="true" style={{ left: `${props.left}px`, top: `${props.top}px` }} />;
}

/** The toolbar's single-key shortcuts (in each tooltip; the menu lists them under Keys). */
export const KEYS = { component: 'V', text: 'T', color: 'C', spacing: 'S', page: 'P', check: 'K', basket: 'B', menu: 'M' } as const;
/** Each tool's icon in the toolbar (brand/luci-icons.json). */
const TOOL_ICONS: Readonly<Record<ToolId, LucideIcon>> = { component: IconComponent, text: IconText, color: IconColour, spacing: IconSpacing };
/** Luci's pose in each tool's hint (brand/BRAND.md section 5, tool table). Check uses "compare". */
export const TOOL_POSES: Readonly<Record<ToolId, MascotPose>> = { component: 'press', text: 'read', color: 'swatch', spacing: 'measure' };
const px = (v: string) => parseFloat(v) || 0;

function entryFor(live: LiveSnapshot, el: Element): ElementSnapshot | null {
  // Elements the snapshot skips (script, br...) are picked through their parent
  for (let n: Element | null = el; n; n = parentOf(n)) {
    const e = live.entryFor(n);
    if (e) return e;
  }
  return null;
}

export function Toolbar(props: ToolbarProps) {
  const { doc } = props;
  const win = doc.defaultView ?? window;
  const [tool, setTool] = useState<ToolId | null>(null);
  const [picking, setPicking] = useState(false);
  const [candidate, setCandidate] = useState<Element | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [choice, setChoice] = useState(ALL_SPACING);
  const [settings, setSettings] = useState<CaptureSettings>(props.settings);
  const useDebugger = settings.useDebugger ?? true;
  const forcedStatesReader = useDebugger ? props.readForcedStates : undefined;
  const viewportWidthSetter = useDebugger ? props.setViewportWidth : undefined;
  const [copied, setCopied] = useState(false);
  const [dropperOpen, setDropperOpen] = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uiPrefs, setUiPrefs] = useUiPrefs(doc);
  const [, setTick] = useState(0);
  // A movable bar (the extension): dragged by its own background or Luci's head, then kept where it was dropped
  const shellRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<{ id: number; x: number; y: number; shell: DOMRect; bar: DOMRect; moved: boolean; isBtn?: boolean } | null>(null);
  const justMoved = useRef(false);
  const [moving, setMoving] = useState<{ left: number; top: number } | null>(null);
  const trail = useRef<Element[]>([]);
  const drag = useRef<{ el: Element; x: number; y: number } | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  // Page listeners read these, not render-time values: they must see a key press's effect at once
  const candidateRef = useRef<Element | null>(null);
  const settingsRef = useRef<CaptureSettings>(settings);
  settingsRef.current = settings;
  const aim = (el: Element | null) => {
    candidateRef.current = el;
    setCandidate(el);
  };
  // The click that follows a pick (or drag) must not reach the page: picking a link must not follow it
  const swallowClickUntil = useRef(0);
  useLayoutEffect(() => {
    const swallow = (e: Event) => {
      if (performance.now() < swallowClickUntil.current && eventTarget(e)) {
        e.preventDefault();
        e.stopPropagation();
        swallowClickUntil.current = 0;
      }
    };
    doc.addEventListener('click', swallow, true);
    doc.addEventListener('auxclick', swallow, true);
    return () => {
      doc.removeEventListener('click', swallow, true);
      doc.removeEventListener('auxclick', swallow, true);
    };
  }, []);

  // Responsive (v0.3.4): read at other widths on request; kept on this pick's later files (a state captured by hand)
  const responsiveRef = useRef<{ selector: string; data: Responsive } | null>(null);
  const withResponsive = (o: Output): Output => {
    const r = responsiveRef.current;
    const c = o.capture;
    if (!r || (c.meta.scope !== 'component' && c.meta.scope !== 'section') || c.meta.selector !== r.selector) return o;
    return { ...o, capture: { ...c, responsive: r.data } as Output['capture'] };
  };

  const show = (given: Result, preserveRemap = false) => {
    const r: Result = given.ok ? { ok: true, output: withResponsive(given.output) } : given;
    setResult(r);
    setCopied(false);
    setAdded(false);
    setBasketOpen(false);
    setSettingsOpen(false);
    setEdited(null);
    setViewFile(null);
    if (!preserveRemap) setRemapped(null);
    if (r.ok) props.onOutput?.(r.output);
  };

  // The Component tool reads states before showing its file; a state can also be captured by hand after
  const [busy, setBusy] = useState<string | null>(null);
  const [stateNote, setStateNote] = useState<string | null>(null);
  const [componentCtx, setComponentCtx] = useState<{ live: LiveSnapshot; entry: ElementSnapshot; system: boolean; states: ComponentCapture['states']; rest: ComputedMap[] } | null>(null);
  const [manualTarget, setManualTarget] = useState<ManualTarget>(ALL_MISSING);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [capturing, setCapturing] = useState<{ state: StateName; index: number; total: number } | null>(null);
  // Bumped to cancel a running countdown (a new pick, the whole page, closing)
  const captureRun = useRef(0);
  // While states are captured by hand the user presses and clicks the component: until this time,
  // clicks on the page do nothing (a link or submit button must not navigate away)
  const guardUntil = useRef(0);
  useLayoutEffect(() => {
    const guard = (e: Event) => {
      if (performance.now() > guardUntil.current || !eventTarget(e)) return;
      if (e.type === 'click' || e.type === 'auxclick' || e.type === 'submit') e.preventDefault();
      e.stopImmediatePropagation();
    };
    const types = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'auxclick', 'submit'] as const;
    for (const t of types) win.addEventListener(t, guard, true);
    return () => { for (const t of types) win.removeEventListener(t, guard, true); };
  }, []);

  /** An unexpected error: said in the panel, and logged in full to the page's console for a bug report. */
  const failed = (err: unknown) => {
    console.error('Luci:', err);
    // A format check lists its problems as JSON: say the first one only
    const issue = (err as { issues?: { path: PropertyKey[]; message: string }[] }).issues?.[0];
    const reason = issue ? `${issue.path.map(String).join('.')}: ${issue.message}` : err instanceof Error ? err.message : String(err);
    show({ ok: false, message: `Luci could not read this page (${reason.slice(0, 200)}). The details are in the browser console (F12).` });
  };

  // The design check (v0.3): choose a design, pick the built component, see the differences
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkDesign, setCheckDesign] = useState<DesignChoice | null>(null);
  const [checkOutcome, setCheckOutcome] = useState<Extract<CheckOutcome, { ok: true }> | null>(null);
  /*
   * Automatic design check (v0.4): after a check, Luci watches the page and checks the built component
   * again whenever it changes (an edit reloading it, hot module replacement), says what changed, and
   * sends each run to the project (dev toolbar) where the agent reads it. The watch survives a reload of
   * the tab. Its own reading never counts as a change.
   */
  const [watchCheck, setWatchCheck] = useState(Boolean(props.autoCheck));
  const [checkVersion, setCheckVersion] = useState(0);
  const [diffOverlay, setDiffOverlay] = useState<DiffOverlayState>(DEFAULT_DIFF_OVERLAY);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [checkBlink, setCheckBlink] = useState<{ el: Element; label: string; key: number } | null>(null);
  const checkBlinkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const checkingNow = useRef(false);
  const checkRun = useRef(0);
  const afterEditBlinkEnabled = () => {
    try {
      const raw = props.store
        ? props.store.getItem(FEEDBACK_SETTINGS_KEY)
        : (typeof win.localStorage !== 'undefined' ? win.localStorage.getItem(FEEDBACK_SETTINGS_KEY) : null);
      if (!raw) return true;
      const parsed = JSON.parse(raw) as { afterEditBlink?: boolean };
      return parsed.afterEditBlink !== false;
    } catch {
      return true;
    }
  };
  useEffect(() => () => { clearTimeout(checkBlinkTimer.current); }, []);
  const session = (() => { try { return win.sessionStorage; } catch { return null; } })();
  const currentCheckPath = () => {
    const p = doc.location.pathname;
    if (/(?:^|\/)iframe\.html$/i.test(p)) {
      const id = new URLSearchParams(doc.location.search).get('id')?.trim();
      if (id && /^[a-z0-9_-]+$/i.test(id)) return `${p}?id=${id}`;
    }
    return p;
  };
  const forgetWatch = () => { try { session?.removeItem(AUTO_CHECK_KEY); } catch { /* storage blocked */ } };
  const afterCheck = async (outcome: Extract<CheckOutcome, { ok: true }>, design: DesignChoice, selector: string) => {
    setCheckOutcome(outcome);
    setCheckVersion(v => v + 1);
    const res = await Promise.resolve(props.onCheckRun?.({
      design: design.file, label: design.label, selector, page: cleanSource(doc.location.href), checkedAt: new Date().toISOString(),
      matches: outcome.result.matches.length,
      differences: outcome.result.differences.map(d => ({ kind: d.kind, part: d.part, ...(d.state ? { state: d.state } : {}), property: d.property, expected: d.expected, actual: d.actual, comment: d.comment, priority: d.priority }))
    })).catch(() => undefined);
    if (watchCheck) { try { session?.setItem(AUTO_CHECK_KEY, JSON.stringify({ selector, design, path: currentCheckPath() })); } catch { /* storage blocked */ } }
    return res;
  };
  const runCheck = async () => {
    if (!picked || !checkDesign) return;
    setBusy('Reading the built component and its states, then comparing it with the design…');
    setAutoNote(null);
    checkingNow.current = true;
    try {
      const outcome = await checkAgainst(picked.live, picked.entry, checkDesign, forcedStatesReader);
      if (outcome.ok) await afterCheck(outcome, checkDesign, picked.entry.selector);
      else show(outcome);
    } catch (err) {
      failed(err);
    } finally {
      checkingNow.current = false;
      setBusy(null);
    }
  };
  /** Check the same built component again (it may be a new node after a reload of the component). */
  const recheck = async () => {
    if (!checkDesign || !checkOutcome || !picked) return;
    const run = ++checkRun.current;
    const selector = picked.entry.selector;
    const el = doc.querySelector(selector);
    if (!el) { setAutoNote('The built component is not on the page right now. Luci checks again when it is back.'); return; }
    checkingNow.current = true;
    try {
      const live = liveSnapshot(doc);
      const entry = entryFor(live, el);
      if (!entry) return;
      const before = checkOutcome.result.differences.length;
      const outcome = await checkAgainst(live, entry, checkDesign, forcedStatesReader);
      if (run !== checkRun.current || !outcome.ok) return;
      setPicked(p => (p ? { ...p, el, entry, live } : p));
      const res = await afterCheck(outcome, checkDesign, selector);
      const n = outcome.result.differences.length;
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const resolvedMsg = res && typeof res === 'object' && 'resolved' in res && Array.isArray((res as { resolved?: unknown }).resolved) && (res as { resolved: string[] }).resolved.length
        ? ` ${(res as { resolved: string[] }).resolved.length} feedback note${(res as { resolved: string[] }).resolved.length === 1 ? '' : 's'} resolved automatically (${(res as { resolved: string[] }).resolved.join(', ')}).`
        : '';
      setAutoNote(`Checked again at ${time}: ${n ? `${n} difference${n === 1 ? '' : 's'}` : 'it matches the design'}${n !== before ? ` (was ${before})` : ''}.${resolvedMsg}`);
      if (afterEditBlinkEnabled()) {
        const label = n === 0 && before > 0
          ? 'Fixed · matches design'
          : `Updated · ${n ? `${n} diff${n === 1 ? '' : 's'}` : 'matches design'}`;
        setCheckBlink({ el, label, key: Date.now() });
        clearTimeout(checkBlinkTimer.current);
        checkBlinkTimer.current = setTimeout(() => setCheckBlink(null), 950);
      }
    } catch {
      // A page in the middle of reloading: the next change checks again
    } finally {
      checkingNow.current = false;
    }
  };
  useEffect(() => {
    if (!watchCheck || !checkOutcome || !checkDesign || !picked || typeof MutationObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ours = (n: Node) => {
      const el = n instanceof Element ? n : n.parentElement;
      return Boolean(el?.closest(`[${LUCI_UI_ATTRIBUTE}]`));
    };
    const observer = new MutationObserver(records => {
      // Luci's own reading (a state set for a moment) and Luci's own UI never count
      if (checkingNow.current || records.every(r => ours(r.target))) return;
      clearTimeout(timer);
      timer = setTimeout(() => { void recheck(); }, 700);
    });
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [watchCheck, checkVersion, checkDesign, picked?.entry.selector]);
  // After a reload of the tab: pick up the check that was being watched, once the component is on the page
  useEffect(() => {
    let saved: { selector: string; design: DesignChoice; path: string } | null = null;
    try { saved = JSON.parse(session?.getItem(AUTO_CHECK_KEY) ?? 'null'); } catch { saved = null; }
    if (!saved || !props.autoCheck || saved.path !== currentCheckPath()) return;
    const watch = saved;
    let tries = 0;
    const timer = setInterval(() => {
      const el = doc.querySelector(watch.selector);
      if (!el && ++tries < 40) return;
      clearInterval(timer);
      if (!el) { forgetWatch(); return; }
      const live = liveSnapshot(doc);
      const entry = entryFor(live, el);
      if (!entry) return;
      setTool('component');
      setCheckDesign(watch.design);
      setPicked({ el, entry, live, eligibility: eligibilityOf(el) });
      checkingNow.current = true;
      void checkAgainst(live, entry, watch.design, forcedStatesReader)
        .then(outcome => { if (outcome.ok) { afterCheck(outcome, watch.design, watch.selector); setAutoNote('Checked again after the page reloaded.'); } })
        .finally(() => { checkingNow.current = false; });
    }, 250);
    return () => clearInterval(timer);
  }, []);

  const produce = async (system: boolean, section = false) => {
    if (!picked || !tool) return;
    if (checkDesign) { await runCheck(); return; }
    if (section) {
      // "This section": the section file plus its component files (v0.2)
      setComponentCtx(null);
      setStateNote(null);
      setBusy('Reading the section: its layout, then each kind of component in it…');
      await nextPaint(win);
      try {
        show(captureSection(picked.live, picked.entry, settings));
      } catch (err) {
        failed(err);
      } finally {
        setBusy(null);
      }
      return;
    }
    if (tool !== 'component') {
      setComponentCtx(null);
      try {
        show(system ? captureSystem(tool, picked.live, settings, picked.entry) : captureOne(tool, picked.live, picked.entry, settings, choice));
      } catch (err) {
        failed(err);
      }
      return;
    }
    if (system && (picked.entry.tag === 'body' || picked.entry.tag === 'html')) {
      try { show(captureSystem(tool, picked.live, settings, picked.entry)); } catch (err) { failed(err); }
      return;
    }
    setBusy('Reading hover, focus, active and disabled…');
    try {
      const rest = restingValues(stateTargets(picked.live, picked.entry));
      const { states, note } = await readComponentStates(picked.live, picked.entry, forcedStatesReader);
      setStateNote(note);
      setComponentCtx({ live: picked.live, entry: picked.entry, system, states, rest });
      setManualTarget(missingStates(states).length ? ALL_MISSING : 'hover');
      show(captureComponent(picked.live, picked.entry, settings, { system, states }));
    } catch (err) {
      failed(err);
    } finally {
      setBusy(null);
    }
  };

  /** Capture by hand: one state, or every missing one in turn, each after a short countdown. */
  const captureCurrentState = () => {
    if (!componentCtx) return;
    const ctx = componentCtx;
    const queue = manualTarget === ALL_MISSING ? missingStates(ctx.states) : [manualTarget];
    if (!queue.length) return;
    const run = ++captureRun.current;
    const targets = stateTargets(ctx.live, ctx.entry);
    let states = ctx.states;
    const step = (i: number) => {
      if (run !== captureRun.current) return;
      if (i >= queue.length) {
        setCountdown(null);
        setCapturing(null);
        // The release after "press and hold" comes a moment later
        guardUntil.current = performance.now() + 1500;
        setManualTarget(missingStates(states).length ? ALL_MISSING : 'hover');
        return;
      }
      const state = queue[i]!;
      let n = STATE_SECONDS;
      setCapturing({ state, index: i + 1, total: queue.length });
      setCountdown(n);
      const tick = () => {
        if (run !== captureRun.current) return;
        guardUntil.current = performance.now() + 60_000;
        n -= 1;
        if (n > 0) { setCountdown(n); setTimeout(tick, 1000); return; }
        const captured = manualState(state, targets, ctx.rest);
        states = [...states.filter(s => s.state !== state), captured].sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
        setComponentCtx({ ...ctx, states });
        show(captureComponent(ctx.live, ctx.entry, settingsRef.current, { system: ctx.system, states }));
        step(i + 1);
      };
      guardUntil.current = performance.now() + 60_000;
      setTimeout(tick, 1000);
    };
    step(0);
  };

  const cancelCapture = () => {
    captureRun.current++;
    guardUntil.current = 0;
    setCountdown(null);
    setCapturing(null);
  };

  // "Whole page": the page's systems and every kind of component on it, in one file
  const [pageBusy, setPageBusy] = useState(false);
  const [pageStep, setPageStep] = useState<string | null>(null);
  // Bumped when another action starts, so a page read still running does not show its result over it
  const pageRun = useRef(0);
  const [wholePage, setWholePage] = useState(false);
  const endCheck = () => {
    setCheckOpen(false);
    setCheckDesign(null);
    setCheckOutcome(null);
    setAutoNote(null);
    forgetWatch();
  };
  /** The bar's "Check": choose the design first. */
  const openCheck = () => {
    cancelCapture();
    pageRun.current++;
    setPageBusy(false);
    setWholePage(false);
    setPicking(false);
    setPicked(null);
    setResult(null);
    setNotice(null);
    setBasketOpen(false);
    setSettingsOpen(false);
    setPixelMode(false);
    aim(null);
    setCheckOutcome(null);
    setCheckOpen(true);
    // The basket's components can be designs
    if (store) void store.load().then(setBasket);
  };
  const chooseDesign = (d: DesignChoice) => {
    setCheckDesign(d);
    startPicking('component');
  };
  const captureWholePage = () => {
    cancelCapture();
    setTool(null);
    setPicking(false);
    setPicked(null);
    setResult(null);
    setNotice(null);
    setComponentCtx(null);
    setStateNote(null);
    setBasketOpen(false);
    setSettingsOpen(false);
    setPixelMode(false);
    setPixelHover(null);
    setInstructions('');
    endCheck();
    aim(null);
    setWholePage(true);
    setPageBusy(true);
    setPageStep(null);
    // In steps, each painted before its work, so the loader says where Luci is
    const run = ++pageRun.current;
    void capturePageInSteps(doc, settingsRef.current, {
      onStep: s => { if (run === pageRun.current) setPageStep(s); },
      pause: () => nextPaint(win)
    }).then(r => { if (run === pageRun.current) show(r); }, err => { if (run === pageRun.current) failed(err); })
      .finally(() => { if (run === pageRun.current) { setPageBusy(false); setPageStep(null); } });
  };

  const startPicking = (t: ToolId) => {
    // Focus leaves the tool button, so Enter picks instead of pressing the button again
    const active = (doc.querySelector('luci-toolbar')?.shadowRoot?.activeElement ?? null) as HTMLElement | null;
    active?.blur();
    cancelCapture();
    pageRun.current++;
    setPageBusy(false);
    setImageMode(false);
    setPageStep(null);
    setWholePage(false);
    // A design check keeps its design while picking the built component; its last result goes
    setCheckOutcome(null);
    responsiveRef.current = null;
    setWidthNote(null);
    setCheckOpen(false);
    setTool(t);
    setPicking(true);
    setPicked(null);
    setResult(null);
    setNotice(null);
    setComponentCtx(null);
    setStateNote(null);
    setCountdown(null);
    setBasketOpen(false);
    setSettingsOpen(false);
    setPixelMode(false);
    setPixelHover(null);
    setInstructions('');
    aim(null);
    lastPointer.current = null;
    trail.current = [];
  };

  const select = (el: Element) => {
    const elig = eligibilityOf(el);
    if (elig.status === 'blocked') {
      setNotice(elig.reason);
      return;
    }
    const live = liveSnapshot(doc);
    const entry = entryFor(live, el);
    if (!entry) return;
    responsiveRef.current = null;
    setWidthNote(null);
    // Widening while hovering carries over, so ↓ can walk back down after the click
    pickedTrail.current = [...trail.current];
    setPicked({ el, entry, live, eligibility: elig });
    setPicking(false);
    setNotice(null);
    setChoice(ALL_SPACING);
    setResult(null);
  };

  // After a click the selection stays, and ↑ ↓ (or the Wider / Narrower buttons) change it before an output is chosen
  const pickedTrail = useRef<Element[]>([]);
  const reselect = (el: Element) => {
    if (!picked) return;
    const entry = entryFor(picked.live, el);
    if (!entry) return;
    setPicked({ ...picked, el, entry, eligibility: eligibilityOf(el) });
    setChoice(ALL_SPACING);
  };
  const widerOf = (el: Element) => { const p = parentOf(el); return p && p !== doc.documentElement ? p : null; };
  const narrowerOf = (el: Element) => pickedTrail.current[pickedTrail.current.length - 1] ?? firstChildOf(el);
  const widen = () => {
    if (!picked) return;
    const p = widerOf(picked.el);
    if (!p) return;
    pickedTrail.current.push(picked.el);
    reselect(p);
  };
  const narrow = () => {
    if (!picked) return;
    const c = pickedTrail.current.pop() ?? firstChildOf(picked.el);
    if (c) reselect(c);
  };
  const choosing = !picking && !basketOpen && !settingsOpen && Boolean(picked) && !result && !busy && !checkOutcome;
  const checking = checkOpen || checkDesign !== null;
  useLayoutEffect(() => {
    if (!choosing) return;
    const onKey = (e: KeyboardEvent) => {
      const focused = e.composedPath()[0];
      if (focused instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(focused.tagName) && e.key === 'Enter') return;
      if (e.key === 'ArrowUp') { e.preventDefault(); widen(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); narrow(); }
      else if (e.key === 'Enter' && picked?.eligibility.status === 'allowed') { e.preventDefault(); void produce(false); }
    };
    doc.addEventListener('keydown', onKey, true);
    return () => doc.removeEventListener('keydown', onKey, true);
  }, [choosing, picked]);

  useEffect(() => {
    props.registerPixelInput?.((hex: string) => {
      const live = liveSnapshot(doc);
      setTool('color');
      setPicking(false);
      setPicked(null);
      show(capturePixel(live, hex, settingsRef.current));
    });
  });

  // While picking, a transparent layer above the page takes every pointer event (see the pick-layer
  // below), so the page never sees a press or click, however its links and buttons are wired.
  // These handlers get the layer's pointer positions and find the page element under them.
  const pickMove = (x: number, y: number) => {
    // Chrome sends a move when the layout under a still pointer changes; only real moves re-aim the picker
    const last = lastPointer.current;
    if (last && last.x === x && last.y === y) return;
    lastPointer.current = { x, y };
    const target = elementAt(doc, x, y);
    if (!target) return;
    trail.current = [];
    aim(target);
  };
  const pickDown = (x: number, y: number) => {
    const target = elementAt(doc, x, y);
    if (target) drag.current = { el: target, x, y };
  };
  const pickWheel = (e: WheelEvent) => {
    // The layer would stop scrolling inside the page's own scroll areas: pass the wheel on
    const area = scrollableAncestor(elementAt(doc, e.clientX, e.clientY), e.deltaX, e.deltaY);
    if (area) { e.preventDefault(); area.scrollBy(e.deltaX, e.deltaY); }
  };
  const pickUp = (x: number, y: number, touch = false) => {
    {
      const target = elementAt(doc, x, y);
      const start = drag.current;
      drag.current = null;
      if (!target || !start || !tool) return;
      const moved = Math.hypot(x - start.x, y - start.y) > DRAG_PX;
      // By touch (no hover), a first tap shows what would be taken; a second tap on it takes it
      if (touch && !moved && target !== candidateRef.current) { trail.current = []; aim(target); return; }
      if (tool === 'spacing' && moved && target !== start.el) {
        // A drag between two elements measures the distance between them (FR15)
        const blocked = [start.el, target].map(eligibilityOf).find(x => x.status !== 'allowed');
        if (blocked) { setNotice('reason' in blocked ? blocked.reason : null); return; }
        const live = liveSnapshot(doc);
        const a = entryFor(live, start.el);
        const b = entryFor(live, target);
        if (!a || !b) return;
        setPicking(false);
        setPicked(null);
        show(captureDistance(live, a, b, settingsRef.current));
        return;
      }
      // After arrow keys, a click picks what the keys aimed at
      select(candidateRef.current && trail.current.length ? candidateRef.current : target);
    }
  };

  // Keys while picking (move, pick, cancel); after scrolling, re-aim at what is now under the pointer
  useLayoutEffect(() => {
    if (!picking || !tool) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setPicking(false); aim(null); setNotice(null); return; }
      // While picking, arrows and Enter belong to the picker, wherever focus is, except in a form field
      const focused = e.composedPath()[0];
      if (focused instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(focused.tagName)) return;
      const current = candidateRef.current;
      if (!current) return;
      if (e.key === 'ArrowUp') {
        // Widen to the parent; ArrowDown goes back the same way, or into the first child
        const parent = parentOf(current);
        if (parent && parent !== doc.documentElement) { trail.current.push(current); aim(parent); }
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        const child = trail.current.pop() ?? firstChildOf(current);
        if (child) aim(child);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        select(current);
      }
    };
    const onScroll = () => {
      const p = lastPointer.current;
      if (p && !trail.current.length) {
        const target = elementAt(doc, p.x, p.y);
        if (target) aim(target);
      }
      setTick(t => t + 1);
    };
    doc.addEventListener('keydown', onKey, true);
    win.addEventListener('scroll', onScroll, true);
    return () => {
      doc.removeEventListener('keydown', onKey, true);
      win.removeEventListener('scroll', onScroll, true);
    };
  }, [picking, tool]);

  // Esc also closes the panel when not picking
  useLayoutEffect(() => {
    if (picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (basketOpen || settingsOpen || picked || result || checkOutcome || checkOpen)) {
        if (basketOpen) { setBasketOpen(false); return; }
        if (settingsOpen) { setSettingsOpen(false); return; }
        setPicked(null); setResult(null); endCheck();
      }
    };
    doc.addEventListener('keydown', onKey, true);
    return () => doc.removeEventListener('keydown', onKey, true);
  }, [picking, basketOpen, settingsOpen, picked, result, checkOutcome, checkOpen]);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const changeSettings = (next: CaptureSettings) => {
    // Hand edits belong to one file format: switching it starts from the capture again
    if ((next.style ?? 'stitch') !== (settings.style ?? 'stitch')) setEdited(null);
    setSettings(next);
    setCopied(false);
    props.onSettingsChange?.(next);
  };

  const output = result?.ok ? result.output : null;
  // "Use my tokens" (v0.4): the person's tokens, and the rewrite in place (with the site's values to undo it)
  const myTokens = useMemo<MyTokensSource>(() => props.myTokens ?? pageTokenStore(doc), [props.myTokens]);
  const [remapped, setRemapped] = useState<{ fileName: string; original: Output; summary: string } | null>(null);
  // The user's instructions for their agent go into the file word for word; the file can also be edited
  // by hand, and then copy, download and the basket use exactly the edited text
  const [instructions, setInstructions] = useState('');
  const [edited, setEdited] = useState<string | null>(null);
  const captureWithInstructions = output ? ({ ...output.capture, ...(instructions.trim() ? { instructions: instructions.trim() } : {}) } as typeof output.capture) : null;
  // The file people copy and download: DESIGN.md for Google Stitch (default), Luci's tables, Tailwind CSS, or CSS Variables
  const activeStyle = settings.style ?? 'stitch';
  const isStitch = activeStyle === 'stitch';
  const isTailwind = activeStyle === 'tailwind';
  const isTailwindV3 = activeStyle === 'tailwind-v3';
  const isCssVars = activeStyle === 'css-vars';
  const isTokenExport = isTailwind || isTailwindV3 || isCssVars;
  const isCustomExport = isStitch || isTokenExport;
  const stitch = isStitch;
  // rem on this page's root font size, not always 16px (B-27); UI defaults to Smart units (rem / % / px)
  const effectiveUnits = settings.units ?? 'smart';
  const pageSettings: CaptureSettings = { ...settings, units: effectiveUnits, rootFontSize: pageRootFontSize(doc) };
  const luciMarkdown = (!isCustomExport ? edited : null) ?? (captureWithInstructions ? formatCapture(captureWithInstructions, pageSettings) : '');
  const markdown = edited ?? (captureWithInstructions
    ? (isStitch
        ? formatStitch([captureWithInstructions, ...(output?.files ?? []).map(f => f.capture)], { settings: pageSettings })
        : isTailwind
          ? formatTailwind([captureWithInstructions, ...(output?.files ?? []).map(f => f.capture)], { settings: pageSettings })
          : isTailwindV3
            ? formatTailwindV3([captureWithInstructions, ...(output?.files ?? []).map(f => f.capture)], { settings: pageSettings })
            : isCssVars
              ? formatCssVariables([captureWithInstructions, ...(output?.files ?? []).map(f => f.capture)], { settings: pageSettings })
              : luciMarkdown)
    : '');
  const outputName = output
    ? (isStitch
        ? STITCH_FILE_NAME
        : isTailwind
          ? TAILWIND_V4_FILE_NAME
          : isTailwindV3
            ? TAILWIND_V3_FILE_NAME
            : isCssVars
              ? CSS_VARS_FILE_NAME
              : output.fileName)
    : '';
  const changeInstructions = (text: string) => {
    setInstructions(text);
    setCopied(false);
    // Edited text keeps the edits; only its instructions section follows the box. Edited CSS or JS
    // (a token export) gets no Markdown section: the note stays in Luci's file (B-29)
    if (edited !== null && !isTokenExport) setEdited(withInstructions(edited, text));
  };

  const copyText = async (text: string) => {
    try {
      await win.navigator.clipboard.writeText(text);
    } catch {
      // Without clipboard permission: the classic copy through a selected text area
      const area = doc.createElement('textarea');
      area.value = text;
      area.setAttribute('data-luci-ui', '');
      doc.body.appendChild(area);
      area.select();
      doc.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1400);
  };

  const downloadText = (fileName: string, text: string) => {
    const mime = fileName.endsWith('.css')
      ? 'text/css'
      : fileName.endsWith('.js')
        ? 'text/javascript'
        : 'text/markdown';
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = fileName;
    a.setAttribute('data-luci-ui', '');
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const [widthBusy, setWidthBusy] = useState<string | null>(null);
  const [widthNote, setWidthNote] = useState<{ error?: boolean; text: string } | null>(null);
  /** "How it changes by width": read at the site's own breakpoints, then add Responsive to the file. */
  const addResponsive = async () => {
    if (!picked || !output) return;
    const kind = output.capture.meta.scope === 'section' ? 'section' : 'component';
    const onWidth = (w: number, i: number, n: number) => setWidthBusy(`Reading it at ${w}px (${i + 1} of ${n})…`);
    setWidthNote(null);
    setWidthBusy('Finding the widths in the site\'s media queries…');
    await nextPaint(win);
    try {
      let data: Responsive;
      let note: string | null = null;
      try {
        data = await readResponsive(picked.live, picked.entry, kind, { ...(viewportWidthSetter ? { setWidth: viewportWidthSetter } : {}), onWidth });
      } catch (err) {
        if (!viewportWidthSetter) throw err;
        // The window could not be resized (the debugger was refused): a frame of the page instead
        data = await readResponsive(picked.live, picked.entry, kind, { onWidth });
        note = `The window could not be resized (${err instanceof Error ? err.message : String(err)}), so Luci read the page in a hidden frame instead.`;
      }
      responsiveRef.current = { selector: output.capture.meta.selector!, data };
      if (remapped) {
        setRemapped(prev => prev ? { ...prev, original: withResponsive(prev.original) } : null);
      }
      show({ ok: true, output }, true);
      setWidthNote({ text: note ?? `${data.changes.length ? `${data.changes.length} change${data.changes.length === 1 ? '' : 's'}` : 'Nothing changes'} at ${data.widths.map(w => `${w}px`).join(', ')}: see Responsive in the file.` });
    } catch (err) {
      setWidthNote({ error: true, text: `Luci could not read other widths: ${err instanceof Error ? err.message : String(err)}.` });
    } finally {
      setWidthBusy(null);
    }
  };

  const copy = () => copyText(markdown);
  const download = () => { if (output) downloadText(outputName, markdown); };

  // A section (v0.2): its component files follow the unit and color settings too
  const [viewFile, setViewFile] = useState<{ fileName: string; markdown: string } | null>(null);
  const sectionFiles = (output?.files ?? []).map(f => ({ fileName: f.fileName, markdown: formatCapture(f.capture, pageSettings), capture: f.capture }));
  const downloadZip = () => {
    if (!output) return;
    // The .zip holds Luci's .design.md files, whatever File is set to: never CSS under a .design.md name (B-29)
    const bytes = zip([{ name: output.fileName, data: luciMarkdown }, ...sectionFiles.map(f => ({ name: f.fileName, data: f.markdown }))]);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = output.fileName.replace(/\.design\.md$/, '.zip');
    a.setAttribute('data-luci-ui', '');
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  /** Save to project: the file, and a section's component files with it. */
  const saveAll = async () => {
    // The project keeps Luci's tables (the design check and the agent's tools read them), whatever is copied
    const first = await props.saveToProject!(output!.fileName, luciMarkdown);
    for (const f of sectionFiles) await props.saveToProject!(f.fileName, f.markdown);
    return sectionFiles.length ? { ...first, path: `${first.path} and ${sectionFiles.length} component file${sectionFiles.length === 1 ? '' : 's'}` } : first;
  };

  // The basket (FR18, FR19): kept by the shell's store, so it survives pages and sites
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [basketExport, setBasketExport] = useState<{ title: string; item?: BasketItem } | null>(null);
  // Compare mode (v0.4): two basket items picked, and their comparison when asked
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<{ items: [BasketItem, BasketItem]; result: CompareResult } | null>(null);
  const compareItems = (() => {
    const picked2 = compareIds.map(id => basket.find(i => i.id === id)).filter((i): i is BasketItem => Boolean(i));
    return picked2.length === 2 ? [picked2[0]!, picked2[1]!] as [BasketItem, BasketItem] : null;
  })();
  const [added, setAdded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const store = props.basket;
  // Until the stored basket has loaded, changes start from the stored items, never from an empty list
  const basketLoaded = useRef(false);
  useEffect(() => {
    if (store) void store.load().then(items => { basketLoaded.current = true; setBasket(items); });
  }, [store]);
  const saveBasket = (next: BasketItem[]) => {
    setBasket(next);
    void store?.save(next);
  };
  const addCurrent = async () => {
    if (!output) return;
    setAdded(true);
    const current = basketLoaded.current || !store ? basket : await store.load();
    basketLoaded.current = true;
    let next = addToBasket(current, captureWithInstructions ?? output.capture, (!isCustomExport ? edited : null) ?? undefined);
    // A section's component files go in with it
    for (const f of output.files ?? []) next = addToBasket(next, f.capture);
    saveBasket(next);
  };
  const openBasket = () => {
    endCheck();
    setMergedNote(null);
    setPicking(false);
    aim(null);
    setSettingsOpen(false);
    setBasketOpen(true);
    setBasketExport(null);
    setConfirmClear(false);
    setCopied(false);
    setBasketStatus(null);
    // The latest items, in case another tab added some
    if (store) void store.load().then(setBasket);
  };
  // Multi-page system merge (v0.3.3): systems of one site from several pages, as one site-level system
  const mergeable = mergeGroups(basket);
  const [mergedNote, setMergedNote] = useState<string | null>(null);
  const mergeSystemsNow = () => {
    const { items, merged } = mergeInBasket(basket);
    saveBasket(items);
    setMergedNote(`Added to the basket: ${merged.map(m => `${m.name} (${sourceLabel(m)})`).join(', ')}. The page systems stay; export the site system${merged.length === 1 ? '' : 's'} like any item.`);
  };

  // Connected project info (v0.4.4): active project name from luci serve /health
  const [activeProject, setActiveProject] = useState<{ project?: string; name?: string; url?: string; initialized?: boolean } | null>(null);
  const [bridgePortInput, setBridgePortInput] = useState('');

  const refreshProject = () => {
    if (props.projectInfo?.get) {
      props.projectInfo.get().then(info => {
        setActiveProject(info);
        if (info?.url) setBridgePortInput(info.url);
      }).catch(() => { setActiveProject(null); });
    }
  };

  useEffect(() => {
    refreshProject();
  }, [props.projectInfo]);

  // Debugger permission status (v0.4.4 Option 3)
  const [debuggerGranted, setDebuggerGranted] = useState<boolean | null>(null);
  useEffect(() => {
    if (!props.debuggerPermission) return;
    props.debuggerPermission.get().then(setDebuggerGranted).catch(() => setDebuggerGranted(false));
  }, [props.debuggerPermission, settingsOpen]);
  /** "About the debugger": the help page at its debugger section, whatever the debugger's state. */
  const openDebuggerHelp = () => {
    if (props.onHelp) props.onHelp('debugger-permission');
    else props.debuggerPermission?.request?.();
  };

  // Direct send to project (v0.4.4): push basket captures straight to .luci/design/
  const [itemSent, setItemSent] = useState<Record<string, { path?: string; error?: string }>>({});
  const [basketSending, setBasketSending] = useState(false);
  const [basketStatus, setBasketStatus] = useState<{ text: string; error?: boolean; download?: () => void } | null>(null);

  const sendOneToProject = async (item: BasketItem) => {
    if (!props.saveToProject) return;
    const { fileName, markdown } = exportItem(item, settings);
    try {
      const res = await props.saveToProject(fileName, markdown);
      setItemSent(prev => ({ ...prev, [item.id]: { path: res.path } }));
      const target = activeProject?.name ? `${activeProject.name}/` : '';
      setBasketStatus({ text: `${res.replaced ? 'Replaced in' : 'Saved to'} ${target}${res.path}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setItemSent(prev => ({ ...prev, [item.id]: { error: msg } }));
      setBasketStatus({ text: msg, error: true, download: () => downloadText(fileName, markdown) });
    }
  };

  const sendAllToProject = async () => {
    if (!props.saveToProject || !basket.length) return;
    setBasketSending(true);
    try {
      let saved = 0;
      for (const item of basket) {
        const { fileName, markdown } = exportItem(item, settings);
        const res = await props.saveToProject(fileName, markdown);
        setItemSent(prev => ({ ...prev, [item.id]: { path: res.path } }));
        saved++;
      }
      const target = activeProject?.name ? `${activeProject.name}/.luci/design/` : '.luci/design/';
      setBasketStatus({ text: `Saved ${saved} capture${saved === 1 ? '' : 's'} into ${target}.` });
    } catch (err) {
      const all = exportBasket(basket, settings);
      setBasketStatus({ text: err instanceof Error ? err.message : String(err), error: true, download: () => downloadText(all.fileName, all.markdown) });
    } finally {
      setBasketSending(false);
    }
  };
  const basketSettings: CaptureSettings = { ...settings, units: effectiveUnits, rootFontSize: pageRootFontSize(doc) };
  const exported = basketExport
    ? (isStitch
      // DESIGN.md for Stitch: the item, or the whole basket, in one file (with each item's note)
      ? { fileName: STITCH_FILE_NAME, markdown: formatStitch((basketExport.item ? [basketExport.item] : basket).map(i => i.capture), { settings: basketSettings }) }
      : isTailwind
        ? { fileName: TAILWIND_V4_FILE_NAME, markdown: formatTailwind((basketExport.item ? [basketExport.item] : basket).map(i => i.capture), { settings: basketSettings }) }
        : isTailwindV3
          ? { fileName: TAILWIND_V3_FILE_NAME, markdown: formatTailwindV3((basketExport.item ? [basketExport.item] : basket).map(i => i.capture), { settings: basketSettings }) }
          : isCssVars
            ? { fileName: CSS_VARS_FILE_NAME, markdown: formatCssVariables((basketExport.item ? [basketExport.item] : basket).map(i => i.capture), { settings: basketSettings }) }
            : basketExport.item ? exportItem(basketExport.item, basketSettings) : basket.length ? exportBasket(basket, basketSettings) : null)
    : null;
  /** What "Save to project" keeps: Luci's file, whatever File is set to; the project only takes .design.md files (B-29). */
  const luciExport = () => (basketExport?.item ? exportItem(basketExport.item, settings) : exportBasket(basket, settings));

  const Dropper = (win as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
  const hasDropper = Boolean(Dropper);

  // Pixel mode: a screenshot of the page (taken with Luci hidden), read under the pointer. Unlike the
  // browser's eyedropper it leaves Luci's own panels usable, and stays on until a pixel is picked.
  const [pixelMode, setPixelMode] = useState(false);
  const [pixelHover, setPixelHover] = useState<{ x: number; y: number; hex: string } | null>(null);
  const shot = useRef<{ ctx: CanvasRenderingContext2D; scale: number } | null>(null);
  const canPickPixels = Boolean(props.captureScreen) || hasDropper;
  const takeShot = async () => {
    if (!props.captureScreen) return;
    const host = doc.querySelector('luci-toolbar') as HTMLElement | null;
    if (host) host.style.visibility = 'hidden';
    try {
      // Let the browser paint the page without Luci before the screenshot
      await Promise.race([
        new Promise(r => win.requestAnimationFrame(() => win.requestAnimationFrame(r))),
        new Promise(r => setTimeout(r, 120))
      ]);
      const img = new Image();
      img.src = await props.captureScreen();
      await img.decode();
      const canvas = doc.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      shot.current = { ctx, scale: img.naturalWidth / (doc.documentElement.clientWidth || win.innerWidth) };
    } finally {
      if (host) host.style.visibility = '';
    }
  };
  const samplePixel = (x: number, y: number) => {
    const s = shot.current;
    if (!s) return null;
    const [r, g, b] = s.ctx.getImageData(Math.floor(x * s.scale), Math.floor(y * s.scale), 1, 1).data;
    const hex = `#${[r, g, b].map(n => (n ?? 0).toString(16).padStart(2, '0')).join('')}`;
    return { x, y, hex };
  };
  const pickPixelAt = (x: number, y: number) => {
    const p = samplePixel(x, y);
    if (!p) return;
    setPixelMode(false);
    setPixelHover(null);
    show(capturePixel(liveSnapshot(doc), p.hex, settingsRef.current));
  };
  const startPixel = async () => {
    if (!props.captureScreen) { await pickPixel(); return; }
    setPicking(false);
    aim(null);
    setPicked(null);
    setResult(null);
    setTool('color');
    try {
      await takeShot();
      setPixelMode(true);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      // Keep working: fall back to the browser's eyedropper, and say why
      if (hasDropper) {
        setStateNote(`Luci's own pixel picker is not available here (${reason}), so the browser's eyedropper was used instead.`);
        await pickPixel();
        return;
      }
      startPicking('color');
      setNotice(`Pixel mode could not start: ${reason} Click an element to take its color.`);
    }
  };
  useLayoutEffect(() => {
    if (!pixelMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setPixelMode(false);
      setPixelHover(null);
      startPicking('color');
    };
    // After scrolling, the screenshot is out of date: take a new one
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      setPixelHover(null);
      clearTimeout(timer);
      timer = setTimeout(() => { void takeShot(); }, 200);
    };
    doc.addEventListener('keydown', onKey, true);
    win.addEventListener('scroll', onScroll, true);
    win.addEventListener('resize', onScroll);
    return () => {
      clearTimeout(timer);
      doc.removeEventListener('keydown', onKey, true);
      win.removeEventListener('scroll', onScroll, true);
      win.removeEventListener('resize', onScroll);
    };
  }, [pixelMode]);
  /*
   * Screenshot mode (v0.4): the Colour tool's Image. A screenshot (dropped, pasted or chosen) gives a
   * color system estimated from its pixels: the palette, each color's share and a guessed role.
   */
  const [imageMode, setImageMode] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const startImage = () => {
    setPicking(false);
    aim(null);
    setPicked(null);
    setResult(null);
    setPixelMode(false);
    setTool('color');
    setNotice(null);
    setImageMode(true);
  };
  const readImageFile = async (file: Blob, name: string) => {
    if (!/^image\//.test(file.type)) { setNotice(`${name} is not an image. Drop a PNG, JPEG or WebP screenshot.`); return; }
    setImageBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      // A small copy is enough for a palette, and keeps a large screenshot fast
      const scale = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height, 1));
      const canvas = doc.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      const system = imageColorSystem(estimatePalette(ctx.getImageData(0, 0, canvas.width, canvas.height).data), { file: name, captured: new Date().toISOString().slice(0, 10) });
      setImageMode(false);
      show(system
        ? { ok: true, output: { capture: system, fileName: imageFileName(name), markdown: formatCapture(system, settingsRef.current) } }
        : { ok: false, message: 'Luci found no colours in this image: it is empty or see-through.' });
    } catch (err) {
      setNotice(`Luci could not read this image (${err instanceof Error ? err.message : String(err)}).`);
    } finally {
      setImageBusy(false);
    }
  };
  useLayoutEffect(() => {
    if (!imageMode) return;
    // Paste a screenshot from the clipboard; Esc goes back to Element
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.items ?? [])].find(i => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
      if (!file) return;
      e.preventDefault();
      void readImageFile(file, file.name && file.name !== 'image.png' ? file.name : 'pasted-image.png');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setImageMode(false);
      startPicking('color');
    };
    doc.addEventListener('paste', onPaste, true);
    doc.addEventListener('keydown', onKey, true);
    return () => { doc.removeEventListener('paste', onPaste, true); doc.removeEventListener('keydown', onKey, true); };
  }, [imageMode]);
  const pickPixel = async () => {
    if (!Dropper) return;
    // While the eyedropper is open, the page picker steps aside
    setPicking(false);
    setDropperOpen(true);
    try {
      const { sRGBHex } = await new Dropper().open();
      setDropperOpen(false);
      setPicked(null);
      show(capturePixel(liveSnapshot(doc), sRGBHex, settingsRef.current));
    } catch {
      // Esc in the eyedropper: back to picking an element
      setDropperOpen(false);
      startPicking('color');
    }
  };

  // The tool in use, for the pill (including Pixel mode and the eyedropper)
  const currentTool: ToolId | null = !checking && !wholePage && tool && (picking || dropperOpen || pixelMode || imageMode || Boolean(picked) || Boolean(result)) ? tool : null;
  const pickTool = (t: ToolId) => { setSettingsOpen(false); setBasketOpen(false); setCheckDesign(null); startPicking(t); };
  const toggleMenu = () => setSettingsOpen(s => !s);
  const toggleBasket = () => { setSettingsOpen(false); if (basketOpen) setBasketOpen(false); else openBasket(); };
  // Single-key shortcuts while the toolbar is open (never while typing; the brand kit, section 7)
  useShortcuts(doc, [
    ...TOOLS.map(t => ({ key: KEYS[t], run: () => pickTool(t) })),
    { key: KEYS.page, run: () => void captureWholePage() },
    { key: KEYS.check, run: openCheck },
    { key: KEYS.basket, run: toggleBasket },
    { key: KEYS.menu, run: toggleMenu }
  ], countdown === null);

  // First run: Luci greets once, until the first tool or panel is opened (BRAND.md: first run, slow blink)
  const idle = !settingsOpen && !basketOpen && !picking && !picked && !result && !pageBusy && !checkOpen && !pixelMode && !dropperOpen && !imageMode;
  const greeting = idle && !uiPrefs.greeted;
  useEffect(() => { if (!idle && !uiPrefs.greeted) setUiPrefs({ greeted: true }); }, [idle]);

  // ---- Moving the bar (the extension): anywhere in the window, kept per site ----------------
  const place = props.movable ? uiPrefs.place ?? null : null;
  useEffect(() => {
    if (!place) return;
    const onResize = () => setTick(t => t + 1);
    win.addEventListener('resize', onResize);
    return () => win.removeEventListener('resize', onResize);
  }, [Boolean(place)]);
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  const startMove = (e: PointerEvent) => {
    const bar = barRef.current, shell = shellRef.current;
    if (!props.movable || e.button !== 0 || !bar || !shell) return;
    // The bar's own background, its separators or Luci's head: the tools stay plain buttons
    const t = e.target as Element;
    if (t !== bar && !t.closest?.('.menu-btn, .bar-sep')) return;
    const isBtn = Boolean(t.closest?.('.menu-btn'));
    moveRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, shell: shell.getBoundingClientRect(), bar: bar.getBoundingClientRect(), moved: false, isBtn };
    // Follow the pointer wherever it goes (a quick drag leaves the bar before it counts as one)
    const cleanup = () => {
      doc.removeEventListener('pointermove', doMove, true);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('pointercancel', onUp, true);
      dragCleanupRef.current = null;
    };
    dragCleanupRef.current = cleanup;
    const onUp = (ev: PointerEvent) => {
      endMove(ev);
      if (moveRef.current) return;
      cleanup();
    };
    doc.addEventListener('pointermove', doMove, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointercancel', onUp, true);
  };
  const doMove = (e: PointerEvent) => {
    const m = moveRef.current;
    if (!m || m.id !== e.pointerId) return;
    // Released outside the bar before a drag began: nothing to move
    if (!m.moved && !(e.buttons & 1)) { moveRef.current = null; return; }
    const rawX = e.clientX - m.x, rawY = e.clientY - m.y;
    // A few pixels first, so a click on Luci's head still opens the menu
    const threshold = m.isBtn ? 14 : 4;
    if (!m.moved && Math.hypot(rawX, rawY) < threshold) return;
    // Only now take the pointer: capturing on press would turn a click on Luci's head into a click on the bar
    if (!m.moved) barRef.current?.setPointerCapture?.(e.pointerId);
    m.moved = true;
    const dx = clamp(rawX, EDGE - m.bar.left, win.innerWidth - EDGE - m.bar.right);
    const dy = clamp(rawY, EDGE - m.bar.top, win.innerHeight - EDGE - m.bar.bottom);
    setMoving({ left: m.shell.left + dx, top: m.shell.top + dy });
  };
  const endMove = (e: PointerEvent) => {
    const m = moveRef.current;
    if (!m || m.id !== e.pointerId) return;
    moveRef.current = null;
    barRef.current?.releasePointerCapture?.(e.pointerId);
    if (!m.moved || !barRef.current) return;
    // The click that ends a drag is not a click on Luci's head
    justMoved.current = true;
    win.setTimeout(() => { justMoved.current = false; }, 0);
    const r = barRef.current.getBoundingClientRect();
    const vw = win.innerWidth, vh = win.innerHeight;
    const h = r.left + r.width / 2 < vw / 2 ? 'left' : 'right';
    const v = r.top + r.height / 2 < vh / 2 ? 'top' : 'bottom';
    setMoving(null);
    setUiPrefs({ place: { h, v, x: Math.round(h === 'left' ? r.left : vw - r.right), y: Math.round(v === 'top' ? r.top : vh - r.bottom) }, dock: h });
  };
  const swallowDragClick = (e: MouseEvent) => {
    if (!justMoved.current) return;
    justMoved.current = false;
    e.stopPropagation();
    e.preventDefault();
  };
  // Where the shell goes: under the pointer while dragging, else the saved corner, kept inside the window.
  // Cards open on the side with room: below a bar in the top half, above one in the bottom half.
  const shellStyle: Record<string, string> | undefined = (() => {
    if (moving) return { left: `${moving.left}px`, top: `${moving.top}px`, right: 'auto', bottom: 'auto', maxHeight: `calc(100vh - ${EDGE * 2}px)` };
    if (!place) return undefined;
    const barW = barRef.current?.offsetWidth ?? 0, barH = barRef.current?.offsetHeight ?? 0;
    const x = clamp(place.x, EDGE, win.innerWidth - EDGE - barW);
    const y = clamp(place.y, EDGE, win.innerHeight - EDGE - barH);
    return {
      [place.h]: `${x}px`, [place.h === 'left' ? 'right' : 'left']: 'auto',
      [place.v]: `${y}px`, [place.v === 'top' ? 'bottom' : 'top']: 'auto',
      maxHeight: `calc(100vh - ${y + EDGE}px)`
    };
  })();

  const hovered = picking ? candidate : null;
  const hoverElig = hovered ? eligibilityOf(hovered) : null;
  const rect = hovered?.getBoundingClientRect();
  const cs = hovered && tool === 'spacing' ? win.getComputedStyle(hovered) : null;
  const isDevToolbar = Boolean(props.modes && !props.movable);
  const isExtensionToolbar = Boolean(props.modes && props.movable);

  return (
    <div class="luci luci-theme" data-theme={uiPrefs.theme} data-dock={uiPrefs.dock}>
      <div class="shell" data-part="shell" ref={shellRef} style={shellStyle}
        {...(props.movable ? { 'data-movable': '' } : {})} {...(moving ? { 'data-moving': '' } : {})}
        {...(place ? { 'data-h': place.h, 'data-v': place.v } : {})}>
        <div class="bar" role="toolbar" aria-label={isDevToolbar ? COPY.capture.devTitle : COPY.capture.title} ref={barRef}
          onPointerDown={startMove} onClickCapture={swallowDragClick}>
          <button type="button" class="menu-btn" data-action="settings" aria-label={COPY.common.menu} aria-pressed={settingsOpen} aria-keyshortcuts={KEYS.menu}
            data-tip={`${COPY.common.menu}  ${KEYS.menu}`} onClick={toggleMenu}><LuciLogo size={48} /></button>
          {props.modes && <ModeSwitch {...props.modes} />}
          <span class="bar-sep" aria-hidden="true" />
          {/* The tool in use stays marked while the menu or the basket is open: the pill always says where you are */}
          {TOOLS.map(t => (
            <Button iconOnly size="lg" class="tool" icon={TOOL_ICONS[t]} label={COPY.capture.tools[t]} shortcut={KEYS[t]} data-tool={t}
              aria-pressed={currentTool === t} onClick={() => pickTool(t)} />
          ))}
          <Button iconOnly size="lg" class="tool" icon={IconPage} label={COPY.capture.tools.page} shortcut={KEYS.page} data-action="whole-page"
            aria-pressed={wholePage && (pageBusy || Boolean(result))} onClick={captureWholePage} />
          <Button iconOnly size="lg" class="tool" icon={IconCheck} label={COPY.capture.tools.check} shortcut={KEYS.check} data-action="check"
            aria-pressed={checking} onClick={openCheck} />
          <span class="bar-sep" aria-hidden="true" />
          <button type="button" class="basket-pill" data-action="basket" aria-pressed={basketOpen && !settingsOpen} aria-label={COPY.capture.basketLabel(basket.length)}
            aria-keyshortcuts={KEYS.basket} data-tip={`Basket  ${KEYS.basket}`} onClick={toggleBasket}>
            <Icon icon={IconBasket} /><span class="basket-full">{COPY.capture.basket(basket.length)}</span><span class="basket-n">{basket.length}</span>
          </button>
          <Button iconOnly size="lg" class="tool" icon={IconClose} label={COPY.common.close} data-action="close" onClick={props.onClose} />
        </div>

        {!isExtensionToolbar && greeting && (
          <div class="panel greet" role="status" data-part="greeting">
            <Mascot pose="hello" size={96} />
            <div class="stack">
              <p class="t-title">{COPY.capture.greeting.title}</p>
              <p class="hint">{COPY.capture.greeting.body}</p>
            </div>
          </div>
        )}

        {/* The extension toolbar start view / idle guide below the bar */}
        {isExtensionToolbar && idle && (
          <div class="sub with-luci" role="note" data-part="start-guide">
            <Mascot pose="frame" size={96} />
            <div class="sub-body">
              <p class="hint"><strong>Capture</strong> extracts components, typography, colours, and spacing for your coding agent. Pick a tool, then click an element.</p>
              <p class="keys">Switch to <strong>Team Feedback</strong> to click elements, leave plain notes, and share a review with your team.</p>
            </div>
          </div>
        )}

        {/* The dev toolbar says what Capture is for while nothing is open (after the first-run greeting) */}
        {isDevToolbar && idle && !greeting && (
          <div class="sub with-luci" role="note" data-part="intro">
            <Mascot pose="frame" size={96} />
            <div class="sub-body">
              <p class="hint">{COPY.devToolbar.intro.capture.body}</p>
              <p class="keys">{COPY.devToolbar.intro.capture.keys}</p>
            </div>
          </div>
        )}

        {settingsOpen && (
          isDevToolbar ? (
            <DevSettingsPanel
              currentMode="capture"
              uiPrefs={uiPrefs}
              onUiPrefsChange={setUiPrefs}
              projectInfo={props.projectInfo}
              store={props.store}
              captureSettings={settings}
              onCaptureSettingsChange={changeSettings}
              debuggerPermission={props.debuggerPermission}
              {...(props.onHelp ? { onHelp: props.onHelp } : {})}
            />
          ) : (
          <div class="panel" role="dialog" aria-label={COPY.common.menu} data-part="settings">
            <div class="menu-head">
              <Mascot pose="sit" size={96} />
              <div class="brand-stack">
                <div class="brand-title-line">
                  <span class="brand-title" data-part="brand-title">{isDevToolbar ? COPY.capture.devTitle : COPY.capture.title}</span>
                  <span class="brand-sub" data-part="brand-sub">{isDevToolbar ? COPY.capture.devByline : COPY.capture.byline}</span>
                </div>
                <p class="brand-desc">{isDevToolbar ? COPY.capture.devDescription : COPY.capture.description}</p>
                {props.onHelp && <div class="row"><Button variant="secondary" icon={IconInfo} data-action="help" onClick={() => props.onHelp!()}>{COPY.common.help}</Button></div>}
              </div>
              <RepoButton />
            </div>
            {/* The extension is the small part of Luci: the rest lives in your project (no pop-up, here only) */}
            {!isDevToolbar && (
              <div class="invite" data-part="invite">
                <p class="invite-title">{COPY.capture.invite.title}</p>
                <p class="invite-body">{COPY.capture.invite.body}</p>
                {LUCI_REPO_URL
                  ? <a class="btn-link invite-action" data-action="take-home" href={LUCI_REPO_URL} target="_blank" rel="noopener noreferrer">{COPY.capture.invite.action}</a>
                  : props.onHelp && <Button variant="link" class="invite-action" data-action="take-home" onClick={() => props.onHelp!('take-luci-home')}>{COPY.capture.invite.action}</Button>}
              </div>
            )}
            <div class="project-card" data-part="connected-project">
              <div class="project-header">
                <span class={`status-dot ${!activeProject?.project ? 'offline' : (activeProject.initialized === false ? 'warning' : 'online')}`} aria-hidden="true"></span>
                <div class="project-info">
                  {activeProject?.project ? (
                    activeProject.initialized === false ? (
                      <>
                        <span class="project-name">Connected, but this folder isn't set up for Luci. Run <code>luci init</code> in your project folder.</span>
                        <span class="project-path dim">{projectLabel(activeProject)}</span>
                      </>
                    ) : (
                      <>
                        <span class="project-name">{activeProject.name ? `Connected to ${activeProject.name}` : 'Not connected to a project'}</span>
                        <span class="project-path dim">{projectLabel(activeProject)}</span>
                      </>
                    )
                  ) : (
                    <>
                      <span class="project-name">Not connected to a project</span>
                      <span class="project-hint dim">Run <code>luci serve</code> in your project terminal</span>
                    </>
                  )}
                </div>
              </div>
              {props.projectInfo?.setUrl && (
                <div class="project-port-row">
                  <label class="dim" for="luci-bridge-url">Bridge:</label>
                  <input id="luci-bridge-url" type="text" class="port-input" data-part="port-input"
                    value={bridgePortInput}
                    placeholder="http://127.0.0.1:4545"
                    onChange={e => {
                      const val = (e.currentTarget as HTMLInputElement).value;
                      setBridgePortInput(val);
                      void props.projectInfo?.setUrl?.(val).then(refreshProject);
                    }} />
                </div>
              )}
            </div>
            {props.debuggerPermission && (
              <div class="project-card" data-part="debugger-permission">
                <div class="project-header">
                  <span class={`status-dot ${debuggerGranted && useDebugger ? 'online' : 'offline'}`} aria-hidden="true"></span>
                  <div class="project-info">
                    <span class="project-name">
                      {debuggerGranted
                        ? (useDebugger ? 'Debugger: on' : 'Debugger: off')
                        : 'Debugger: not available'}
                    </span>
                    <span class="project-hint dim">
                      {debuggerGranted
                        ? (useDebugger
                          ? 'Luci uses it during a capture for exact states and widths, then detaches it'
                          : 'Luci never attaches it: states come from stylesheet rules, widths from a hidden frame')
                        : 'Chrome is not letting Luci use it: states come from stylesheet rules, widths from a hidden frame'}
                    </span>
                  </div>
                </div>
                <div class="project-port-row">
                  {debuggerGranted && (
                    <button
                      type="button"
                      class="btn-secondary"
                      data-action="toggle-debugger"
                      onClick={() => changeSettings({ ...settings, useDebugger: !useDebugger })}
                    >
                      {useDebugger ? "Don't use the debugger" : 'Use the debugger'}
                    </button>
                  )}
                  <button type="button" class="btn-secondary" data-action="debugger-help" onClick={openDebuggerHelp}>
                    About the debugger
                  </button>
                </div>
              </div>
            )}
            <hr class="settings-divider" />
            <AppearanceControls prefs={uiPrefs} onChange={setUiPrefs} movable={Boolean(props.movable || props.modes)}
              moved={props.movable ? Boolean(place) : Boolean(props.modes && uiPrefs.devPlace)} />
            <hr class="settings-divider" />
            <div class="stack">
              <span class="field-label">Default file format</span>
              <div class="settings-grid">
                <label class="field-stack" title="Smart uses rem for text and spacing, preserves authored %/vw/vh for layouts, and keeps borders and radii in px">
                  <span class="dim">Units</span>
                  <Select data-setting="units" value={settings.units ?? 'smart'} onChange={e => changeSettings({ ...settings, units: (e.currentTarget as HTMLSelectElement).value as 'smart' })}>
                    <option value="smart">Smart (rem / % / px)</option><option value="px">px</option><option value="rem">rem</option><option value="both">both</option>
                  </Select>
                </label>
                <label class="field-stack">
                  <span class="dim">Colours</span>
                  <Select data-setting="colors" value={settings.colors ?? 'hex'} onChange={e => changeSettings({ ...settings, colors: (e.currentTarget as HTMLSelectElement).value as 'hex' })}>
                    <option value="hex">hex</option><option value="rgb">rgb</option><option value="hsl">hsl</option><option value="oklch">oklch</option>
                  </Select>
                </label>
                <label class="field-stack" title="The file's source line: the page address, or only the site name">
                  <span class="dim">Source</span>
                  <Select data-setting="source" value={settings.source ?? 'page'} onChange={e => changeSettings({ ...settings, source: (e.currentTarget as HTMLSelectElement).value as 'page' })}>
                    <option value="page">page address</option><option value="site">site name only</option>
                  </Select>
                </label>
                <label class="field-stack" title="The file you copy, download and export: DESIGN.md for Google Stitch, Luci's tables, Tailwind CSS, or CSS Variables">
                  <span class="dim">File</span>
                  <Select data-setting="style" value={settings.style ?? 'stitch'} onChange={e => changeSettings({ ...settings, style: (e.currentTarget as HTMLSelectElement).value as StyleSetting })}>
                    <option value="stitch">DESIGN.md (Stitch)</option>
                    <option value="luci">Luci tables</option>
                    <option value="tailwind">Tailwind v4 (@theme)</option>
                    <option value="tailwind-v3">Tailwind v3 (config.js)</option>
                    <option value="css-vars">CSS Variables (tokens.css)</option>
                  </Select>
                </label>
              </div>
            </div>
            <hr class="settings-divider" />
            <div class="stack">
              <span class="field-label">Keys</span>
              <div class="shortcut-list" data-part="keys">
                <span>{TOOLS.map(t => <><kbd class="kbd">{KEYS[t]}</kbd> </>)}</span>
                <span class="dim">Component, Text, Colour, Spacing</span>
                <span><kbd class="kbd">{KEYS.page}</kbd> <kbd class="kbd">{KEYS.check}</kbd></span>
                <span class="dim">Whole page, Check a build</span>
                <span><kbd class="kbd">{KEYS.basket}</kbd> <kbd class="kbd">{KEYS.menu}</kbd></span>
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
          )
        )}

        {!settingsOpen && pageBusy && !basketOpen && (
          <div class="panel"><Loading sleep text={COPY.capture.readingPage} step={pageStep} /></div>
        )}

        {!settingsOpen && basketOpen && (
          <div class="panel" role="dialog" aria-label="Basket" data-part="basket">
            {comparison ? (
              <>
                {/* Compare mode (v0.4): two basket items, every value that differs */}
                <h2>Compare</h2>
                <p class="hint" data-part="compare-summary">
                  A: {comparison.result.a.name} ({sourceLabel(comparison.items[0])}{comparison.result.a.note ? `, your note: ${comparison.result.a.note}` : ''}). B: {comparison.result.b.name} ({sourceLabel(comparison.items[1])}{comparison.result.b.note ? `, your note: ${comparison.result.b.note}` : ''}). {comparison.result.same.length} value{comparison.result.same.length === 1 ? ' is' : 's are'} the same; {comparison.result.differences.length} differ{comparison.result.differences.length === 1 ? 's' : ''}.
                </p>
                {comparison.result.differences.length ? (
                  <div class="compare-scroll">
                    <table class="compare" data-part="compare-table">
                      <thead><tr><th class="col-what">What</th><th class="col-a">A</th><th class="col-b">B</th></tr></thead>
                      <tbody>{comparison.result.differences.map(d => <tr><td class="col-what">{d.what}</td><td class="col-a">{d.a}</td><td class="col-b">{d.b}</td></tr>)}</tbody>
                    </table>
                  </div>
                ) : <p class="hint">No differences: every value compared is the same.</p>}
                <div class="row actions">
                  <Button variant="primary" size="md" iconOnly tipAbove tipAlign="left" icon={copied ? IconSuccess : IconCopy} label={copied ? COPY.common.copied : 'Copy the comparison'}
                    data-action="copy-compare" onClick={() => void copyText(formatCompareReport(comparison.result, { a: comparison.items[0].name, b: comparison.items[1].name }))} />
                  <button type="button" class="btn-secondary" data-action="compare-back" onClick={() => { setComparison(null); setCopied(false); }}>Back to the basket</button>
                </div>
              </>
            ) : basketExport && exported ? (
              <>
                <h2>{basketExport.title}</h2>
                <div class="file" data-part="file-name">{exported.fileName}</div>
                <pre data-part="preview">{exported.markdown}</pre>
                <div class="row actions">
                  <Button variant="primary" size="md" iconOnly tipAbove tipAlign="left" icon={copied ? IconSuccess : IconCopy} label={copied ? COPY.common.copied : COPY.capture.actions.copy}
                    data-action="copy" onClick={() => void copyText(exported.markdown)} />
                  <Button variant="secondary" size="md" iconOnly tipAbove icon={IconDownload} label={COPY.capture.actions.download} data-action="download"
                    onClick={() => downloadText(exported.fileName, exported.markdown)} />
                  {props.saveToProject && <SaveButton save={() => { const luci = luciExport(); return props.saveToProject!(luci.fileName, luci.markdown); }} onDownload={() => downloadText(exported.fileName, exported.markdown)} projectName={activeProject?.name} key={exported.fileName} />}
                  <button type="button" class="btn-secondary" data-action="basket-back" onClick={() => { setBasketExport(null); setCopied(false); }}>Back to the basket</button>
                </div>
              </>
            ) : (
              <>
                <h2>Basket</h2>
                {!basket.length ? (
                  <EmptyState pose="box" title={COPY.capture.basketEmpty.title} body={COPY.capture.basketEmpty.body} part="basket-empty" />
                ) : (
                  <ul class="items">
                    {basket.map(item => (
                      <li data-item={item.id}>
                        {/* What it is first; then its name and its actions in one row; then the note */}
                        <span class="meta">{groupOf(item.capture)} · {sourceLabel(item)}</span>
                        {basket.length > 1 && (
                          <label class="compare-pick" title="Pick two items to compare them">
                            <input type="checkbox" data-item-compare checked={compareIds.includes(item.id)}
                              onChange={e => setCompareIds(ids => ((e.currentTarget as HTMLInputElement).checked ? [...ids.filter(i => i !== item.id), item.id].slice(-2) : ids.filter(i => i !== item.id)))} />
                            Compare
                          </label>
                        )}
                        <input type="text" aria-label="Name" data-item-name value={item.name}
                          onChange={e => saveBasket(renameInBasket(basket, item.id, (e.currentTarget as HTMLInputElement).value))} />
                        <span class="row">
                          <button type="button" class="btn-secondary" data-item-export onClick={() => setBasketExport({ title: item.name, item })}>Export</button>
                          {props.saveToProject && (
                            <button type="button" class="btn-secondary" data-item-send-project
                              title={activeProject?.name ? `Save this capture to ${activeProject.name}/.luci/design/` : "Save this capture to .luci/design/ in your project"}
                              onClick={() => void sendOneToProject(item)}>
                              {itemSent[item.id]?.error ? 'Failed' : itemSent[item.id] ? 'Saved' : 'Send to project'}
                            </button>
                          )}
                          <button class="btn-danger" type="button" data-item-remove aria-label={`Remove ${item.name}`} onClick={() => saveBasket(removeFromBasket(basket, item.id))}>Remove</button>
                        </span>
                        <textarea data-item-note aria-label={`Note for your agent about ${item.name}`} placeholder="Note for your agent (optional). What to use it for, what to change." value={item.capture.instructions ?? ''}
                          onChange={e => saveBasket(noteInBasket(basket, item.id, (e.currentTarget as HTMLTextAreaElement).value))} />
                      </li>
                    ))}
                  </ul>
                )}
                {mergeable.length > 0 && (
                  <div class="stack" data-part="merge">
                    <span class="dim">One site, several pages: {mergeable.map(g => `${g.type} from ${g.pages.length} pages of ${g.site}`).join(', ')}. Merge them into one site file. Each row says which pages use it; values that differ are listed as conflicts.</span>
                    <span class="row"><button type="button" class="btn-secondary" data-action="merge-systems" onClick={mergeSystemsNow}>Merge into site system{mergeable.length === 1 ? '' : 's'} ({mergeable.length})</button></span>
                  </div>
                )}
                {mergedNote && <p class="hint" data-part="merged">{mergedNote}</p>}
                {compareItems && (
                  <div class="row" data-part="compare-pick">
                    <span class="dim">{compareItems[0].name} and {compareItems[1].name}</span>
                    <button type="button" class="btn-secondary" data-action="compare"
                      onClick={() => { setComparison({ items: compareItems, result: compareCaptures(compareItems[0].capture, compareItems[1].capture) }); setCopied(false); }}>Compare the two</button>
                  </div>
                )}
                <div class="row">
                  <button type="button" class="btn-primary" data-action="export-all" disabled={!basket.length} onClick={() => setBasketExport({ title: `All ${basket.length} items, one file` })}>Export all as one file</button>
                  {props.saveToProject && (
                    <button type="button" class="btn-secondary" data-action="send-all-project" disabled={!basket.length || basketSending}
                      title={activeProject?.name ? `Save each capture in the basket to ${activeProject.name}/.luci/design/` : "Save each capture in the basket to .luci/design/ in your project"}
                      onClick={() => void sendAllToProject()}>
                      {basketSending ? <><ButtonSpinner />Sending…</> : 'Send all to project'}
                    </button>
                  )}
                  {basket.length > 0 && (confirmClear
                    ? <button type="button" class="btn-danger" data-action="clear-basket-confirm" onClick={() => { saveBasket([]); setConfirmClear(false); }}>Yes, empty the basket</button>
                    : <button type="button" class="btn-danger" data-action="clear-basket" onClick={() => setConfirmClear(true)}>Empty basket</button>)}
                </div>
                {basketStatus && (
                  <div class="row" data-part="basket-status">
                    <p class={basketStatus.error ? 'error' : 'hint'} style={{ margin: 0 }}>{basketStatus.text}</p>
                    {basketStatus.error && basketStatus.download && (
                      <button type="button" class="btn-secondary" data-action="download-fallback" onClick={basketStatus.download}>
                        Download file instead
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!settingsOpen && (picking || dropperOpen || pixelMode || imageMode) && tool && (
          <div class={`sub with-luci${imageMode ? ' image-drop' : ''}`} data-part="tool-hint" role="note"
            {...(imageMode ? {
              onDragOver: (e: DragEvent) => { e.preventDefault(); },
              onDrop: (e: DragEvent) => {
                e.preventDefault();
                const file = [...(e.dataTransfer?.files ?? [])][0];
                if (file) void readImageFile(file, file.name || 'dropped-image.png');
              }
            } : {})}>
            <Mascot pose={checkDesign ? 'compare' : TOOL_POSES[tool]} size={96} />

            <div class="sub-body">
              {tool === 'color' && (
                <div class="seg" role="group" aria-label="Pick a colour from">
                  <button type="button" aria-pressed={!dropperOpen && !pixelMode && !imageMode} data-color-mode="element" onClick={() => { setPixelMode(false); setImageMode(false); startPicking('color'); }}>Element</button>
                  <button type="button" aria-pressed={dropperOpen || pixelMode} data-color-mode="pixel" data-action="eyedropper" disabled={!canPickPixels}
                    title={canPickPixels ? 'Pick any spot on the page' : 'This browser cannot pick pixels. Click an element instead.'} onClick={() => { setImageMode(false); void startPixel(); }}>Pixel</button>
                  <button type="button" aria-pressed={imageMode} data-color-mode="image" title="Estimate the colours of a screenshot or any image" onClick={startImage}>Image</button>
                </div>
              )}
              <p class="hint" data-part="hint">
                {imageMode ? (imageBusy ? 'Reading the image…' : 'Drop a screenshot here, paste one, or choose a file. Luci estimates its colours: every value is a guess.')
                  : pixelMode ? 'Point at any spot. Click to take its colour.'
                    : checkDesign ? `Click the component you built. Luci checks it against ${checkDesign.label}.`
                      : `${TOOL_HINTS[tool]}${tool === 'color' && !canPickPixels ? ' This browser cannot pick pixels.' : ''}`}
              </p>
              {imageMode && (
                <div class="row">
                  <input ref={imageInput} type="file" accept="image/*" data-part="image-file" hidden
                    onChange={e => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void readImageFile(f, f.name); }} />
                  <button type="button" class="btn-secondary" data-action="choose-image" disabled={imageBusy} onClick={() => imageInput.current?.click()}>Choose an image</button>
                </div>
              )}
              <p class="keys">{pixelMode || imageMode ? 'Esc: back to Element' : touchScreen(win) ? 'Tap once to see an element, again to take it' : '↑ ↓ after clicking: wider or narrower · Esc: stop'}</p>
            </div>
          </div>
        )}

        {!settingsOpen && picking && notice && (
          <div class="panel" role="status"><p class="error" data-part="notice">{notice}</p></div>
        )}

        {!settingsOpen && checkOpen && !basketOpen && (
          <DesignChooser {...(props.designs ? { designs: props.designs } : {})} basket={basket} onChoose={chooseDesign} onCancel={endCheck} />
        )}

        {!settingsOpen && !picking && !basketOpen && checkOutcome && checkDesign && picked && (
          <CheckResultPanel
            key={`${picked.entry.selector} ${checkDesign.file}`}
            outcome={checkOutcome}
            watching={watchCheck}
            onWatch={on => { setWatchCheck(on); setAutoNote(null); if (!on) forgetWatch(); }}
            autoNote={autoNote}
            design={checkDesign}
            el={picked.el}
            selector={picked.entry.selector}
            overlay={diffOverlay}
            onOverlay={setDiffOverlay}
            {...(props.addCheckNotes ? { addNotes: props.addCheckNotes } : {})}
            {...(props.checkNotesWhere ? { notesWhere: props.checkNotesWhere } : {})}
            onCopy={copyText}
            onAgain={() => startPicking('component')}
            onChangeDesign={openCheck}
          />
        )}

        {!settingsOpen && !picking && !basketOpen && picked && checkDesign && !checkOutcome && !result && (
          <div class="panel" role="dialog" aria-label="Design check" data-part="check-selected">
            <div class="selected-card">
              <div class="selected-head">
                <h2>Built: <span data-part="selected-name">{elementName(picked.entry.tag, picked.entry.role)}</span></h2>
                <span class="dim">{Math.round(picked.el.getBoundingClientRect().width)} × {Math.round(picked.el.getBoundingClientRect().height)}</span>
              </div>
              <div class="row">
                <button type="button" class="btn-secondary" data-action="widen" disabled={!widerOf(picked.el)} onClick={widen} title="Select the element around this one (↑)">↑ Wider</button>
                <button type="button" class="btn-secondary" data-action="narrow" disabled={!narrowerOf(picked.el)} onClick={narrow} title="Select the element inside this one (↓)">↓ Narrower</button>
                <span class="dim">or ↑ ↓</span>
              </div>
              {picked.eligibility.status !== 'allowed' && <p class="error" data-part="notice">{picked.eligibility.reason} Go wider or narrower.</p>}
              {busy ? <Loading text={busy} /> : (
                <>
                  <div class="row">
                    <button type="button" class="btn-primary" data-action="check-run" disabled={picked.eligibility.status !== 'allowed'} onClick={() => void runCheck()}>Check against the design</button>
                    <button type="button" class="btn-secondary" onClick={() => startPicking('component')}>Pick again</button>
                    <button type="button" class="btn-secondary" data-action="check-design" onClick={openCheck}>Change design</button>
                  </div>
                  <p class="tip-box" data-part="check-against">Design: {checkDesign.label}</p>
                </>
              )}
            </div>
          </div>
        )}

        {!settingsOpen && !picking && !basketOpen && picked && !checkDesign && !result && tool && (
          <div class="panel" role="dialog" aria-label="Capture">
            <div class="selected-card">
              <div class="selected-head">
                <h2>Selected · <span data-part="selected-name">{elementName(picked.entry.tag, picked.entry.role)}</span></h2>
                <span class="dim">{Math.round(picked.el.getBoundingClientRect().width)} × {Math.round(picked.el.getBoundingClientRect().height)}</span>
              </div>
              <div class="row">
                <button type="button" class="btn-secondary" data-action="widen" disabled={!widerOf(picked.el)} onClick={widen} title="Select the element around this one (↑)">↑ Wider</button>
                <button type="button" class="btn-secondary" data-action="narrow" disabled={!narrowerOf(picked.el)} onClick={narrow} title="Select the element inside this one (↓)">↓ Narrower</button>
                <span class="dim">or ↑ ↓</span>
              </div>
              {picked.eligibility.status === 'redirected' && <p class="hint">{picked.eligibility.reason}</p>}
              {picked.eligibility.status === 'blocked' && <p class="error" data-part="notice">{picked.eligibility.reason} Go wider or narrower.</p>}
              {tool === 'spacing' && picked.eligibility.status === 'allowed' && spacingChoices(picked.entry).length > 1 && (
                <div class="row">
                  <button type="button" class="btn-secondary" aria-pressed={choice === ALL_SPACING} data-choice="all" onClick={() => setChoice(ALL_SPACING)}>All ({spacingChoices(picked.entry).length})</button>
                  {spacingChoices(picked.entry).map((u, i) => (
                    <button type="button" class="btn-secondary" aria-pressed={choice === i} data-choice={u.property} onClick={() => setChoice(i)}>{u.property} {u.computed}</button>
                  ))}
                </div>
              )}
              {busy ? <Loading text={busy} /> : (
                <>
                  <div class="row">
                    {picked.eligibility.status === 'allowed' && (
                      <button type="button" class="btn-primary" data-output="one" onClick={() => void produce(false)}>This one</button>
                    )}
                    {picked.eligibility.status !== 'blocked' && (
                      <button type="button" class={picked.eligibility.status === 'allowed' ? 'btn-secondary' : 'btn-primary'} data-output="system" onClick={() => void produce(true)}>The whole system</button>
                    )}
                    {tool === 'component' && picked.eligibility.status === 'allowed' && (
                      <button type="button" class="btn-secondary" data-output="section" title={SECTION_HINT} onClick={() => void produce(false, true)}>This section</button>
                    )}
                    <button type="button" class="btn-secondary" onClick={() => startPicking(tool)}>Pick again</button>
                  </div>
                  {picked.eligibility.status !== 'blocked' && (
                    <p class="tip-box" data-part="output-hints">
                      {picked.eligibility.status === 'allowed' && <>This one: {OUTPUT_HINTS[tool].one}. </>}The whole system: {OUTPUT_HINTS[tool].system}.
                      {tool === 'component' && picked.eligibility.status === 'allowed' && <> This section: {SECTION_HINT}.</>}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {!settingsOpen && !picking && !basketOpen && result && (
          <div class={result.ok ? 'panel result-panel' : 'panel'} role="dialog" aria-label="Capture file">
            {result.ok ? (
              <>
                <div class="panel-body">
                  <div class="file-row">
                    <div class="file" data-part="file-name">{outputName}</div>
                    <span class="scope-pill badge">{result.output.capture.meta.scope}</span>
                  </div>
                  {sectionFiles.length > 0 && (
                    <div class="stack" data-part="section-files">
                      <span class="dim">Plus {sectionFiles.length} component file{sectionFiles.length === 1 ? '' : 's'}, each described once. The section file places them.</span>
                      <ul class="files">
                        {sectionFiles.map(f => (
                          <li data-file={f.fileName}><code>{f.fileName}</code> <button type="button" class="btn-secondary" data-file-view onClick={() => setViewFile(f)}>View</button></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {viewFile && (
                    <div class="stack" data-part="file-view-box">
                      <span class="row"><code>{viewFile.fileName}</code><button type="button" class="btn-secondary" data-action="file-view-close" onClick={() => setViewFile(null)}>Back to the section file</button></span>
                      <pre class="preview" data-part="file-view">{viewFile.markdown}</pre>
                    </div>
                  )}
                  <div class="settings-grid">
                    <label class="field-stack" title="Smart uses rem for text and spacing, preserves authored %/vw/vh for layouts, and keeps borders and radii in px">
                      <span class="field-label">Units</span>
                      <Select data-setting="units" value={settings.units ?? 'smart'} onChange={e => changeSettings({ ...settings, units: (e.currentTarget as HTMLSelectElement).value as 'smart' })}>
                        <option value="smart">Smart (rem / % / px)</option><option value="px">px</option><option value="rem">rem</option><option value="both">both</option>
                      </Select>
                    </label>
                    <label class="field-stack">
                      <span class="field-label">Colours</span>
                      <Select data-setting="colors" value={settings.colors ?? 'hex'} onChange={e => changeSettings({ ...settings, colors: (e.currentTarget as HTMLSelectElement).value as 'hex' })}>
                        <option value="hex">hex</option><option value="rgb">rgb</option><option value="hsl">hsl</option><option value="oklch">oklch</option>
                      </Select>
                    </label>
                    <label class="field-stack" title="The file's source line: the page address, or only the site name">
                      <span class="field-label">Source</span>
                      <Select data-setting="source" value={settings.source ?? 'page'} onChange={e => changeSettings({ ...settings, source: (e.currentTarget as HTMLSelectElement).value as 'page' })}>
                        <option value="page">page address</option><option value="site">site name only</option>
                      </Select>
                    </label>
                    <label class="field-stack" title="The file you copy and download: DESIGN.md for Google Stitch, Luci's tables, Tailwind CSS, or CSS Variables">
                      <span class="field-label">File</span>
                      <Select data-setting="style" value={settings.style ?? 'stitch'} onChange={e => changeSettings({ ...settings, style: (e.currentTarget as HTMLSelectElement).value as StyleSetting })}>
                        <option value="stitch">DESIGN.md (Stitch)</option>
                        <option value="luci">Luci tables</option>
                        <option value="tailwind">Tailwind v4 (@theme)</option>
                        <option value="tailwind-v3">Tailwind v3 (config.js)</option>
                        <option value="css-vars">CSS Variables (tokens.css)</option>
                      </Select>
                    </label>
                  </div>
                  {isCustomExport && props.saveToProject && <p class="dim" data-part="stitch-note">Save to project keeps Luci's tables: the design check and your agent's tools read them.</p>}
                  {stateNote && <p class="hint" data-part="state-note">{stateNote}</p>}
                  {componentCtx && result.output.capture.meta.scope === 'component' && (
                    <div class="stack" data-part="manual-state">
                      <hr class="settings-divider" />
                      <div class="stack" data-part="states-summary">
                        <span class="field-label">States in this file</span>
                        <div class="states-list">
                          <span class="state default detected" data-state="default" title="Resting state">Default ✓</span>
                          {componentCtx.states.map(s => (
                            <span class={s.detected ? 'state detected' : 'state missing'} data-state={s.state}
                              title={s.detected ? (s.trigger ? `In the file. Set by the ${s.trigger.element} around it.` : 'In the file.')
                                : checked(s) ? 'Checked in the browser. Nothing changes.'
                                  : 'Not detected. It may change through JavaScript. Capture it by hand below.'}>
                              {s.state} {s.detected ? `✓${s.trigger ? ` (via ${s.trigger.element.split(' ')[0]})` : ''}` : checked(s) ? '– no change' : '– not detected'}
                            </span>
                          ))}
                        </div>
                      </div>
                      <hr class="settings-divider" />
                      {countdown !== null && capturing ? (
                        <div class="row">
                          <p class="hint" data-part="countdown">
                            {capturing.total > 1 ? `${capturing.index} of ${capturing.total}: ` : ''}Put it in its <strong>{capturing.state}</strong> state now ({STATE_HOW[capturing.state]}). Capturing in {countdown}…
                          </p>
                          <button type="button" class="btn-secondary" data-action="cancel-capture" onClick={cancelCapture}>Stop</button>
                        </div>
                      ) : (
                        <div class="manual-row">
                          <div class="section-copy">
                            <label class="field-label" for="luci-manual-state">Capture by hand</label>
                            <span class="dim">Set hover, focus or active yourself. 3 second countdown.</span>
                          </div>
                          <div class="manual-actions">
                            <Select id="luci-manual-state" data-setting="manual-state" value={manualTarget} onChange={e => setManualTarget((e.currentTarget as HTMLSelectElement).value as ManualTarget)}>
                              {missingStates(componentCtx.states).length > 0 && <option value={ALL_MISSING}>All missing states ({missingStates(componentCtx.states).length})</option>}
                              {STATE_ORDER.filter(s => s !== 'disabled').map(s => <option value={s}>{s}</option>)}
                            </Select>
                            <button type="button" class="btn-secondary" data-action="capture-state" onClick={captureCurrentState}>{manualTarget === ALL_MISSING ? 'Capture' : 'Capture state'}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {picked && (result.output.capture.meta.scope === 'component' || result.output.capture.meta.scope === 'section') && result.output.capture.meta.selector === picked.entry.selector && (
                    <div class="stack" data-part="responsive">
                      <hr class="settings-divider" />
                      {widthBusy ? <Loading text={widthBusy} /> : (
                        <div class="manual-row">
                          <div class="section-copy">
                            <span class="field-label">Breakpoints</span>
                            {!widthNote && <span class="dim">{responsiveRef.current ? 'In the file, under Responsive.' : 'The site\'s own breakpoints. 2 or 3 widths.'}</span>}
                          </div>
                          <div class="manual-actions">
                            <button type="button" class="btn-secondary" data-action="responsive" title="Read it at the widths where the site's media queries change it, and add the changes to the file"
                              onClick={() => void addResponsive()}>{responsiveRef.current ? 'Read the widths again' : 'How it changes by width'}</button>
                          </div>
                        </div>
                      )}
                      {widthNote && <p class={widthNote.error ? 'error' : 'hint'} data-part="responsive-note">{widthNote.text}</p>}
                    </div>
                  )}
                  <hr class="settings-divider" />
                  <RemapSection source={myTokens} edited={edited !== null}
                    applied={remapped && remapped.fileName === result.output.fileName ? remapped.summary : null}
                    onApply={tokens => {
                      const next = remapOutput(result.output, tokens, pageSettings.rootFontSize);
                      setRemapped({ fileName: result.output.fileName, original: result.output, summary: next.summary });
                      setResult({ ok: true, output: next.output });
                      setCopied(false);
                    }}
                    onUndo={() => {
                      if (remapped) setResult({ ok: true, output: remapped.original });
                      setRemapped(null);
                      setCopied(false);
                    }} />
                  <hr class="settings-divider" />
                  <label class="field-stack">
                    <span class="field-label">Note for your agent <span class="dim">(optional)</span></span>
                    <textarea data-part="instructions" rows={2} value={instructions}
                      placeholder="e.g. Use this as our primary button, with our brand blue #1d4ed8 and a 12px radius."
                      onInput={e => changeInstructions((e.currentTarget as HTMLTextAreaElement).value)} />
                  </label>
                </div>

                <div class="md-section">
                  <div class="md-head">
                    <span class="md-title">The file <span class="dim">(you can edit it)</span></span>
                    {edited !== null && (
                      <span class="row">
                        <span class="dim" data-part="edited-note">Edited by hand. Units and colours no longer change it.</span>
                        <button type="button" class="btn-danger" data-action="undo-edits" onClick={() => setEdited(null)}>Undo my edits</button>
                      </span>
                    )}
                  </div>
                  <textarea class="preview" data-part="preview" spellcheck={false} value={markdown}
                    onInput={e => { setEdited((e.currentTarget as HTMLTextAreaElement).value); setCopied(false); }} />
                  <div class="row actions">
                    <Button variant="primary" size="md" iconOnly tipAbove tipAlign="left" icon={copied ? IconSuccess : IconCopy} data-action="copy" onClick={copy}
                      label={copied ? COPY.common.copied : sectionFiles.length && !isCustomExport ? COPY.capture.actions.copySection : COPY.capture.actions.copy} />
                    {sectionFiles.length && !isCustomExport
                      ? <Button variant="secondary" size="md" iconOnly tipAbove icon={IconDownload} data-action="download-zip" onClick={downloadZip} label={COPY.capture.actions.downloadZip(sectionFiles.length + 1)} />
                      : <Button variant="secondary" size="md" iconOnly tipAbove icon={IconDownload} data-action="download" onClick={download} label={COPY.capture.actions.download} />}
                    <Button variant="secondary" size="md" iconOnly tipAbove icon={added ? IconSuccess : IconBasket} data-action="add-to-basket"
                      label={added ? COPY.capture.actions.inBasket : COPY.capture.actions.addToBasket} onClick={() => { if (added) openBasket(); else void addCurrent(); }} />
                    {tool && <Button variant="secondary" size="md" iconOnly tipAbove icon={TOOL_ICONS[tool]} data-action="pick-again" label={COPY.capture.actions.pickAgain} onClick={() => startPicking(tool)} />}
                    {props.saveToProject && output && <SaveButton save={saveAll} onDownload={sectionFiles.length ? downloadZip : download} projectName={activeProject?.name} key={output.fileName} />}
                    {props.makeRule && output && output.capture.meta.scope === 'component' && (
                      <RuleButton make={() => props.makeRule!(output.fileName, luciMarkdown)} key={`rule ${output.fileName}`} />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div class="greet">
                  <Mascot pose="annoyed" size={96} />
                  <p class="error" data-part="error">{result.message}</p>
                </div>
                {tool && <div class="row"><Button variant="secondary" icon={TOOL_ICONS[tool]} data-action="pick-again" onClick={() => startPicking(tool)}>{COPY.capture.actions.pickAgain}</Button></div>}
              </>
            )}
          </div>
        )}
      </div>

      {picking && tool && (
        // Takes every pointer event while picking: the page cannot react to a press, click or drag
        <div class="pick-layer" data-part="pick-layer"
          onPointerMove={e => { if (e.pointerType !== 'touch') pickMove(e.clientX, e.clientY); }}
          onPointerDown={e => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); pickDown(e.clientX, e.clientY); }}
          onPointerUp={e => { e.preventDefault(); pickUp(e.clientX, e.clientY, e.pointerType === 'touch'); }}
          onPointerCancel={() => { drag.current = null; }}
          onWheel={e => pickWheel(e as unknown as WheelEvent)}
          onContextMenu={e => e.preventDefault()} />
      )}

      {pixelMode && (
        <>
          {/* Covers the page while picking a pixel: the page gets no clicks, and Luci's panels stay above it */}
          <div class="pixel-layer" data-part="pixel-layer"
            onPointerMove={e => setPixelHover(samplePixel(e.clientX, e.clientY))}
            onPointerLeave={() => setPixelHover(null)}
            onClick={e => pickPixelAt(e.clientX, e.clientY)} />
          {pixelHover && shot.current && (() => {
            // The loupe and the hex sit below and right of the pointer, or flip to stay in the window
            const left = pixelHover.x + 20 + LOUPE_PX > win.innerWidth ? pixelHover.x - 20 - LOUPE_PX : pixelHover.x + 20;
            const top = pixelHover.y + 20 + LOUPE_PX + 36 > win.innerHeight ? pixelHover.y - 20 - LOUPE_PX - 36 : pixelHover.y + 20;
            return (
              <>
                <Loupe shot={shot.current} x={pixelHover.x} y={pixelHover.y} hex={pixelHover.hex} left={left} top={top} />
                <div class="swatch" data-part="pixel-swatch" style={{ top: `${top + LOUPE_PX + 8}px`, left: `${left + LOUPE_PX / 2 - 52}px` }}>
                  <span class="chip" style={{ background: pixelHover.hex }} />{pixelHover.hex}
                </div>
              </>
            );
          })()}
        </>
      )}

      {checkOutcome && picked && <DiffOverlay overlay={diffOverlay} el={picked.el} />}

      {checkBlink && checkBlink.el.isConnected && (() => {
        const r = checkBlink.el.getBoundingClientRect();
        if (!r.width && !r.height) return null;
        return (
          <>
            <div key={`check-blink-${checkBlink.key}`} class="blink-ring" data-part="blink-ring"
              style={{ left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` }} />
            <div class="blink-pill" role="status" data-part="blink-pill"
              style={{ left: `${Math.max(8, Math.min(r.left, win.innerWidth - 220))}px`, top: `${Math.max(8, r.top - 28)}px` }}>
              <span class="blink-pill-dot" aria-hidden="true" />{checkBlink.label}
            </div>
          </>
        );
      })()}

      {choosing && picked && !pixelMode && (() => {
        const r = picked.el.getBoundingClientRect();
        return (
          <>
            <div class={`highlight locked${picked.eligibility.status === 'blocked' ? ' blocked' : ''}`} data-part="selection" style={{ top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` }} />
            <div class="label" style={{ top: `${Math.max(4, r.top - 28)}px`, left: `${Math.max(4, r.left)}px` }}>{hoverLabel(picked.el)}</div>
          </>
        );
      })()}

      {hovered && rect && (
        <>
          <div class={`highlight${hoverElig?.status === 'blocked' ? ' blocked' : ''}`} style={{ top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` }} />
          {cs && (
            <>
              <div class="pad" style={{ top: `${rect.top + px(cs.borderTopWidth)}px`, left: `${rect.left + px(cs.borderLeftWidth)}px`, width: `${rect.width - px(cs.borderLeftWidth) - px(cs.borderRightWidth)}px`, height: `${rect.height - px(cs.borderTopWidth) - px(cs.borderBottomWidth)}px`, borderWidth: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}` }} />
              <div class="margin" style={{ top: `${rect.top - px(cs.marginTop)}px`, left: `${rect.left - px(cs.marginLeft)}px`, width: `${rect.width + px(cs.marginLeft) + px(cs.marginRight)}px`, height: `${rect.height + px(cs.marginTop) + px(cs.marginBottom)}px`, borderWidth: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}` }} />
            </>
          )}
          <div class="label" data-part="hover-label" style={{ top: `${Math.max(4, rect.top - 28)}px`, left: `${Math.max(4, rect.left)}px` }}>
            {hoverLabel(hovered)}
            {cs && `\npadding ${cs.padding}  margin ${cs.margin}${/flex|grid/.test(cs.display) ? `  gap ${cs.rowGap} ${cs.columnGap}` : ''}`}
            {hoverElig && hoverElig.status !== 'allowed' && <span class="reason">{hoverElig.reason}</span>}
          </div>
        </>
      )}
    </div>
  );
}
