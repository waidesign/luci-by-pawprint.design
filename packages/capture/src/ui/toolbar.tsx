/**
 * The on-page toolbar (FR1-FR5): tool modes, the picker with hover label and arrow-key navigation,
 * the eligibility check, the two outputs per pick, and the preview with copy and download.
 * Rendered by mount.ts inside a shadow root.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { formatCapture, type CaptureSettings, type ComponentCapture } from '@luci/format/capture';
import type { Eligibility } from '../eligibility.js';
import type { ElementSnapshot } from '../model.js';
import { manualState, type ComputedMap, type StateName } from '../states.js';
import { elementName } from '../naming.js';
import { eligibilityOf, eventTarget, firstChildOf, hoverLabel, parentOf } from './picker.js';
import {
  TOOLS,
  TOOL_LABELS,
  captureComponent,
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
  /** Lets the shell (or a test) feed an eyedropper colour in. */
  registerPixelInput?: (pick: (hex: string) => void) => void;
  /** Exact states through the browser's debugger (the extension); without it, states come from stylesheet rules. */
  readForcedStates?: ForcedStatesReader;
}

const STATE_ORDER: readonly StateName[] = ['hover', 'focus', 'focus-visible', 'active', 'disabled'];

interface Picked {
  el: Element;
  entry: ElementSnapshot;
  live: LiveSnapshot;
  eligibility: Eligibility;
}

const DRAG_PX = 6;

