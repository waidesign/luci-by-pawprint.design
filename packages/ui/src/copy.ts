/**
 * User-facing words for Luci's surfaces (brand/BRAND.md section 2): short sentences, facts before
 * feelings, numbers over adjectives, no exclamation marks, emoji, "oops", "yay" or "buddy". A test
 * checks every string here.
 */
const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

export const COPY = {
  common: {
    ready: 'Luci is ready. Pick something.',
    done: (n: number, total: number) => `Done. ${n} of ${total} applied.`,
    copied: 'Copied',
    close: 'Close Luci',
    menu: 'Menu',
    settings: 'Settings',
    help: 'How it works'
  },
  capture: {
    title: 'DESIGN.md Extractor',
    byline: 'by Luci',
    description: 'Pick anything on a page. Get a design file your agent can build from.',
    devTitle: 'Luci',
    devByline: 'Dev toolbar',
    devDescription: 'Notes, layout plans and captures for your agent. Saved in your project.',
    greeting: { title: 'Luci is ready.', body: 'Pick a tool. Then click anything on the page.' },
    tools: { component: 'Component', text: 'Text', color: 'Colour', spacing: 'Spacing', page: 'Whole page', check: 'Check a build' },
    basket: (n: number) => `Basket ${n}`,
    basketLabel: (n: number) => `Basket, ${items(n)}`,
    basketEmpty: { title: 'Nothing captured yet.', body: 'Add a capture. It stays here across pages and sites.' },
    actions: {
      copy: 'Copy',
      copySection: 'Copy section file',
      download: 'Download',
      downloadZip: (n: number) => `Download .zip, ${n} files`,
      addToBasket: 'Add to basket',
      inBasket: 'View in basket',
      pickAgain: 'Pick again'
    },
    readingPage: 'Reading the page.',
    /** The extension's menu: the rest of Luci lives in your project. */
    invite: {
      title: 'Take Luci home.',
      body: 'In your project, Luci also takes notes, plans layouts and remembers your rules. Free. Nothing leaves your machine.',
      action: 'Set up Luci'
    }
  },
  repo: {
    link: 'Luci on GitHub',
    soon: 'GitHub link coming soon'
  },
  feedback: {
    notesEmpty: { title: 'No notes yet.', body: 'Annotate, then click an element. Or select text.' }
  },
  devToolbar: {
    connecting: 'Luci: connecting to your project.',
    open: 'Open Luci',
    /** What each mode is for, shown while nothing in it is active (Layout's is its Select hint). */
    intro: {
      feedback: { body: 'Leave notes on your app for your agent. Press Annotate, then click an element. Or select text to note words.', keys: 'A annotate · N notes · P pause' },
      capture: { body: 'Take a part of this page as a design file. Pick a tool, then click it on the page.', keys: 'V component · T text · C colour · S spacing · P whole page · K check' }
    }
  }
} as const;

export type ToolCopyId = keyof typeof COPY.capture.tools;
export const itemsLabel = items;
