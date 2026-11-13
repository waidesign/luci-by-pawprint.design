/**
 * Capture files (design.md): one Markdown file per capture, with YAML frontmatter saying
 * where it came from, then fixed sections that depend on scope and type. See
 * docs/format/capture.md. This module is browser-safe (no Node imports): the extension uses it.
 *
 * Token captures (one text style, color or spacing value, or every spacing value of one element),
 * the three page systems (typography, color, spacing), components, and the full-page reference.
 * v0.2 adds accessibility notes to components and text; section scope follows.
 */
import { z } from 'zod';

export const CAPTURE_SCOPES = ['token', 'system', 'component', 'section', 'page', 'collection'] as const;
export const TOKEN_TYPES = ['text', 'color', 'spacing'] as const;
export const SYSTEM_TYPES = ['typography', 'color', 'spacing'] as const;
/** `measured` for values read from the live DOM; `estimated` for values guessed (a pixel on an image). */
export const CAPTURE_METHODS = ['measured', 'estimated'] as const;
export const COLOR_ROLES = ['background', 'text', 'border', 'accent'] as const;
export const UNIT_SETTINGS = ['px', 'rem', 'both'] as const;
export const COLOR_SETTINGS = ['hex', 'rgb', 'hsl', 'oklch'] as const;
/** How the source is written: the page (origin and path) or only the site's name ("lattice.com"). */
export const SOURCE_SETTINGS = ['page', 'site'] as const;
/** A site's name as the "site" source setting writes it: host without "www.", with a port when there is one. */
export const siteNameSchema = z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d+)?$/i, 'a site name, e.g. example.com');

export type CaptureScope = (typeof CAPTURE_SCOPES)[number];
export type ColorRole = (typeof COLOR_ROLES)[number];

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase letters, digits and single hyphens');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');

/**
 * One captured value. `computed` is what the browser resolved ("16px", "rgb(15, 98, 254)");
 * `authored` is what the site wrote, when it differs ("var(--space-4)", "clamp(1rem, 2vw, 2rem)");
 * `token` is the custom property it resolves through.
 */
export const valueSchema = z.object({
  computed: z.string().min(1),
  authored: z.string().min(1).optional(),
  token: z.string().regex(/^--[\w-]+$/, 'a CSS custom property, e.g. --space-4').optional()
});
export type CapturedValue = z.infer<typeof valueSchema>;

/** Where something is used. `element` is named from tag and role, never from class names. */
export const elementRefSchema = z.object({
  element: z.string().min(1),
  selector: z.string().min(1)
});
export type ElementRef = z.infer<typeof elementRefSchema>;

export const textStyleSchema = z.object({
  family: valueSchema,
  size: valueSchema,
  weight: valueSchema,
  lineHeight: valueSchema,
  letterSpacing: valueSchema,
  color: valueSchema,
  /** Only when not the default (italic, uppercase, underline...). */
  style: valueSchema.optional(),
  transform: valueSchema.optional(),
  decoration: valueSchema.optional()
});
export type TextStyle = z.infer<typeof textStyleSchema>;

/**
 * The user's own instructions for their coding agent (how to use or change this capture), written in
 * the toolbar. Kept word for word in the file as "## Your instructions"; Luci never writes them.
 */
export const instructionsField = z.string().trim().min(1).max(4000).optional();

export const metaSchema = z.object({
  name: slug,
  scope: z.enum(CAPTURE_SCOPES),
  type: z.string().min(1),
  /** The page: origin and path only (no query or fragment, which can carry personal data). */
  source: z.url(),
  selector: z.string().min(1).optional(),
  captured: isoDate,
  method: z.enum(CAPTURE_METHODS),
  extends: z.string().min(1).optional()
});
export type CaptureMeta = z.infer<typeof metaSchema>;

const tokenMeta = (type: (typeof TOKEN_TYPES)[number]) => metaSchema.extend({ scope: z.literal('token'), type: z.literal(type) });
const systemMeta = (type: (typeof SYSTEM_TYPES)[number]) => metaSchema.extend({ scope: z.literal('system'), type: z.literal(type), selector: z.undefined().optional() });

