/**
 * The on-page toolbar (FR1-FR5): tool modes, the picker with hover label and arrow-key navigation,
 * the eligibility check, the two outputs per pick, and the preview with copy and download.
 * Rendered by mount.ts inside a shadow root.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { formatCapture, groupOf, withInstructions, type BasketItem, type CaptureSettings, type ComponentCapture } from '@luci/format/capture';
import { addToBasket, exportBasket, exportItem, noteInBasket, removeFromBasket, renameInBasket, sourceLabel, type BasketStore } from './basket.js';
import type { Eligibility } from '../eligibility.js';
import type { ElementSnapshot } from '../model.js';
import { manualState, type ComputedMap, type StateName } from '../states.js';
import { elementName } from '../naming.js';
import { elementAt, eligibilityOf, eventTarget, firstChildOf, hoverLabel, parentOf, scrollableAncestor } from './picker.js';
import { ButtonSpinner, Loading, nextPaint } from './loading.js';
import { ModeSwitch, type ModeSwitchProps } from './modeSwitch.js';
import {
  ALL_SPACING,
  TOOLS,
  TOOL_LABELS,
  captureComponent,
  capturePageInSteps,
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
  /** Opens a help page; the "?" button shows only when the shell has one. */
  onHelp?: () => void;
  /** The dev toolbar's mode switch (Feedback, Capture, ...), first after "Luci". */
  modes?: ModeSwitchProps;
  /** Saves a file into the project's .luci/design/ (the dev toolbar, through luci serve); adds "Save to project". */
  saveToProject?: (fileName: string, markdown: string) => Promise<{ path: string; replaced: boolean }>;
}

