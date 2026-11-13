/**
 * Feedback items (FR23-FR30): notes a person pins on elements of a running app, for an agent to
 * apply. One item per note, stored per project (not per page) so a session spans pages (FR26).
 * Each item keeps a stable ID, `P<page>-A<n>`: the page is numbered in the order its route was
 * first annotated in the session, the item in the order it was added on that page (FR27).
 * See docs/format/feedback.md. Browser-safe: no Node imports.
 */
import { z } from 'zod';

/** What the person wants: fix a bug, change a design, ask something, or confirm it is right. */
export const FEEDBACK_INTENTS = ['fix', 'change', 'question', 'approve'] as const;
export const FEEDBACK_PRIORITIES = ['high', 'medium', 'low'] as const;
/**
 * Where an item is: `pending` (not given to an agent yet), `sent` (in a copied prompt),
 * `acknowledged` (an agent is on it), `question` (the agent asked something; see the thread),
 * `resolved` (done, with a summary) or `dismissed` (not done, with the reason).
 */
export const FEEDBACK_STATUSES = ['pending', 'sent', 'acknowledged', 'question', 'resolved', 'dismissed'] as const;
/** How much the prompt says about each element: selector and text; + source and components; + styles. */
export const DETAIL_LEVELS = ['compact', 'standard', 'detailed'] as const;

export type FeedbackIntent = (typeof FEEDBACK_INTENTS)[number];
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

export const FEEDBACK_REF = /^P(\d+)-A(\d+)$/;
const isoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, 'an ISO time in UTC, e.g. 2026-11-13T09:30:00.000Z');

/** A place in the project's code: a path relative to the project (or as the browser saw it), with line and column when known. */
export const sourceLocationSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional()
});
export type SourceLocation = z.infer<typeof sourceLocationSchema>;

export const feedbackItemSchema = z.object({
  /** The item's own id (its file name); never shown to agents. */
  id: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/, 'letters, digits, "-" and "_"'),
  /** The stable ID agents report on: "P2-A3". */
  ref: z.string().regex(FEEDBACK_REF, 'P<page>-A<n>, e.g. P2-A3'),
  page: z.object({
    /** The page's address, as the browser had it. */
    url: z.string().min(1),
    /** The route: the path, plus a "#/..." fragment for hash routers ("/pricing", "/#/settings"). */
    route: z.string().min(1),
    title: z.string().optional(),
    /** The file of the page's own component, when a framework adapter found it ("src/pages/Pricing.tsx"). */
    source: z.string().min(1).optional()
  }),
  target: z.object({
    /** An element clicked, or text selected inside it. */
    kind: z.enum(['element', 'text']),
    /** A selector that finds the element (from tags and positions, ids when stable). */
    selector: z.string().min(1),
    /** The element named from tag and role: "button", "h2 (heading)". */
    element: z.string().min(1),
    /** The element's visible text, shortened. */
    text: z.string().optional(),
    /** The text the person selected (kind "text"). */
    selectedText: z.string().optional(),
    /** React (or another framework's) components around the element, outermost first, and where its JSX is written. */
    components: z.array(z.string().min(1)).optional(),
    source: sourceLocationSchema.optional(),
    /** A few computed styles, for the "detailed" level. */
    styles: z.record(z.string(), z.string()).optional(),
    /** Where the element was on the page (document px), to place the marker again after a reload. */
    rect: z.object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() }).optional()
  }),
  comment: z.string().trim().min(1),
  intent: z.enum(FEEDBACK_INTENTS),
  priority: z.enum(FEEDBACK_PRIORITIES),
  status: z.enum(FEEDBACK_STATUSES),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  /** When it was last put in a copied prompt (FR29). */
  sentAt: isoDateTime.optional(),
  /** The agent's questions and the person's answers, and status notes (FR30). */
  thread: z.array(z.object({ from: z.enum(['agent', 'person']), text: z.string().trim().min(1), at: isoDateTime })).default([]),
  /** What the agent did (resolved) or why not (dismissed). */
  resolution: z.string().trim().min(1).optional()
});
export type FeedbackItem = z.infer<typeof feedbackItemSchema>;
export type FeedbackItemInput = z.input<typeof feedbackItemSchema>;

/** The parts of a ref: P2-A3 -> { page: 2, n: 3 }. */
export function parseRef(ref: string): { page: number; n: number } | null {
  const m = FEEDBACK_REF.exec(ref);
  return m ? { page: Number(m[1]), n: Number(m[2]) } : null;
}

/**
 * The route of an address: its path, plus the fragment when it holds a route ("#/settings").
 * "http://localhost:5173/pricing?plan=pro" -> "/pricing".
 */
export function routeOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname || '/'}${u.hash.startsWith('#/') ? u.hash : ''}`;
  } catch {
    return url || '/';
  }
}

/**
 * The ref for a new item on a route: the route keeps the page number it already has in the
 * session (any item on it), else gets the next one; the item gets the next number on that page.
 */
export function nextRef(items: readonly Pick<FeedbackItem, 'ref' | 'page'>[], route: string): string {
  const parsed = items.map(i => ({ route: i.page.route, ...parseRef(i.ref)! })).filter(i => Number.isFinite(i.page));
  const onRoute = parsed.find(i => i.route === route);
  const page = onRoute ? onRoute.page : Math.max(0, ...parsed.map(i => i.page)) + 1;
  const n = Math.max(0, ...parsed.filter(i => i.page === page).map(i => i.n)) + 1;
  return `P${page}-A${n}`;
}

/** Items in prompt order: by page number, then item number. */
export function byRef<T extends Pick<FeedbackItem, 'ref'>>(items: readonly T[]): T[] {
  const key = (i: T) => parseRef(i.ref) ?? { page: Infinity, n: Infinity };
  return [...items].sort((a, b) => key(a).page - key(b).page || key(a).n - key(b).n);
}

/** Statuses an agent still has to act on. */
export const OPEN_STATUSES: readonly FeedbackStatus[] = ['pending', 'sent', 'acknowledged', 'question'];
