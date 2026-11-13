/** Luci's loader: a spinning ring and what Luci is doing, announced to screen readers. */

/** Shown while Luci reads the page; `step` is the current step ("Components 3 of 16"). */
export function Loading(props: { text: string; step?: string | null; part?: string }) {
  return (
    <div class="loading" role="status" aria-live="polite" data-part={props.part ?? 'busy'}>
      <span class="spinner" aria-hidden="true" />
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
