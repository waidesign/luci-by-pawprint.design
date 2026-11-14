/**
 * User-facing words for Luci's moments, by surface (brand/BRAND.md section 2): short sentences,
 * facts before feelings, numbers over adjectives, no exclamation marks, emoji, "oops", "yay" or
 * "buddy". A test checks every string here.
 */
export const COPY = {
  common: {
    ready: 'Luci is ready. Pick something.',
    done: (n: number, total: number) => `Done. ${n} of ${total} applied.`,
    copied: 'Copied',
    close: 'Close Luci',
    settings: 'Settings',
    help: 'How to use Luci'
  },
  capture: {
    title: 'DESIGN.md Extractor',
    byline: 'by Luci',
    description: 'Picks a component, text, colour or spacing on this page and writes it as a design file for your agent.',
    basketEmpty: { title: 'Nothing captured yet.', body: 'After a capture, press Add to basket. Items stay here across pages and sites.' },
    readingPage: 'Reading the whole page: text, colours, spacing and components.'
  },
  feedback: {
    notesEmpty: { title: 'No notes yet.', body: 'Press Annotate, then click an element to leave a note.' }
  },
  devToolbar: {
    connecting: 'Luci: connecting to your project.',
    open: 'Open Luci'
  }
} as const;