/** What to do with each tool, shown under the bar while it is picking. */
export const TOOL_HINTS: Readonly<Record<ToolId, string>> = {
  component: 'Click a component: a button, card, link, field or badge. ↑ widens the pick to the whole component.',
  text: 'Click any text on the page: a heading, paragraph, link or label.',
  color: 'Click an element to take its colour, or choose Pixel to pick any spot with the eyedropper.',
  spacing: 'Click an element for its padding, margin or gap, or drag from one element to another to measure the distance.'
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
  const [choice, setChoice] = useState(0);
  const [settings, setSettings] = useState<CaptureSettings>(props.settings);
  const [copied, setCopied] = useState(false);
  const [dropperOpen, setDropperOpen] = useState(false);
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
    if (r.ok) props.onOutput?.(r.output);
  };

  // The Component tool reads states before showing its file; a state can also be captured by hand after
  const [busy, setBusy] = useState<string | null>(null);
  const [stateNote, setStateNote] = useState<string | null>(null);
  const [componentCtx, setComponentCtx] = useState<{ live: LiveSnapshot; entry: ElementSnapshot; system: boolean; states: ComponentCapture['states']; rest: ComputedMap[] } | null>(null);
  const [manualTarget, setManualTarget] = useState<StateName>('hover');
  const [countdown, setCountdown] = useState<number | null>(null);

  const produce = async (system: boolean) => {
    if (!picked || !tool) return;
    if (tool !== 'component') {
      setComponentCtx(null);
      show(system ? captureSystem(tool, picked.live, settings, picked.entry) : captureOne(tool, picked.live, picked.entry, settings, choice));
      return;
    }
    if (system && (picked.entry.tag === 'body' || picked.entry.tag === 'html')) { show(captureSystem(tool, picked.live, settings, picked.entry)); return; }
    setBusy('Reading states…');
    try {
      const rest = restingValues(stateTargets(picked.live, picked.entry));
      const { states, note } = await readComponentStates(picked.live, picked.entry, props.readForcedStates);
      setStateNote(note);
      setComponentCtx({ live: picked.live, entry: picked.entry, system, states, rest });
      const first = states.find(s => !s.detected);
      if (first) setManualTarget(first.state);
      show(captureComponent(picked.live, picked.entry, settings, { system, states }));
    } finally {
      setBusy(null);
    }
  };

  const captureCurrentState = () => {
    if (!componentCtx) return;
    // A countdown, so the user can move the pointer onto the component, focus or press it
    let n = 3;
    setCountdown(n);
    const tick = () => {
      n -= 1;
      if (n > 0) { setCountdown(n); setTimeout(tick, 1000); return; }
      setCountdown(null);
      const targets = stateTargets(componentCtx.live, componentCtx.entry);
      const captured = manualState(manualTarget, targets, componentCtx.rest);
      const states = [...componentCtx.states.filter(s => s.state !== manualTarget), captured]
        .sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
      setComponentCtx({ ...componentCtx, states });
      show(captureComponent(componentCtx.live, componentCtx.entry, settingsRef.current, { system: componentCtx.system, states }));
    };
    setTimeout(tick, 1000);
  };

  const startPicking = (t: ToolId) => {
    // Focus leaves the tool button, so Enter picks instead of pressing the button again
    const active = (doc.querySelector('luci-toolbar')?.shadowRoot?.activeElement ?? null) as HTMLElement | null;
    active?.blur();
    setTool(t);
    setPicking(true);
    setPicked(null);
    setResult(null);
    setNotice(null);
    setComponentCtx(null);
    setStateNote(null);
    setCountdown(null);
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
    setPicked({ el, entry, live, eligibility: elig });
    setPicking(false);
    setNotice(null);
    setChoice(0);
    setResult(null);
  };

  // The eyedropper colour can come from the shell or a test
  useEffect(() => {
    props.registerPixelInput?.((hex: string) => {
      const live = liveSnapshot(doc);
      setTool('color');
      setPicking(false);
      setPicked(null);
      show(capturePixel(live, hex, settings));
    });
  });

  // Page listeners while picking: hover, click or drag to pick, keys to move and cancel
  useLayoutEffect(() => {
    if (!picking || !tool) return;
    const onMove = (e: PointerEvent) => {
      // Chrome sends a move when the layout under a still pointer changes; only real moves re-aim the picker
      const last = lastPointer.current;
      if (last && last.x === e.clientX && last.y === e.clientY) return;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      const target = eventTarget(e);
      if (!target) return;
      trail.current = [];
      aim(target);
    };
    const block = (e: Event) => {
      if (eventTarget(e)) { e.preventDefault(); e.stopPropagation(); }
    };
    const onDown = (e: PointerEvent) => {
      const target = eventTarget(e);
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      drag.current = { el: target, x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      const target = eventTarget(e);
      const start = drag.current;
      drag.current = null;
      if (!target || !start) return;
      e.preventDefault();
      e.stopPropagation();
      swallowClickUntil.current = performance.now() + 1000;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_PX;
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
    };
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
    const onScroll = () => setTick(t => t + 1);
    doc.addEventListener('pointermove', onMove, true);
    doc.addEventListener('pointerdown', onDown, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('click', block, true);
    doc.addEventListener('mousedown', block, true);
    doc.addEventListener('keydown', onKey, true);
    win.addEventListener('scroll', onScroll, true);
    return () => {
      doc.removeEventListener('pointermove', onMove, true);
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('click', block, true);
      doc.removeEventListener('mousedown', block, true);
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
  const markdown = output ? formatCapture(output.capture, settings) : '';

  const copy = async () => {
    try {
      await win.navigator.clipboard.writeText(markdown);
    } catch {
      // Without clipboard permission: the classic copy through a selected text area
      const area = doc.createElement('textarea');
      area.value = markdown;
      area.setAttribute('data-luci-ui', '');
      doc.body.appendChild(area);
      area.select();
      doc.execCommand('copy');
      area.remove();
    }
    setCopied(true);
  };

  const download = () => {
    if (!output) return;
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = output.fileName;
    a.setAttribute('data-luci-ui', '');
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const Dropper = (win as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
  const hasDropper = Boolean(Dropper);
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
        {TOOLS.map(t => (
          <button type="button" aria-pressed={tool === t && (picking || dropperOpen || Boolean(picked) || Boolean(result))} data-tool={t} onClick={() => startPicking(t)}>{TOOL_LABELS[t]}</button>
        ))}
        <button type="button" aria-label="Close Luci" data-action="close" onClick={props.onClose}>×</button>
      </div>

      {(picking || dropperOpen) && tool && (
        <div class="sub" data-part="tool-hint" role="note">
          {tool === 'color' && (
            <div class="seg" role="group" aria-label="Pick a colour from">
              <button type="button" aria-pressed={!dropperOpen} data-colour-mode="element" onClick={() => startPicking('color')}>Element</button>
              <button type="button" aria-pressed={dropperOpen} data-colour-mode="pixel" data-action="eyedropper" disabled={!hasDropper}
                title={hasDropper ? 'Pick any spot on the screen with the eyedropper' : 'This browser has no eyedropper. Click an element instead.'} onClick={pickPixel}>Pixel</button>
            </div>
          )}
          <p class="hint" data-part="hint">{TOOL_HINTS[tool]}{tool === 'color' && !hasDropper ? ' (This browser has no eyedropper.)' : ''}</p>
          <p class="keys">↑ ↓ widen or narrow · Enter picks · Esc cancels</p>
        </div>
      )}

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

      {!picking && picked && !result && tool && (
        <div class="panel" role="dialog" aria-label="Capture">
          <h2>{elementName(picked.entry.tag, picked.entry.role)}</h2>
          {picked.eligibility.status === 'redirected' && <p class="hint">{picked.eligibility.reason}</p>}
          {tool === 'spacing' && picked.eligibility.status === 'allowed' && spacingChoices(picked.entry).length > 1 && (
            <div class="row">
              {spacingChoices(picked.entry).map((u, i) => (
                <button type="button" aria-pressed={choice === i} data-choice={u.property} onClick={() => setChoice(i)}>{u.property} {u.computed}</button>
              ))}
            </div>
          )}
          {busy ? <p class="hint" data-part="busy">{busy}</p> : (
            <div class="row">
              {picked.eligibility.status === 'allowed' && (
                <button type="button" class="primary" data-output="one" onClick={() => void produce(false)}>This one</button>
              )}
              <button type="button" class={picked.eligibility.status === 'allowed' ? '' : 'primary'} data-output="system" onClick={() => void produce(true)}>The whole system</button>
              <button type="button" onClick={() => startPicking(tool)}>Pick again</button>
            </div>
          )}
        </div>
      )}

      {!picking && result && (
        <div class="panel" role="dialog" aria-label="Capture file">
          {result.ok ? (
            <>
              <div class="file" data-part="file-name">{result.output.fileName}</div>
              <div class="row">
                <label>Units <select data-setting="units" value={settings.units ?? 'px'} onChange={e => changeSettings({ ...settings, units: (e.currentTarget as HTMLSelectElement).value as 'px' })}>
                  <option value="px">px</option><option value="rem">rem</option><option value="both">both</option>
                </select></label>
                <label>Colours <select data-setting="colors" value={settings.colors ?? 'hex'} onChange={e => changeSettings({ ...settings, colors: (e.currentTarget as HTMLSelectElement).value as 'hex' })}>
                  <option value="hex">hex</option><option value="rgb">rgb</option><option value="hsl">hsl</option><option value="oklch">oklch</option>
                </select></label>
              </div>
              {stateNote && <p class="hint" data-part="state-note">{stateNote}</p>}
              {componentCtx && result.output.capture.meta.scope === 'component' && (
                <div class="row" data-part="manual-state">
                  {countdown !== null ? (
                    <p class="hint" data-part="countdown">Put the component in its {manualTarget} state now (hover, focus or press it). Capturing in {countdown}…</p>
                  ) : (
                    <>
                      <label>State <select data-setting="manual-state" value={manualTarget} onChange={e => setManualTarget((e.currentTarget as HTMLSelectElement).value as StateName)}>
                        {(['hover', 'focus', 'focus-visible', 'active', 'disabled'] as const).map(s => <option value={s}>{s}</option>)}
                      </select></label>
                      <button type="button" data-action="capture-state" onClick={captureCurrentState}>Capture current state</button>
                    </>
                  )}
                </div>
              )}
              <pre data-part="preview">{markdown}</pre>
              <div class="row">
                <button type="button" class="primary" data-action="copy" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
                <button type="button" data-action="download" onClick={download}>Download .design.md</button>
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
