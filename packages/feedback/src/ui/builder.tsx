/**
 * Team Feedback — Builder side (devtool Feedback mode).
 *
 * Lets the designer paste one or more copied reviews from teammates, merges duplicates across
 * reviewers, filters by role, places notes on the local app using multi-signal anchors (asking
 * to confirm instead of guessing, listing anything that couldn't be placed), warns when a review
 * looks older than recent changes, and prepares selected notes for human-reviewed agent hand-off.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { type StorageLike } from '@luci-dev/capture';
import {
  formatAgentNoteComment,
  mergeReviewNotes,
  normalizeReviewPath,
  parseTeamReviews,
  type MergedReviewNote,
  type ReviewerRole,
  type TeamReview
} from '@luci-dev/format/feedback';
import { Button, EmptyState, IconCheck, IconDelete, IconSelect } from '@luci-dev/ui';
import { anchorSummary, matchAnchor, type AnchorMatch } from '../anchor.js';
import { frameworkInfo, nameOf } from '../target.js';

export const TEAM_REVIEWS_KEY = 'luci.teamReviews';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface RuleAssessment {
  status: 'supports-rule' | 'conflicts-rule' | 'no-rule';
  label: string;
  detail: string;
  designFile?: string;
}

export interface BuilderSelectedItem {
  merged: MergedReviewNote;
  el: Element | null;
  rule?: RuleAssessment;
}

export type BucketTab = 'placed' | 'confirm' | 'unplaced';

export interface BuilderTriageState {
  roleFilter: 'all' | ReviewerRole;
  bucket: BucketTab;
  dismissed: Set<string>;
  confirmed: Record<string, Element>;
  candidateIdx: Record<string, number>;
  selected: Set<string>;
}

export interface BuilderProps {
  doc: Document;
  route: string;
  store?: StorageLike;
  /** Latest project change time from `luci serve` /health (read-only), if connected. */
  projectLastModifiedAt?: string;
  /** Manually picked elements bound to merged note IDs by the designer. */
  manualElements: Record<string, Element>;
  onManualElement: (noteId: string, el: Element) => void;
  /** Ask parent Feedback layer to enter element-pick mode for a specific Builder note. */
  onStartPickForNote: (noteId: string, label: string) => void;
  /** Highlight a placed/candidate element on the live page. */
  onHighlightElement: (el: Element | null) => void;
  /** Optional design-rule assessments per merged note ID (wired in Task 4). */
  ruleChecks?: Record<string, RuleAssessment>;
  /** Called whenever placed elements change so parent can run design-rule checks on them. */
  onPlacedElementsChange?: (placed: { id: string; el: Element; note: string }[]) => void;
  /** Called when the designer chooses to preview & send selected notes to the agent (wired in Task 5). */
  onPreviewForAgent?: (items: BuilderSelectedItem[]) => void;
  /** Called whenever the count of active triaged notes changes (for tab badge). */
  onCountChange?: (count: number) => void;
  /** Allows clearing all imported reviews after hand-off or manually. */
  sentIds?: ReadonlySet<string>;
  /** Lifted triage state so dismissals, confirmations and selections survive unmounts (B-55). */
  triageState?: BuilderTriageState;
  onTriageChange?: (updater: (prev: BuilderTriageState) => BuilderTriageState) => void;
}

export const TEAM_REVIEWS_DISMISSED_KEY = 'luci.teamFeedback.dismissed';