/** WCAG 2.2 levels a check meets: AAA, AA, or neither. */
export const WCAG_LEVELS = ['AAA', 'AA', 'fail'] as const;
export type WcagLevel = (typeof WCAG_LEVELS)[number];

/**
 * Accessibility notes (v0.2), computed from the capture: text contrast against the color behind it,
 * target size for something you click, and whether focus shows. Each is what Luci measured on the
 * page; `estimated` marks a contrast whose background is a picture, a gradient or see-through.
 */
export const accessibilitySchema = z.object({
  contrast: z.array(z.object({
    /** The part with the text; absent for a text capture or the container. */
    part: slug.optional(),
    /** Text and background colors as the browser resolved them (the background after layering). */
    text: z.string().min(1),
    background: z.string().min(1),
    /** Rounded down to two decimals, so a pass is never claimed for 4.499. */
    ratio: z.number().min(1).max(21),
    /** Large text (24px, or 18.66px bold): the lower ratios apply. */
    large: z.boolean(),
    level: z.enum(WCAG_LEVELS),
    estimated: z.boolean().optional()
  })),
  /** Something you click: its size against 24 by 24px (AA, 2.5.8) and 44 by 44px (AAA, 2.5.5). */
  target: z.object({ width: z.number().nonnegative(), height: z.number().nonnegative(), level: z.enum(WCAG_LEVELS) }).optional(),
  /**
   * Something you can focus: whether its focus (or focus-visible) state changes how it looks, and
   * the properties that change. `visible` null: Luci could not tell (states read from stylesheets only).
   */
  focus: z.object({
    visible: z.boolean().nullable(),
    state: z.enum(['focus-visible', 'focus']).optional(),
    by: z.array(z.string().min(1))
  }).optional()
});
export type Accessibility = z.infer<typeof accessibilitySchema>;

export const textTokenSchema = z.object({
  meta: tokenMeta('text'),
  instructions: instructionsField,
  style: textStyleSchema,
  usedBy: elementRefSchema,
  accessibility: accessibilitySchema.optional()
});

export const colorTokenSchema = z.object({
  meta: tokenMeta('color'),
  instructions: instructionsField,
  value: valueSchema,
  role: z.enum(COLOR_ROLES).optional(),
  /** Each place the color is applied. Empty for a pixel that matched no element color. */
  usedFor: z.array(elementRefSchema.extend({ property: z.string().min(1) }))
});

export const SPACING_KINDS = ['padding', 'margin', 'gap', 'distance'] as const;
export const spacingTokenSchema = z.object({
  meta: tokenMeta('spacing'),
  instructions: instructionsField,
  value: valueSchema,
  kind: z.enum(SPACING_KINDS),
  /** The CSS property, e.g. padding-left or column-gap; for a distance, absent. */
  property: z.string().min(1).optional(),
  /** `authored` when a CSS declaration sets it; `measured` when it comes from geometry (a distance). */
  label: z.enum(['authored', 'measured']),
  usedBy: elementRefSchema.optional(),
  between: z.tuple([elementRefSchema, elementRefSchema]).optional()
});

/**
 * Every spacing value one element sets (padding, margin, gap), in one token file: the Spacing tool's
 * "All" choice. Same sections as a single spacing token; the Spacing table has a row per value.
 */
export const spacingSetSchema = z.object({
  meta: tokenMeta('spacing'),
  instructions: instructionsField,
  values: z.array(z.object({
    value: valueSchema,
    kind: z.enum(['padding', 'margin', 'gap']),
    property: z.string().min(1)
  })).min(1),
  usedBy: elementRefSchema
});

export const typographySystemSchema = z.object({
  meta: systemMeta('typography'),
  instructions: instructionsField,
  roles: z.array(z.object({
    role: slug,
    style: textStyleSchema,
    count: z.number().int().positive(),
    elements: z.array(z.string().min(1))
  })).min(1),
  families: z.array(z.object({ family: z.string().min(1), count: z.number().int().positive() })),
  scale: z.array(z.object({ size: valueSchema, count: z.number().int().positive() }))
});

