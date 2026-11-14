/** Luci's loader: a spinning ring (or, for a long wait, Luci asleep) and what Luci is doing, announced to screen readers. */
import { Mascot } from '@luci/ui';

/**
 * Shown while Luci reads the page; `step` is the current step ("Components 3 of 16"). `sleep` is for
 * a wait that fills a panel: Luci asleep, as the brand kit gives for loading (BRAND.md section 5).
 */
export function Loading(props: { text: string; step?: string | null; part?: string; sleep?: boolean }) {
  return (
    <div class={props.sleep ? 'loading loading-sleep' : 'loading'} role="status" aria-live="polite" data-part={props.part ?? 'busy'}>
      {props.sleep ? <Mascot pose="sleep" size={96} /> : <span class="spinner" aria-hidden="true" />}
      <span class="stack">
        <span data-part="busy-text">{props.text}</span>
        {props.step && <span class="steps" data-part="busy-step">{props.step}</span>}
      </span>
    </div>
  );
}

/** The small spinner inside a button while it works. */
export function ButtonSpinner() {
  return <span class="spinner" aria-hidden="true" data-part="button-spinner" />;
}

/**
 * Wait until the browser has painted (so a loader shows before heavy work starts), or at most
 * 100ms when frames do not come (a background tab).
 */
export const nextPaint = (win: Window): Promise<void> => Promise.race([
  new Promise<void>(r => win.requestAnimationFrame(() => setTimeout(r, 0))),
  new Promise<void>(r => setTimeout(r, 100))
]);
