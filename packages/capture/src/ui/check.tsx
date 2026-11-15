/**
 * The design check's panels (v0.3): choose the design file (saved in the project, a component in the
 * basket, or pasted), then, after the built component is picked and read, the result: what matches
 * and each difference, ticked to become a feedback note (dev toolbar) or copied as a report.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { cleanSource, formatCheckReport, readComponentFile, type BasketItem, type CheckDifference } from '@luci/format/capture';
import { exportItem } from './basket.js';
import { ButtonSpinner, Loading } from './loading.js';
import { checkNote, type CheckNote, type CheckOutcome, type DesignChoice } from './tools.js';

/** A component capture saved in the project, as the dev toolbar lists them. */
export interface SavedDesign { file: string; name: string; scope: string; type: string; source: string }

/** Where the dev toolbar finds design files (luci serve: .luci/design/). */
export interface DesignSource {
  list(): Promise<SavedDesign[]>;
  read(file: string): Promise<string>;
}

/** Pins differences as feedback notes on the built component; returns their IDs. */
export type AddCheckNotes = (el: Element, notes: CheckNote[]) => Promise<string[]>;

export const CHECK_HINT = 'Pick its design file, then click the component you built. Luci captures it the same way and lists every difference from the design.';

const siteOf = (source: string) => { try { return new URL(source).host.replace(/^www\./, ''); } catch { return source; } };