export const colorSystemSchema = z.object({
  meta: systemMeta('color'),
  instructions: instructionsField,
  roles: z.array(z.object({
    role: z.enum(COLOR_ROLES),
    value: valueSchema,
    count: z.number().int().positive(),
    properties: z.array(z.string().min(1))
  })).min(1),
  tokens: z.array(z.object({ token: z.string().regex(/^--[\w-]+$/), value: z.string().min(1), count: z.number().int().nonnegative() }))
});

export const spacingSystemSchema = z.object({
  meta: systemMeta('spacing'),
  instructions: instructionsField,
  scale: z.array(z.object({ value: valueSchema, count: z.number().int().positive() })).min(1),
  /** The unit most values are multiples of. `share` is the fraction of uses that fit it. */
  baseUnit: z.object({ px: z.number().positive(), share: z.number().min(0).max(1) }).nullable(),
  outliers: z.array(z.object({ value: valueSchema, count: z.number().int().positive() }))
});

export const COMPONENT_STATES = ['hover', 'focus', 'focus-visible', 'active', 'disabled'] as const;
/**
 * How a state was read: `forced` (the browser was told to apply it, via the debugger), `rules` (from
 * stylesheet rules for the state), `attribute` (by setting disabled for a moment), `pointer` (the
 * debugger moved a mouse pointer onto it, so the site's own JavaScript ran), `manual` (the user put
 * the component in the state and captured it with "Capture by hand"). On a state that was not
 * detected, the method says how Luci looked: `forced` or `pointer` mean there is no change; `rules`
 * means none in the stylesheets (it may still change through JavaScript).
 */
export const STATE_METHODS = ['forced', 'rules', 'attribute', 'pointer', 'manual'] as const;

/** One property of a part, as captured. */
export const styleEntrySchema = z.object({ property: z.string().min(1), value: valueSchema });

/**
 * How a component shows one picture: an img, video, canvas, an SVG <image>, or a background photo.
 * Never the image itself, its URL or its pixels (FR21): the agent puts its own image in the slot.
 */
export const IMAGE_KINDS = ['img', 'video', 'canvas', 'svg-image', 'background'] as const;
export const componentImageSchema = z.object({
  /** The part it is, named as in Anatomy, States and Motion ("container" for its own background photo). */
  part: slug,
  kind: z.enum(IMAGE_KINDS),
  /** Rendered size in CSS px. */
  size: z.object({ width: z.number().nonnegative(), height: z.number().nonnegative() }),
  /** The rendered shape, "16:9" or "2.4:1". */
  aspectRatio: z.string().min(1),
  /** The shape of the file itself, when known and different (a 3:2 photo cropped to 16:9). */
  sourceAspectRatio: z.string().min(1).optional(),
  /**
   * Properties that frame it (fit, position, corners, effects). `on` names an element that applies
   * one for it, such as the card that clips its corners; `corners` says which, when not all four.
   */
  treatment: z.array(styleEntrySchema.extend({ on: z.string().min(1).optional(), corners: z.string().min(1).optional() })),
  /** Layers painted over it (a gradient on ::after, a tinted div), with image URLs removed. */
  overlays: z.array(z.object({
    on: z.string().min(1),
    background: z.string().min(1),
    opacity: z.string().min(1).optional(),
    blend: z.string().min(1).optional()
  }))
});
export type ComponentImage = z.infer<typeof componentImageSchema>;

