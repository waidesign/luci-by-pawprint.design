/**
 * "Use my tokens" (v0.4, remap to my tokens): rewrite the capture onto the person's own design tokens
 * in one step: their project's tokens (the dev toolbar, through luci serve) or tokens they paste
 * (kept for next time). The result says how many values now use their tokens, and can be undone.
 */
import { useEffect, useState } from 'preact/hooks';
import { parseTokens, remapCapture, remapSummary, type MyToken } from '@luci/format/capture';
import { Button } from '@luci/ui';
import type { Output } from './tools.js';

/** Where the person's tokens come from. */
export interface MyTokensSource {
  /** Their project's own tokens (the dev toolbar, through luci serve). */
  project?: () => Promise<MyToken[]>;
  /** Tokens they pasted before, as CSS. */
  load: () => Promise<string>;
  save: (css: string) => Promise<void>;
}

/** Pasted tokens kept in the page's storage (the extension keeps them in its own). */
export function pageTokenStore(doc: Document, key = 'luci.myTokens'): MyTokensSource {
  const storage = () => { try { return (doc.defaultView ?? window).localStorage; } catch { return null; } };
  return {
    load: async () => storage()?.getItem(key) ?? '',
    save: async (css) => { try { storage()?.setItem(key, css); } catch { /* storage blocked */ } }
  };
}

/** The capture and its section files, rewritten onto the tokens. */
export function remapOutput(output: Output, tokens: readonly MyToken[], rootFontSize?: number): { output: Output; summary: string } {
  const opts = rootFontSize ? { rootFontSize } : {};
  const main = remapCapture(output.capture, tokens, opts);
  const files = output.files?.map(f => ({ ...f, capture: remapCapture(f.capture, tokens, opts).capture }));
  return { output: { ...output, capture: main.capture, ...(files ? { files } : {}) }, summary: remapSummary(main.report) };
}

export function RemapSection(props: {
  source: MyTokensSource;
  /** The summary of the rewrite in place, or null. */
  applied: string | null;
  /** Hand edits would be lost: the rewrite waits until they are undone. */
  edited: boolean;
  onApply: (tokens: MyToken[]) => void;
  onUndo: () => void;
}) {
  const { source } = props;
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState<MyToken[] | null>(null);
  const [from, setFrom] = useState<'project' | 'pasted'>('pasted');
  const [css, setCss] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void source.load().then(text => { if (live) setCss(c => c || text); });
    if (source.project) {
      void source.project().then(t => { if (!live) return; setProject(t); if (t.length) setFrom('project'); }).catch(() => { if (live) setProject([]); });
    }
    return () => { live = false; };
  }, [open]);

  const run = async () => {
    const tokens = from === 'project' && project?.length ? project : parseTokens(css);
    if (!tokens.length) { setError('No tokens found. Paste custom properties, such as --space-4: 16px; --radius-md: 8px;'); return; }
    if (from === 'pasted') await source.save(css);
    setError(null);
    setOpen(false);
    props.onApply(tokens);
  };

  if (props.applied) {
    return (
      <div class="stack" data-part="remap">
        <p class="hint" data-part="remap-summary">{props.applied}</p>
        <div class="row"><button type="button" class="btn-secondary" data-action="remap-undo" onClick={props.onUndo}>Put the site's values back</button></div>
      </div>
    );
  }
  if (!open) {
    return (
      <div class="manual-row" data-part="remap">
        <div class="section-copy">
          <span class="field-label">Your tokens</span>
          <span class="dim">{props.edited ? 'Undo your edits first: this rewrites the file.' : 'Rewrite this file onto your own design tokens.'}</span>
        </div>
        <div class="manual-actions">
          <button type="button" class="btn-secondary" data-action="remap-open" disabled={props.edited} onClick={() => setOpen(true)}>Use my tokens</button>
        </div>
      </div>
    );
  }
  return (
    <div class="stack" data-part="remap">
      <span class="field-label">Your tokens</span>
      {project && project.length > 0 && (
        <div class="seg" role="group" aria-label="Which tokens">
          <button type="button" aria-pressed={from === 'project'} data-remap-from="project" onClick={() => setFrom('project')}>Your project ({project.length})</button>
          <button type="button" aria-pressed={from === 'pasted'} data-remap-from="pasted" onClick={() => setFrom('pasted')}>Paste</button>
        </div>
      )}
      {from === 'project' && project?.length
        ? <span class="dim">The custom properties in your project's stylesheets.</span>
        : <textarea data-part="my-tokens" rows={4} spellcheck={false} value={css} placeholder={':root {\n  --space-4: 16px;\n  --radius-md: 8px;\n}'}
          onInput={e => setCss((e.currentTarget as HTMLTextAreaElement).value)} />}
      {error && <p class="error" data-part="remap-error">{error}</p>}
      <div class="row">
        <Button variant="primary" size="sm" data-action="remap-run" onClick={() => void run()}>Rewrite with my tokens</Button>
        <button type="button" data-action="remap-cancel" onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
      </div>
    </div>
  );
}