export function DesignChooser(props: { designs?: DesignSource; basket: readonly BasketItem[]; onChoose: (d: DesignChoice) => void; onCancel: () => void }) {
  const [saved, setSaved] = useState<SavedDesign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  useEffect(() => {
    if (!props.designs) return;
    props.designs.list().then(files => setSaved(files.filter(f => f.scope === 'component')), err => setError(err instanceof Error ? err.message : String(err)));
  }, [props.designs]);

  const openSaved = async (f: SavedDesign) => {
    setOpening(f.file);
    setError(null);
    try {
      const markdown = await props.designs!.read(f.file);
      props.onChoose({ label: `${f.name} (${f.type}) from ${siteOf(f.source)}`, file: `.luci/design/${f.file}`, markdown });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpening(null);
    }
  };
  const components = props.basket.filter(i => i.capture.meta.scope === 'component');
  const usePasted = () => {
    const r = readComponentFile(pasted);
    if (!r.ok) { setPasteError(r.error); return; }
    props.onChoose({ label: `${r.value.meta.name} (${r.value.meta.type}), pasted`, file: `${r.value.meta.name}.design.md`, markdown: pasted });
  };

  return (
    <div class="panel" role="dialog" aria-label="Design check" data-part="check-chooser">
      <h2>Check a built component against its design</h2>
      <p class="hint">{CHECK_HINT}</p>
      {props.designs && (
        <div class="stack" data-part="check-saved">
          <span>Saved in this project <span class="dim">(.luci/design/)</span></span>
          {error && <p class="error" data-part="check-error">{error}</p>}
          {!saved && !error && <Loading text="Reading the project's design files…" />}
          {saved && !saved.length && <p class="dim">No component files saved yet. Capture one with Component, then "Save to project".</p>}
          {saved && saved.length > 0 && (
            <ul class="files">
              {saved.map(f => (
                <li data-design={f.file}>
                  <span><strong>{f.name}</strong> <span class="dim">{f.type} · {siteOf(f.source)}</span></span>
                  <button type="button" data-design-use disabled={opening !== null} onClick={() => void openSaved(f)}>{opening === f.file ? <><ButtonSpinner />Opening…</> : 'Use'}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div class="stack" data-part="check-basket">
        <span>From the basket</span>
        {components.length ? (
          <ul class="files">
            {components.map(item => (
              <li data-basket-design={item.id}>
                <span><strong>{item.name}</strong> <span class="dim">{item.capture.meta.type} · {siteOf(item.capture.meta.source)}</span></span>
                <button type="button" data-design-use onClick={() => {
                  const { fileName, markdown } = exportItem(item, {});
                  props.onChoose({ label: `${item.name} (${item.capture.meta.type}) from ${siteOf(item.capture.meta.source)}`, file: fileName, markdown });
                }}>Use</button>
              </li>
            ))}
          </ul>
        ) : <p class="dim">No components in the basket.</p>}
      </div>
      <label class="stack">
        <span>Or paste a component's design file</span>
        <textarea data-part="check-paste" rows={4} spellcheck={false} value={pasted} placeholder="---&#10;name: primary-button&#10;scope: component&#10;…"
          onInput={e => { setPasted((e.currentTarget as HTMLTextAreaElement).value); setPasteError(null); }} />
      </label>
      {pasteError && <p class="error" data-part="check-paste-error">{pasteError}</p>}
      <div class="row">
        <button type="button" data-action="check-paste-use" disabled={!pasted.trim()} onClick={usePasted}>Use the pasted file</button>
        <button type="button" data-action="check-cancel" onClick={props.onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const KIND_LABEL: Readonly<Record<CheckDifference['kind'], string>> = {
  style: 'style', token: 'token', part: 'part', state: 'state', motion: 'motion', accessibility: 'accessibility'
};

export function CheckResultPanel(props: {
  outcome: Extract<CheckOutcome, { ok: true }>;
  design: DesignChoice;
  el: Element;
  selector: string;
  addNotes?: AddCheckNotes;
  /** Where notes go: "your project" or "this browser". */
  notesWhere?: string;
  onCopy: (text: string) => Promise<void>;
  onAgain: () => void;
  onChangeDesign: () => void;
  /** Automatic design check (v0.4): checking again whenever the page changes, and what the last re-check found. */
  watching?: boolean;
  onWatch?: (on: boolean) => void;
  autoNote?: string | null;
}) {
  const { result, note } = props.outcome;
  const diffs = result.differences;
  // Every difference is ticked to start with; the person unticks what they accept
  const [ticked, setTicked] = useState<boolean[]>(() => diffs.map(() => true));
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => {
    setTicked(diffs.map(() => true));
  }, [result]);
  const chosen = diffs.filter((_, i) => ticked[i]);
  const page = cleanSource(props.el.ownerDocument.location.href);
  const report = () => formatCheckReport({ ...result, differences: chosen }, { selector: props.selector, page, designFile: props.design.file });

  const add = async () => {
    if (!props.addNotes || !chosen.length) return;
    setAdding(true);
    setError(null);
    try {
      setAdded(await props.addNotes(props.el, chosen.map(d => checkNote(d, props.design.file))));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div class="panel" role="dialog" aria-label="Design check result" data-part="check-result">
      <h2>Design check: {result.design.name} <span class="dim">({result.design.type})</span></h2>
      <p class="dim" data-part="check-design">Against {props.design.label} · built: <code>{props.selector}</code></p>
      <p data-part="check-summary">
        {result.matches.length} value{result.matches.length === 1 ? '' : 's'} match · <strong>{diffs.length} difference{diffs.length === 1 ? '' : 's'}</strong>
      </p>
      {note && <p class="hint" data-part="state-note">{note}</p>}
      {props.onWatch && (
        <label class="check-watch" title="When the page changes (an edit reloads it), Luci checks the built component again">
          <input type="checkbox" data-action="check-watch" checked={Boolean(props.watching)} onChange={e => props.onWatch!((e.currentTarget as HTMLInputElement).checked)} />
          Check again when the page changes
        </label>
      )}
      {props.autoNote && <p class="hint" data-part="check-auto">{props.autoNote}</p>}
      {diffs.length === 0 ? (
        <p class="hint" data-part="check-match">It matches the design: nothing to fix.</p>
      ) : (
        <ul class="diffs" data-part="check-differences">
          {diffs.map((d, i) => (
            <li data-difference={i} data-kind={d.kind} class={d.priority}>
              <label>
                <input type="checkbox" checked={ticked[i]} disabled={added !== null}
                  onChange={e => setTicked(t => t.map((v, j) => (j === i ? (e.currentTarget as HTMLInputElement).checked : v)))} />
                <span>{d.comment}</span>
              </label>
              <span class="dim">{KIND_LABEL[d.kind]}{d.state ? ` · ${d.state}` : ''} · {d.priority}</span>
            </li>
          ))}
        </ul>
      )}
      {added && <p class="hint" data-part="check-added">Added {added.length} note{added.length === 1 ? '' : 's'} ({added.join(', ')}) to {props.notesWhere ?? 'your feedback notes'}. They are in Feedback mode, ready to copy for your agent.</p>}
      {error && <p class="error" data-part="check-error">{error}</p>}
      <div class="row">
        {props.addNotes && diffs.length > 0 && !added && (
          <button type="button" class="btn-primary" data-action="check-add" disabled={adding || !chosen.length} onClick={() => void add()}>
            {adding ? <><ButtonSpinner />Adding…</> : `Add ${chosen.length} as feedback note${chosen.length === 1 ? '' : 's'}`}
          </button>
        )}
        <button type="button" class={props.addNotes ? '' : 'btn-primary'} data-action="check-copy" onClick={() => void props.onCopy(report()).then(() => { setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 1400); })}>
          {copied ? 'Copied' : diffs.length ? 'Copy as a prompt' : 'Copy the report'}
        </button>
        <button type="button" data-action="check-again" onClick={props.onAgain}>Check another</button>
        <button type="button" data-action="check-design" onClick={props.onChangeDesign}>Change design</button>
      </div>
    </div>
  );
}