export function readStoredDismissed(store?: StorageLike): Set<string> {
  try {
    const raw = store
      ? store.getItem(TEAM_REVIEWS_DISMISSED_KEY)
      : (typeof localStorage !== 'undefined' ? localStorage.getItem(TEAM_REVIEWS_DISMISSED_KEY) : null);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function writeStoredDismissed(dismissed: Set<string>, store?: StorageLike): void {
  try {
    const json = JSON.stringify([...dismissed]);
    if (store) store.setItem(TEAM_REVIEWS_DISMISSED_KEY, json);
    else if (typeof localStorage !== 'undefined') localStorage.setItem(TEAM_REVIEWS_DISMISSED_KEY, json);
  } catch {
    // ignore storage errors
  }
}

export function readStoredReviews(store?: StorageLike): TeamReview[] {
  try {
    const raw = store
      ? store.getItem(TEAM_REVIEWS_KEY)
      : (typeof localStorage !== 'undefined' ? localStorage.getItem(TEAM_REVIEWS_KEY) : null);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TeamReview[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredReviews(reviews: TeamReview[], store?: StorageLike): void {
  try {
    const json = JSON.stringify(reviews);
    if (store) store.setItem(TEAM_REVIEWS_KEY, json);
    else if (typeof localStorage !== 'undefined') localStorage.setItem(TEAM_REVIEWS_KEY, json);
  } catch {
    // ignore storage errors
  }
}

function shortDate(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1]! : iso.slice(0, 10) || 'unknown date';
}

export function stalenessNotice(reviews: readonly TeamReview[], projectLastModifiedAt?: string, nowMs = Date.now()): string | null {
  if (!reviews.length) return null;
  const times = reviews
    .map(r => ({ iso: r.createdAt, ms: Date.parse(r.createdAt) }))
    .filter(t => Number.isFinite(t.ms))
    .sort((a, b) => a.ms - b.ms);
  const oldest = times[0];
  if (!oldest) return null;

  if (projectLastModifiedAt) {
    const modMs = Date.parse(projectLastModifiedAt);
    if (Number.isFinite(modMs) && modMs - oldest.ms > 60_000) {
      return `This review is from ${shortDate(oldest.iso)} — your app changed more recently.`;
    }
    return null;
  }
  if (nowMs - oldest.ms > SEVEN_DAYS_MS) {
    return `This review is from ${shortDate(oldest.iso)} — it is more than 7 days old and the app may have changed.`;
  }
  return null;
}

export function Builder(props: BuilderProps) {
  const { doc, route, store } = props;
  const [reviews, setReviews] = useState<TeamReview[]>(() => readStoredReviews(store));
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(reviews.length === 0);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const [localTriage, setLocalTriage] = useState<BuilderTriageState>(() => ({
    roleFilter: 'all',
    bucket: 'placed',
    dismissed: readStoredDismissed(store),
    confirmed: {},
    candidateIdx: {},
    selected: new Set(),
  }));

  const triage = props.triageState ?? localTriage;
  const setTriage = props.onTriageChange ?? setLocalTriage;
  const { roleFilter, bucket, dismissed, confirmed, candidateIdx, selected } = triage;

  const setRoleFilter = (role: 'all' | ReviewerRole) => setTriage(prev => ({ ...prev, roleFilter: role }));
  const setBucket = (b: BucketTab) => setTriage(prev => ({ ...prev, bucket: b }));

  const mergedAll = useMemo(() => mergeReviewNotes(reviews), [reviews]);
  const activeNotes = useMemo(
    () => mergedAll.filter(n => !dismissed.has(n.id) && !(props.sentIds?.has(n.id))),
    [mergedAll, dismissed, props.sentIds]
  );

  useEffect(() => {
    props.onCountChange?.(activeNotes.length);
  }, [activeNotes.length]);

  const rolesPresent = useMemo(() => {
    const counts = new Map<ReviewerRole, number>();
    for (const n of activeNotes) {
      for (const r of n.roles) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [activeNotes]);

  const filtered = useMemo(() => {
    if (roleFilter === 'all') return activeNotes;
    return activeNotes.filter(n => n.roles.includes(roleFilter));
  }, [activeNotes, roleFilter]);

  // Evaluate placement for every active note against the current page DOM (B-57)
  const placements = useMemo(() => {
    const curRoute = normalizeReviewPath(route);
    const map = new Map<string, { status: BucketTab; el: Element | null; candidates: Element[]; otherRoute: boolean; match: AnchorMatch }>();
    for (const n of activeNotes) {
      const manual = props.manualElements[n.id] ?? confirmed[n.id];
      if (manual && manual.isConnected) {
        map.set(n.id, { status: 'placed', el: manual, candidates: [manual], otherRoute: false, match: { status: 'placed', el: manual, score: 100 } });
        continue;
      }
      const otherRoute = normalizeReviewPath(n.path) !== curRoute;
      if (otherRoute) {
        map.set(n.id, { status: 'unplaced', el: null, candidates: [], otherRoute: true, match: { status: 'unplaced', candidates: [] } });
        continue;
      }
      const m = matchAnchor(doc, n.anchor);
      if (m.status === 'placed') {
        map.set(n.id, { status: 'placed', el: m.el, candidates: [m.el], otherRoute: false, match: m });
      } else if (m.status === 'confirm') {
        map.set(n.id, { status: 'confirm', el: m.candidates[0] ?? null, candidates: m.candidates, otherRoute: false, match: m });
      } else {
        map.set(n.id, { status: 'unplaced', el: null, candidates: [], otherRoute: false, match: m });
      }
    }
    return map;
  }, [activeNotes, route, doc, props.manualElements, confirmed]);

  const placedNotes = filtered.filter(n => placements.get(n.id)?.status === 'placed');
  const confirmNotes = filtered.filter(n => placements.get(n.id)?.status === 'confirm');
  const unplacedNotes = filtered.filter(n => placements.get(n.id)?.status === 'unplaced');

  const placedSig = placedNotes.map(n => n.id).join(',');
  useEffect(() => {
    if (!props.onPlacedElementsChange) return;
    const list = placedNotes.flatMap(n => {
      const el = placements.get(n.id)?.el;
      return el ? [{ id: n.id, el, note: formatAgentNoteComment(n) }] : [];
    });
    props.onPlacedElementsChange(list);
  }, [placedSig, route, props.manualElements, confirmed]);

  // Auto-select a non-empty bucket if current bucket is empty after import
  useEffect(() => {
    if (!filtered.length) return;
    if (bucket === 'placed' && !placedNotes.length) {
      if (confirmNotes.length) setBucket('confirm');
      else if (unplacedNotes.length) setBucket('unplaced');
    } else if (bucket === 'confirm' && !confirmNotes.length && placedNotes.length) {
      setBucket('placed');
    }
  }, [filtered.length, placedNotes.length, confirmNotes.length, unplacedNotes.length]);

  const importReviews = () => {
    const parsed = parseTeamReviews(pasteText);
    if (!parsed.length) {
      setPasteError('Paste at least one review or note to import.');
      return;
    }
    const next = [...reviews, ...parsed];
    setReviews(next);
    writeStoredReviews(next, store);
    setPasteText('');
    setPasteError(null);
    setShowPaste(false);
  };

  const clearAll = () => {
    setReviews([]);
    writeStoredReviews([], store);
    writeStoredDismissed(new Set(), store);
    setTriage(prev => ({
      ...prev,
      dismissed: new Set(),
      confirmed: {},
      candidateIdx: {},
      selected: new Set(),
      bucket: 'placed',
      roleFilter: 'all',
    }));
    setShowPaste(true);
    props.onHighlightElement(null);
  };

  const toggleSelect = (id: string) => {
    setTriage(prev => {
      const next = new Set(prev.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, selected: next };
    });
  };

  const dismissNote = (id: string) => {
    setTriage(prev => {
      const nextDismissed = new Set([...prev.dismissed, id]);
      writeStoredDismissed(nextDismissed, store);
      const nextSelected = new Set(prev.selected);
      nextSelected.delete(id);
      return { ...prev, dismissed: nextDismissed, selected: nextSelected };
    });
    props.onHighlightElement(null);
  };

  const highlight = (el: Element | null) => {
    props.onHighlightElement(el);
    if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const staleMsg = stalenessNotice(reviews, props.projectLastModifiedAt);
  const degradedReview = reviews.find(r => r.warning);

  // B-57: scope preview/send to notes visible under the current filter while keeping hidden selections intact
  const selectedVisible = useMemo(
    () => filtered.filter(n => selected.has(n.id)),
    [filtered, selected]
  );

  const selectedItems: BuilderSelectedItem[] = selectedVisible.map(n => {
    const pl = placements.get(n.id);
    const el = props.manualElements[n.id] ?? confirmed[n.id] ?? (pl?.status === 'placed' ? pl.el : null);
    return { merged: n, el, rule: props.ruleChecks?.[n.id] };
  });

  const shownBucket = bucket === 'placed' ? placedNotes : bucket === 'confirm' ? confirmNotes : unplacedNotes;

  if (showPaste || !reviews.length) {
    return (
      <div class="stack" data-part="builder-paste-view">
        <div class="tf-head-row">
          <h2>Team reviews</h2>
          {reviews.length > 0 && (
            <button type="button" class="link-button" data-action="cancel-paste" onClick={() => setShowPaste(false)}>
              Back to imported ({activeNotes.length})
            </button>
          )}
        </div>
        <p class="dim" style={{ margin: 0 }}>
          Paste one or more reviews copied from the Luci extension, Slack, or email. You review everything before anything goes to your agent.
        </p>
        <textarea class="tf-review-box" data-part="builder-paste" placeholder="Paste one or more Luci reviews here…" value={pasteText}
          onInput={e => { setPasteText((e.currentTarget as HTMLTextAreaElement).value); setPasteError(null); }} />
        {pasteError && <p class="error" style={{ margin: 0 }}>{pasteError}</p>}
        <div class="row">
          <button type="button" class="btn-primary" data-action="import-reviews" disabled={!pasteText.trim()} onClick={importReviews}>
            Import review
          </button>
          {reviews.length > 0 && (
            <button type="button" onClick={() => setShowPaste(false)}>Cancel</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div class="stack" data-part="builder-triage">
      <div class="tf-head-row">
        <h2>Team reviews ({activeNotes.length})</h2>
        <button type="button" class="btn-secondary" data-action="paste-more" onClick={() => setShowPaste(true)}>
          + Paste more
        </button>
      </div>

      {/* Review sources: reviewer, role, site URL and date */}
      <div class="tf-card-sunken" data-part="builder-sources">
        {reviews.map((r, i) => (
          <div class="meta" key={`${r.reviewer.name}-${i}`}>
            <strong>{r.reviewer.name}</strong> ({r.reviewer.role}) · {r.site} · {shortDate(r.createdAt)}
          </div>
        ))}
      </div>

      {staleMsg && (
        <div class="tf-banner" role="status" data-part="builder-stale">{staleMsg}</div>
      )}
      {degradedReview?.warning && (
        <div class="tf-banner" role="status" data-part="builder-degraded">{degradedReview.warning}</div>
      )}

      {/* Role filter */}
      {rolesPresent.length > 0 && (
        <div class="tf-filter-row" data-part="role-filter">
          <span class="dim">Role:</span>
          <div class="seg" role="group" aria-label="Filter by reviewer role">
            <button type="button" data-role-filter="all" aria-pressed={roleFilter === 'all'} onClick={() => setRoleFilter('all')}>
              All ({activeNotes.length})
            </button>
            {rolesPresent.map(([role, count]) => (
              <button type="button" key={role} data-role-filter={role} aria-pressed={roleFilter === role} onClick={() => setRoleFilter(role)}>
                {role} ({count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Placement buckets */}
      <div class="seg tabs" role="tablist" aria-label="Placement status" data-part="placement-tabs">
        <button type="button" role="tab" data-bucket="placed" aria-selected={bucket === 'placed'} onClick={() => setBucket('placed')}>
          Placed ({placedNotes.length})
        </button>
        <button type="button" role="tab" data-bucket="confirm" aria-selected={bucket === 'confirm'} onClick={() => setBucket('confirm')}>
          Confirm ({confirmNotes.length})
        </button>
        <button type="button" role="tab" data-bucket="unplaced" aria-selected={bucket === 'unplaced'} onClick={() => setBucket('unplaced')}>
          Couldn&apos;t place ({unplacedNotes.length})
        </button>
      </div>

      {!activeNotes.length ? (
        <EmptyState title="All review notes handled" body="Paste another review or switch back to My notes." part="builder-empty" />
      ) : !shownBucket.length ? (
        <p class="dim" style={{ margin: 0 }}>No notes in this list for the current filter.</p>
      ) : (
        <div class="notes-scroll" data-part="builder-list">
          {shownBucket.map(n => {
            const pl = placements.get(n.id)!;
            const rule = props.ruleChecks?.[n.id];
            const reviewersLabel = n.reviewers.map(r => `${r.name} (${r.role})`).join(', ');
            const idx = candidateIdx[n.id] ?? 0;
            const activeCandidate = pl.candidates[idx % Math.max(1, pl.candidates.length)] ?? null;
            const targetEl = bucket === 'placed' ? pl.el : activeCandidate;
            const compName = targetEl ? frameworkInfo(targetEl)?.components.at(-1) : undefined;

            return (
              <div class="tf-card" key={n.id} data-builder-note={n.id}>
                <div class="tf-head-row">
                  <label class="tf-check-label">
                    <input type="checkbox" data-select-note={n.id} checked={selected.has(n.id)}
                      onChange={() => toggleSelect(n.id)} />
                    <span>
                      <strong data-part="note-reviewers">{reviewersLabel}</strong>
                      <span class="dim"> · <code>{n.path}</code></span>
                    </span>
                  </label>
                  {n.entries.length > 1 && <span class="tf-badge accent" data-part="merged-badge">Merged ({n.entries.length})</span>}
                </div>

                <p class="comment" style={{ margin: 0 }} data-part="builder-note-text">
                  {formatAgentNoteComment(n)}
                </p>

                {bucket === 'placed' && targetEl && (
                  <div class="tf-head-row">
                    <span class="meta">
                      On {nameOf(targetEl)}{compName ? ` · ${compName}` : ''}
                    </span>
                    <button type="button" class="link-button" data-action="highlight-note" onClick={() => highlight(targetEl)}>
                      Highlight
                    </button>
                  </div>
                )}

                {bucket === 'placed' && rule && (
                  <div class="stack" style={{ gap: '4px' }} data-part="rule-assessment" data-rule-status={rule.status}>
                    <span class={`tf-badge ${rule.status === 'supports-rule' ? 'supports' : rule.status === 'conflicts-rule' ? 'conflicts' : ''}`}>
                      {rule.label}
                    </span>
                    {rule.detail && <p class="tf-rule-line">{rule.detail}</p>}
                  </div>
                )}

                {bucket === 'confirm' && activeCandidate && (
                  <div class="stack" style={{ gap: '6px' }}>
                    <span class="meta">
                      Possible match ({idx + 1} of {pl.candidates.length}): {nameOf(activeCandidate)}
                      {compName ? ` · ${compName}` : ''}
                    </span>
                    <div class="row">
                      <Button variant="primary" size="sm" icon={IconCheck} data-action="confirm-match"
                        onClick={() => { setTriage(prev => ({ ...prev, confirmed: { ...prev.confirmed, [n.id]: activeCandidate } })); highlight(activeCandidate); }}>
                        Confirm match
                      </Button>
                      <button type="button" class="btn-secondary" data-action="highlight-candidate" onClick={() => highlight(activeCandidate)}>
                        Highlight
                      </button>
                      {pl.candidates.length > 1 && (
                        <button type="button" class="btn-secondary" data-action="next-candidate"
                          onClick={() => {
                            const nextIdx = (idx + 1) % pl.candidates.length;
                            setTriage(prev => ({ ...prev, candidateIdx: { ...prev.candidateIdx, [n.id]: nextIdx } }));
                            highlight(pl.candidates[nextIdx] ?? null);
                          }}>
                          Next match
                        </button>
                      )}
                      <Button variant="secondary" size="sm" icon={IconSelect} data-action="pick-element"
                        onClick={() => props.onStartPickForNote(n.id, n.note)}>
                        Pick element
                      </Button>
                    </div>
                  </div>
                )}

                {bucket === 'unplaced' && (
                  <div class="stack" style={{ gap: '6px' }}>
                    <span class="meta" data-part="remembered-anchor">
                      Remembered: {anchorSummary(n.anchor, n.path)}
                    </span>
                    {pl.otherRoute && (
                      <span class="dim">Open <code>{n.path}</code> in your app to place this note on its element.</span>
                    )}
                    {!pl.otherRoute && (
                      <div class="row">
                        <Button variant="secondary" size="sm" icon={IconSelect} data-action="pick-element"
                          onClick={() => props.onStartPickForNote(n.id, n.note)}>
                          Pick element
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <div class="row">
                  <Button variant="secondary" size="sm" icon={IconDelete} data-action="dismiss-review-note" onClick={() => dismissNote(n.id)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div class="row footer">
        {props.onPreviewForAgent && (
          <button type="button" class="btn-primary" data-action="preview-for-agent" disabled={!selectedItems.length}
            onClick={() => props.onPreviewForAgent!(selectedItems)}>
            Preview &amp; send to agent ({selectedItems.length})
          </button>
        )}
        <button type="button" class="btn-danger" data-action="clear-builder" onClick={clearAll}>
          Clear reviews
        </button>
      </div>
    </div>
  );
}