/** "Save to project", then where it went (or why not). */
function SaveButton(props: { save: () => Promise<{ path: string; replaced: boolean }> }) {
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
  return (
    <>
      <button type="button" data-action="save-to-project" disabled={state.busy} title="Into the project's .luci/design/, where your agent reads it" onClick={() => void run()}>
        {state.busy ? <><ButtonSpinner />Saving…</> : 'Save to project'}
      </button>
      {state.done && <span class="dim" data-part="saved">{state.done}</span>}
      {state.error && <span class="error" data-part="save-error">{state.error}</span>}
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
  hover: 'move the pointer onto it',
  focus: 'click into it, or press Tab until it is focused',
  'focus-visible': 'press Tab until it is focused',
  active: 'press and hold the mouse button on it',
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
  component: 'Hover a button, card, link or field, and click it.',
  text: 'Hover any text (a heading, paragraph, link or label), and click it.',
  color: 'Click an element to take its color, or switch to Pixel to pick any spot on the page.',
  spacing: 'Click an element for its padding, margin or gap, or drag from one element to another to measure the distance.'
};

/** What each output gives, shown with the two buttons after a pick. */
export const OUTPUT_HINTS: Readonly<Record<ToolId, { one: string; system: string }>> = {
  component: { one: 'this component: its parts, tokens and states', system: 'this component plus every variant of it on the page' },
  text: { one: 'this text style', system: 'every text style on the page, grouped into roles' },
  color: { one: 'this color and where it is used', system: 'every color on the page, grouped by role' },
  spacing: { one: 'every padding, margin and gap of this element, or the one value you choose', system: 'the page\'s spacing scale, base unit and outliers' }
};
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
  const [copied, setCopied] = useState(false);
  const [dropperOpen, setDropperOpen] = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);
  const [, setTick] = useState(0);
  const trail = useRef<Element[]>([]);
  const drag = useRef<{ el: Element; x: number; y: number } | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
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

  const show = (r: Result) => {
    setResult(r);
    setCopied(false);
    setAdded(false);
    setBasketOpen(false);
    setEdited(null);
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

  const produce = async (system: boolean) => {
    if (!picked || !tool) return;
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
      const { states, note } = await readComponentStates(picked.live, picked.entry, props.readForcedStates);
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
    setPixelMode(false);
    setPixelHover(null);
    setInstructions('');
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
    setPageStep(null);
    setWholePage(false);
    setTool(t);
    setPicking(true);
    setPicked(null);
    setResult(null);
    setNotice(null);
    setComponentCtx(null);
    setStateNote(null);
    setCountdown(null);
    setBasketOpen(false);
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
  const choosing = !picking && !basketOpen && Boolean(picked) && !result && !busy;
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

  // The eyedropper color can come from the shell or a test
  useEffect(() => {
    props.registerPixelInput?.((hex: string) => {
      const live = liveSnapshot(doc);
      setTool('color');
      setPicking(false);
      setPicked(null);
      show(capturePixel(live, hex, settings));
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
  const pickUp = (x: number, y: number) => {
    {
      const target = elementAt(doc, x, y);
      const start = drag.current;
      drag.current = null;
      if (!target || !start || !tool) return;
      const moved = Math.hypot(x - start.x, y - start.y) > DRAG_PX;
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
      if (e.key === 'Escape' && (picked || result)) { setPicked(null); setResult(null); }
    };
    doc.addEventListener('keydown', onKey, true);
    return () => doc.removeEventListener('keydown', onKey, true);
  }, [picking, picked, result]);

  const changeSettings = (next: CaptureSettings) => {
    setSettings(next);
    props.onSettingsChange?.(next);
  };

  const output = result?.ok ? result.output : null;
  // The user's instructions for their agent go into the file word for word; the file can also be edited
  // by hand, and then copy, download and the basket use exactly the edited text
  const [instructions, setInstructions] = useState('');
  const [edited, setEdited] = useState<string | null>(null);
  const captureWithInstructions = output ? ({ ...output.capture, ...(instructions.trim() ? { instructions: instructions.trim() } : {}) } as typeof output.capture) : null;
  const markdown = edited ?? (captureWithInstructions ? formatCapture(captureWithInstructions, settings) : '');
  const changeInstructions = (text: string) => {
    setInstructions(text);
    // Edited text keeps the edits; only its instructions section follows the box
    if (edited !== null) setEdited(withInstructions(edited, text));
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
  };

  const downloadText = (fileName: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = fileName;
    a.setAttribute('data-luci-ui', '');
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copy = () => copyText(markdown);
  const download = () => { if (output) downloadText(output.fileName, markdown); };

  // The basket (FR18, FR19): kept by the shell's store, so it survives pages and sites
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [basketExport, setBasketExport] = useState<{ title: string; item?: BasketItem } | null>(null);
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
    saveBasket(addToBasket(current, captureWithInstructions ?? output.capture, edited ?? undefined));
  };
  const openBasket = () => {
    setPicking(false);
    aim(null);
    setBasketOpen(true);
    setBasketExport(null);
    setConfirmClear(false);
    setCopied(false);
    // The latest items, in case another tab added some
    if (store) void store.load().then(setBasket);
  };
  const exported = basketExport
    ? (basketExport.item ? exportItem(basketExport.item, settings) : basket.length ? exportBasket(basket, settings) : null)
    : null;

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
      shot.current = { ctx, scale: img.naturalWidth / win.innerWidth };
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
  const pickPixel = async () => {
    if (!Dropper) return;
    // While the eyedropper is open, the page picker steps aside
    setPicking(false);
    setDropperOpen(true);
    try {
      const { sRGBHex } = await new Dropper().open();
      setDropperOpen(false);
      setPicked(null);
      show(capturePixel(liveSnapshot(doc), sRGBHex, settings));
    } catch {
      // Esc in the eyedropper: back to picking an element
      setDropperOpen(false);
      startPicking('color');
    }
  };

  const hovered = picking ? candidate : null;
  const hoverElig = hovered ? eligibilityOf(hovered) : null;
  const rect = hovered?.getBoundingClientRect();
  const cs = hovered && tool === 'spacing' ? win.getComputedStyle(hovered) : null;

  return (
    <div class="luci">
      <div class="bar" role="toolbar" aria-label="Luci capture">
        <span class="brand">Luci</span>
        {props.modes && <ModeSwitch {...props.modes} />}
        {TOOLS.map(t => (
          <button type="button" aria-pressed={tool === t && (picking || dropperOpen || Boolean(picked) || Boolean(result))} data-tool={t} onClick={() => startPicking(t)}>{TOOL_LABELS[t]}</button>
        ))}
        <button type="button" aria-pressed={wholePage && !basketOpen && (pageBusy || Boolean(result))} data-action="whole-page" title="One file for this whole page: its typography, colors, spacing and every kind of component" onClick={captureWholePage}>Whole page</button>
        <button type="button" aria-pressed={basketOpen} data-action="basket" onClick={() => (basketOpen ? setBasketOpen(false) : openBasket())}>Basket ({basket.length})</button>
        {props.onHelp && <button type="button" aria-label="How to use Luci" title="How to use Luci" data-action="help" onClick={props.onHelp}>?</button>}
        <button type="button" aria-label="Close Luci" data-action="close" onClick={props.onClose}>×</button>
      </div>

      {pageBusy && !basketOpen && (
        <div class="panel"><Loading text="Reading the whole page: text, colors, spacing and components…" step={pageStep} /></div>
      )}

      {basketOpen && (
        <div class="panel" role="dialog" aria-label="Basket" data-part="basket">
          {basketExport && exported ? (
            <>
              <h2>{basketExport.title}</h2>
              <div class="file" data-part="file-name">{exported.fileName}</div>
              <pre data-part="preview">{exported.markdown}</pre>
              <div class="row">
                <button type="button" class="primary" data-action="copy" onClick={() => void copyText(exported.markdown)}>{copied ? 'Copied' : 'Copy'}</button>
                <button type="button" data-action="download" onClick={() => downloadText(exported.fileName, exported.markdown)}>Download .design.md</button>
                {props.saveToProject && <SaveButton save={() => props.saveToProject!(exported.fileName, exported.markdown)} key={exported.fileName} />}
                <button type="button" data-action="basket-back" onClick={() => { setBasketExport(null); setCopied(false); }}>Back to the basket</button>
              </div>
            </>
          ) : (
            <>
              <h2>Basket</h2>
              {!basket.length ? (
                <p class="hint">Nothing here yet. After a capture, press "Add to basket". Items stay here across pages and sites.</p>
              ) : (
                <ul class="items">
                  {basket.map(item => (
                    <li data-item={item.id}>
                      <input type="text" aria-label="Name" data-item-name value={item.name}
                        onChange={e => saveBasket(renameInBasket(basket, item.id, (e.currentTarget as HTMLInputElement).value))} />
                      <span class="meta">{groupOf(item.capture)} · {sourceLabel(item)}</span>
                      <textarea data-item-note aria-label={`Note for your agent about ${item.name}`} placeholder="Note for your agent (optional): what to use it for, what to change" value={item.capture.instructions ?? ''}
                        onChange={e => saveBasket(noteInBasket(basket, item.id, (e.currentTarget as HTMLTextAreaElement).value))} />
                      <span class="row">
                        <button type="button" data-item-export onClick={() => setBasketExport({ title: item.name, item })}>Export</button>
                        <button type="button" data-item-remove aria-label={`Remove ${item.name}`} onClick={() => saveBasket(removeFromBasket(basket, item.id))}>Remove</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div class="row">
                <button type="button" class="primary" data-action="export-all" disabled={!basket.length} onClick={() => setBasketExport({ title: `All ${basket.length} items, one file` })}>Export all as one file</button>
                {basket.length > 0 && (confirmClear
                  ? <button type="button" data-action="clear-basket-confirm" onClick={() => { saveBasket([]); setConfirmClear(false); }}>Yes, empty the basket</button>
                  : <button type="button" data-action="clear-basket" onClick={() => setConfirmClear(true)}>Empty basket</button>)}
              </div>
            </>
          )}
        </div>
      )}

      {(picking || dropperOpen || pixelMode) && tool && (
        <div class="sub" data-part="tool-hint" role="note">
          {tool === 'color' && (
            <div class="seg" role="group" aria-label="Pick a color from">
              <button type="button" aria-pressed={!dropperOpen && !pixelMode} data-color-mode="element" onClick={() => { setPixelMode(false); startPicking('color'); }}>Element</button>
              <button type="button" aria-pressed={dropperOpen || pixelMode} data-color-mode="pixel" data-action="eyedropper" disabled={!canPickPixels}
                title={canPickPixels ? 'Pick any spot on the page' : 'This browser cannot pick pixels. Click an element instead.'} onClick={() => void startPixel()}>Pixel</button>
            </div>
          )}
          <p class="hint" data-part="hint">
            {pixelMode ? 'Hover the page to see the color under the pointer, and click to pick it. Over Luci\'s own panels nothing is picked.'
              : `${TOOL_HINTS[tool]}${tool === 'color' && !canPickPixels ? ' (This browser cannot pick pixels.)' : ''}`}
          </p>
          <p class="keys">{pixelMode ? 'Esc goes back to Element' : 'After clicking, you can make the selection wider or narrower · Esc cancels'}</p>
        </div>
      )}

      {picking && tool && (
        // Takes every pointer event while picking: the page cannot react to a press, click or drag
        <div class="pick-layer" data-part="pick-layer"
          onPointerMove={e => pickMove(e.clientX, e.clientY)}
          onPointerDown={e => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); pickDown(e.clientX, e.clientY); }}
          onPointerUp={e => { e.preventDefault(); pickUp(e.clientX, e.clientY); }}
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
          {pixelHover && (
            <div class="swatch" data-part="pixel-swatch" style={{ top: `${Math.min(pixelHover.y + 18, win.innerHeight - 40)}px`, left: `${Math.min(pixelHover.x + 18, win.innerWidth - 140)}px` }}>
              <span class="chip" style={{ background: pixelHover.hex }} />{pixelHover.hex}
            </div>
          )}
        </>
      )}

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

      {picking && notice && (
        <div class="panel" role="status"><p class="error" data-part="notice">{notice}</p></div>
      )}

      {!picking && !basketOpen && picked && !result && tool && (
        <div class="panel" role="dialog" aria-label="Capture">
          <h2>Selected: <span data-part="selected-name">{elementName(picked.entry.tag, picked.entry.role)}</span> <span class="dim">{Math.round(picked.el.getBoundingClientRect().width)} × {Math.round(picked.el.getBoundingClientRect().height)}</span></h2>
          <div class="row">
            <button type="button" data-action="widen" disabled={!widerOf(picked.el)} onClick={widen} title="Select the element around this one (↑)">↑ Wider</button>
            <button type="button" data-action="narrow" disabled={!narrowerOf(picked.el)} onClick={narrow} title="Select the element inside this one (↓)">↓ Narrower</button>
            <span class="dim">or the ↑ ↓ keys</span>
          </div>
          {picked.eligibility.status === 'redirected' && <p class="hint">{picked.eligibility.reason}</p>}
          {picked.eligibility.status === 'blocked' && <p class="error" data-part="notice">{picked.eligibility.reason} Make the selection wider or narrower.</p>}
          {tool === 'spacing' && picked.eligibility.status === 'allowed' && spacingChoices(picked.entry).length > 1 && (
            <div class="row">
              <button type="button" aria-pressed={choice === ALL_SPACING} data-choice="all" onClick={() => setChoice(ALL_SPACING)}>All ({spacingChoices(picked.entry).length})</button>
              {spacingChoices(picked.entry).map((u, i) => (
                <button type="button" aria-pressed={choice === i} data-choice={u.property} onClick={() => setChoice(i)}>{u.property} {u.computed}</button>
              ))}
            </div>
          )}
          {busy ? <Loading text={busy} /> : (
            <>
              <div class="row">
                {picked.eligibility.status === 'allowed' && (
                  <button type="button" class="primary" data-output="one" onClick={() => void produce(false)}>This one</button>
                )}
                {picked.eligibility.status !== 'blocked' && (
                  <button type="button" class={picked.eligibility.status === 'allowed' ? '' : 'primary'} data-output="system" onClick={() => void produce(true)}>The whole system</button>
                )}
                <button type="button" onClick={() => startPicking(tool)}>Pick again</button>
              </div>
              {picked.eligibility.status !== 'blocked' && (
                <p class="dim" data-part="output-hints">
                  {picked.eligibility.status === 'allowed' && <>This one: {OUTPUT_HINTS[tool].one}. </>}The whole system: {OUTPUT_HINTS[tool].system}.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {!picking && !basketOpen && result && (
        <div class="panel" role="dialog" aria-label="Capture file">
          {result.ok ? (
            <>
              <div class="file" data-part="file-name">{result.output.fileName}</div>
              <div class="row">
                <label>Units <select data-setting="units" value={settings.units ?? 'px'} onChange={e => changeSettings({ ...settings, units: (e.currentTarget as HTMLSelectElement).value as 'px' })}>
                  <option value="px">px</option><option value="rem">rem</option><option value="both">both</option>
                </select></label>
                <label>Colors <select data-setting="colors" value={settings.colors ?? 'hex'} onChange={e => changeSettings({ ...settings, colors: (e.currentTarget as HTMLSelectElement).value as 'hex' })}>
                  <option value="hex">hex</option><option value="rgb">rgb</option><option value="hsl">hsl</option><option value="oklch">oklch</option>
                </select></label>
                <label title="What the file's source line says: the page's address, or only the site's name">Source <select data-setting="source" value={settings.source ?? 'page'} onChange={e => changeSettings({ ...settings, source: (e.currentTarget as HTMLSelectElement).value as 'page' })}>
                  <option value="page">page address</option><option value="site">site name only</option>
                </select></label>
              </div>
              {stateNote && <p class="hint" data-part="state-note">{stateNote}</p>}
              {componentCtx && result.output.capture.meta.scope === 'component' && (
                <div class="stack" data-part="manual-state">
                  <div data-part="states-summary">
                    <span class="dim">States in this file: </span>
                    {componentCtx.states.map(s => (
                      <span class={s.detected ? 'state' : 'state missing'} data-state={s.state}
                        title={s.detected ? (s.trigger ? `In the file: triggered by the ${s.trigger.element} around it` : 'In the file')
                          : checked(s) ? 'Luci checked this state in the browser: nothing changes.'
                          : 'Not detected: it may change through JavaScript. Capture it by hand below.'}>
                        {s.state} {s.detected ? `✓${s.trigger ? ` (via ${s.trigger.element.split(' ')[0]})` : ''}` : checked(s) ? '– no change' : '– not detected'}
                      </span>
                    ))}
                  </div>
                  {countdown !== null && capturing ? (
                    <div class="row">
                      <p class="hint" data-part="countdown">
                        {capturing.total > 1 ? `${capturing.index} of ${capturing.total}: ` : ''}Put the component in its <strong>{capturing.state}</strong> state now ({STATE_HOW[capturing.state]}). Capturing in {countdown}…
                      </p>
                      <button type="button" data-action="cancel-capture" onClick={cancelCapture}>Stop</button>
                    </div>
                  ) : (
                    <div class="row">
                      <label>Capture by hand <select data-setting="manual-state" value={manualTarget} onChange={e => setManualTarget((e.currentTarget as HTMLSelectElement).value as ManualTarget)}>
                        {missingStates(componentCtx.states).length > 0 && <option value={ALL_MISSING}>All missing states ({missingStates(componentCtx.states).length})</option>}
                        {STATE_ORDER.filter(s => s !== 'disabled').map(s => <option value={s}>{s}</option>)}
                      </select></label>
                      <button type="button" data-action="capture-state" onClick={captureCurrentState}>{manualTarget === ALL_MISSING ? 'Capture them' : 'Capture this state'}</button>
                    </div>
                  )}
                </div>
              )}
              <label class="stack">
                <span>Your instructions for the agent <span class="dim">(optional, saved in the file as written)</span></span>
                <textarea data-part="instructions" rows={2} value={instructions}
                  placeholder="e.g. Use this as our primary button, but with our brand blue #1d4ed8 and a 12px radius."
                  onInput={e => changeInstructions((e.currentTarget as HTMLTextAreaElement).value)} />
              </label>
              <span class="row">
                <span class="dim">The file below can be edited.</span>
                {edited !== null && (
                  <>
                    <span class="dim" data-part="edited-note">Edited by hand: the unit and color settings no longer change it.</span>
                    <button type="button" data-action="undo-edits" onClick={() => setEdited(null)}>Undo my edits</button>
                  </>
                )}
              </span>
              <textarea class="preview" data-part="preview" spellcheck={false} value={markdown}
                onInput={e => setEdited((e.currentTarget as HTMLTextAreaElement).value)} />
              <div class="row">
                <button type="button" class="primary" data-action="copy" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
                <button type="button" data-action="download" onClick={download}>Download .design.md</button>
                {props.saveToProject && output && <SaveButton save={() => props.saveToProject!(output.fileName, markdown)} key={output.fileName} />}
                <button type="button" data-action="add-to-basket" disabled={added} onClick={() => void addCurrent()}>{added ? 'Added to basket' : 'Add to basket'}</button>
                {tool && <button type="button" onClick={() => startPicking(tool)}>Pick again</button>}
              </div>
            </>
          ) : (
            <>
              <p class="error" data-part="error">{result.message}</p>
              {tool && <div class="row"><button type="button" onClick={() => startPicking(tool)}>Pick again</button></div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
