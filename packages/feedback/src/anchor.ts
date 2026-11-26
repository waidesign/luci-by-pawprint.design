/**
 * Multi-signal element anchor matching for Team Feedback Builder.
 *
 * Uses CSS selector, visible text, tag/ARIA role, framework component name, and rough normalized
 * position [xPct, yPct]. Never guesses when uncertain: close ties or low-confidence matches return
 * `status: 'confirm'` so the designer can confirm or pick the element directly.
 */
import { isLuciUi, querySelectorDeep } from '@luci-dev/capture';
import type { ReviewAnchor } from '@luci-dev/format/feedback';
import { frameworkInfo, nameOf } from './target.js';

export type AnchorMatch =
  | { status: 'placed'; el: Element; score: number }
  | { status: 'confirm'; candidates: Element[]; score: number }
  | { status: 'unplaced'; candidates: [] };

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

function isCandidateElement(el: Element): boolean {
  if (isLuciUi(el)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'html' || tag === 'head' || tag === 'body' || tag === 'script' || tag === 'style' || tag === 'meta' || tag === 'link' || tag === 'title') {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function elementText(el: Element): string {
  return collapse((el as HTMLElement).innerText ?? el.textContent ?? '');
}

function positionPct(el: Element, doc: Document, win: Window): [number, number] {
  const r = el.getBoundingClientRect();
  const docW = Math.max(doc.documentElement.scrollWidth || 0, win.innerWidth || 1);
  const docH = Math.max(doc.documentElement.scrollHeight || 0, win.innerHeight || 1);
  const cx = r.left + win.scrollX + r.width / 2;
  const cy = r.top + win.scrollY + r.height / 2;
  return [
    Math.max(0, Math.min(100, (cx / docW) * 100)),
    Math.max(0, Math.min(100, (cy / docH) * 100))
  ];
}

/**
 * Score every visible element on the page against a saved ReviewAnchor using multiple signals.
 * Returns `placed` only when confidence is high and clearly ahead of any runner-up.
 */
export function matchAnchor(doc: Document, anchor?: ReviewAnchor): AnchorMatch {
  if (!anchor) return { status: 'unplaced', candidates: [] };
  const hasSignal = Boolean(anchor.selector || anchor.text || anchor.component || anchor.element || anchor.position);
  if (!hasSignal) return { status: 'unplaced', candidates: [] };

  const win = doc.defaultView ?? window;
  let selectorEl: Element | null = null;
  if (anchor.selector) {
    try {
      const found = querySelectorDeep(doc, anchor.selector);
      if (found && isCandidateElement(found)) selectorEl = found;
    } catch {
      // ignore invalid selector from another site or DOM structure
    }
  }

  const wantedText = anchor.text ? collapse(anchor.text) : '';
  const wantedEl = anchor.element ? collapse(anchor.element) : '';
  const wantedTag = wantedEl.split(' ')[0] ?? '';
  const wantedComp = anchor.component ? collapse(anchor.component) : '';

  const all = Array.from(doc.querySelectorAll('*')).filter(isCandidateElement);
  const scored: { el: Element; score: number; signals: number }[] = [];

  for (const el of all) {
    let score = 0;
    let signals = 0;

    // 1. Selector match
    if (selectorEl && el === selectorEl) {
      score += 45;
      signals++;
    }

    // 2. Tag / ARIA role match
    const elName = collapse(nameOf(el));
    const elTag = el.tagName.toLowerCase();
    if (wantedEl) {
      if (elName === wantedEl) {
        score += 18;
        signals++;
      } else if (wantedTag && elTag === wantedTag) {
        score += 12;
        signals++;
      }
    }

    // 3. Visible text match (exact beats substring; penalize huge containers wrapping the text)
    if (wantedText) {
      const txt = elementText(el);
      if (txt === wantedText) {
        score += 40;
        signals++;
      } else if (txt && txt.includes(wantedText) && txt.length <= wantedText.length * 2.5 + 24) {
        score += 20;
        signals++;
      } else if (txt && wantedText.includes(txt) && txt.length >= 4 && wantedText.length <= txt.length * 2.5 + 24) {
        score += 14;
        signals++;
      }
    }

    // 4. Framework component name
    if (wantedComp) {
      const info = frameworkInfo(el);
      if (info?.components.some(c => collapse(c) === wantedComp)) {
        score += 24;
        signals++;
      }
    }

    // 5. Rough position on the page
    if (anchor.position && signals > 0) {
      const [x, y] = positionPct(el, doc, win);
      const dist = Math.hypot(x - anchor.position[0], y - anchor.position[1]);
      if (dist <= 12) {
        score += 14;
        signals++;
      } else if (dist <= 26) {
        score += 7;
        signals++;
      }
    }

    if (score >= 28) scored.push({ el, score, signals });
  }

  if (!scored.length) return { status: 'unplaced', candidates: [] };

  // Prefer higher score, then more specific (deeper / smaller) elements on exact ties
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ra = a.el.getBoundingClientRect();
    const rb = b.el.getBoundingClientRect();
    return ra.width * ra.height - rb.width * rb.height;
  });

  const top = scored[0]!;
  const second = scored[1];
  const clearLead = !second || top.score - second.score >= 15;

  // High confidence requires strong score + clear lead (or exact selector verified by tag/text/component)
  if (top.score >= 58 && clearLead && top.signals >= 2) {
    return { status: 'placed', el: top.el, score: top.score };
  }

  return {
    status: 'confirm',
    candidates: scored.filter(s => s.score >= top.score - 15).slice(0, 3).map(s => s.el),
    score: top.score
  };
}

/** Plain-language summary of what an anchor remembered (for the "Couldn't be placed" list). */
export function anchorSummary(anchor: ReviewAnchor | undefined, path: string): string {
  if (!anchor) return `Plain note on ${path} (no element anchor)`;
  const parts: string[] = [];
  if (anchor.element) parts.push(anchor.element.split(' ')[0]!);
  if (anchor.text) parts.push(`"${anchor.text}"`);
  if (anchor.component) parts.push(`in ${anchor.component}`);
  const desc = parts.length ? parts.join(' ') : anchor.selector ?? 'element';
  return `${desc} on ${path}`;
}