export const componentSchema = z.object({
  meta: metaSchema.extend({ scope: z.literal('component'), type: slug, selector: z.string().min(1) }),
  instructions: instructionsField,
  /** Custom properties the component uses, with resolved values. */
  tokens: z.array(z.object({ token: z.string().regex(/^--[\w-]+$/), value: z.string().min(1), usedFor: z.array(z.string().min(1)) })),
  /** The parts, named from tag, role and structure (never classes). The first is the container. */
  anatomy: z.array(z.object({
    part: slug,
    element: z.string().min(1),
    optional: z.boolean().optional(),
    /** Hidden at rest and shown in these states (an arrow that fades in on hover). */
    appearsIn: z.array(z.enum(COMPONENT_STATES)).optional(),
    styles: z.array(styleEntrySchema)
  })).min(1),
  states: z.array(z.object({
    state: z.enum(COMPONENT_STATES),
    /** False when the state changes nothing that could be read; `method` says how Luci looked. */
    detected: z.boolean(),
    method: z.enum(STATE_METHODS).optional(),
    /**
     * When the state comes from an element around the component (Tailwind's group-hover, "a:hover > div"):
     * that element, and how many levels up it is. Absent when the component itself triggers it.
     */
    trigger: z.object({ element: z.string().min(1), selector: z.string().min(1), depth: z.number().int().positive() }).optional(),
    changes: z.array(z.object({ part: slug.optional(), property: z.string().min(1), from: z.string(), to: valueSchema }))
  })),
  motion: z.array(z.object({
    /** The part that moves; absent for the container. */
    part: slug.optional(),
    kind: z.enum(['transition', 'animation']),
    /** The property for a transition, the animation name for an animation. */
    target: z.string().min(1),
    duration: z.string().min(1),
    easing: z.string().min(1),
    delay: z.string().min(1).optional()
  })),
  /** The image slots inside the component (its own background photo included), framed as the site shows them. */
  images: z.array(componentImageSchema).optional(),
  /** Accessibility notes computed from the capture (v0.2). */
  accessibility: accessibilitySchema.optional(),
  /** "The whole system": similar elements on the page, grouped by how they differ from this one. */
  variants: z.array(z.object({
    name: slug,
    count: z.number().int().positive(),
    selector: z.string().min(1),
    differences: z.array(styleEntrySchema)
  })).optional()
});
export type ComponentCapture = z.infer<typeof componentSchema>;

/**
 * A full-page reference: the page's typography, color and spacing systems plus one entry per kind
 * of component on it (with its variants and states), in one file. Each system is null when the page
 * has none of it (no visible text, colors or spacing).
 */
export const pageSchema = z.object({
  meta: metaSchema.extend({ scope: z.literal('page'), type: z.literal('page'), selector: z.undefined().optional() }),
  instructions: instructionsField,
  typography: typographySystemSchema.nullable(),
  color: colorSystemSchema.nullable(),
  spacing: spacingSystemSchema.nullable(),
  components: z.array(componentSchema),
  /** Parts Luci could not read on this page (a system, or one component by its selector), left out with the reason. */
  skipped: z.array(z.object({ part: z.string().min(1), reason: z.string().min(1) })).optional()
});
export type PageCapture = z.infer<typeof pageSchema>;

export const captureSchema = z.union([textTokenSchema, colorTokenSchema, spacingTokenSchema, spacingSetSchema, typographySystemSchema, colorSystemSchema, spacingSystemSchema, componentSchema, pageSchema]);

export type TextToken = z.infer<typeof textTokenSchema>;
export type ColorToken = z.infer<typeof colorTokenSchema>;
export type SpacingToken = z.infer<typeof spacingTokenSchema>;
export type SpacingSet = z.infer<typeof spacingSetSchema>;
export type TypographySystem = z.infer<typeof typographySystemSchema>;
export type ColorSystem = z.infer<typeof colorSystemSchema>;
export type SpacingSystem = z.infer<typeof spacingSystemSchema>;
export type Capture = z.infer<typeof captureSchema>;

/** How values are written. The value as the site authored it is always kept alongside. */
export const captureSettingsSchema = z.object({
  units: z.enum(UNIT_SETTINGS).default('px'),
  colors: z.enum(COLOR_SETTINGS).default('hex'),
  /** `page` writes the page's address (origin and path); `site` only the site's name. */
  source: z.enum(SOURCE_SETTINGS).default('page'),
  /** The page's root font size in px, for rem conversion. */
  rootFontSize: z.number().positive().default(16)
});
export type CaptureSettings = z.input<typeof captureSettingsSchema>;
