/**
 * Capture files (design.md): one Markdown file per capture, with YAML frontmatter saying
 * where it came from, then fixed sections that depend on scope and type. See
 * docs/format/capture.md. This module is browser-safe (no Node imports): the extension uses it.
 *
 * M4 defines the token captures (one text style, color or spacing value) and the three
 * page systems (typography, color, spacing). Component, section and collection follow in M5.
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

export const textTokenSchema = z.object({
  meta: tokenMeta('text'),
  instructions: instructionsField,
  style: textStyleSchema,
  usedBy: elementRefSchema
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
 * stylesheet rules for the state), `attribute` (by setting disabled for a moment), `manual` (the user
 * put the component in the state and pressed "Capture current state").
 */
export const STATE_METHODS = ['forced', 'rules', 'attribute', 'manual'] as const;

/** One property of a part, as captured. */
export const styleEntrySchema = z.object({ property: z.string().min(1), value: valueSchema });

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
    styles: z.array(styleEntrySchema)
  })).min(1),
  states: z.array(z.object({
    state: z.enum(COMPONENT_STATES),
    /** False when the state changes nothing that could be read (it may change through JavaScript). */
    detected: z.boolean(),
    method: z.enum(STATE_METHODS).optional(),
    changes: z.array(z.object({ part: slug.optional(), property: z.string().min(1), from: z.string(), to: valueSchema }))
  })),
  motion: z.array(z.object({
    kind: z.enum(['transition', 'animation']),
    /** The property for a transition, the animation name for an animation. */
    target: z.string().min(1),
    duration: z.string().min(1),
    easing: z.string().min(1),
    delay: z.string().min(1).optional()
  })),
  /** "The whole system": similar elements on the page, grouped by how they differ from this one. */
  variants: z.array(z.object({
    name: slug,
    count: z.number().int().positive(),
    selector: z.string().min(1),
    differences: z.array(styleEntrySchema)
  })).optional()
});
export type ComponentCapture = z.infer<typeof componentSchema>;

export const captureSchema = z.union([textTokenSchema, colorTokenSchema, spacingTokenSchema, typographySystemSchema, colorSystemSchema, spacingSystemSchema, componentSchema]);

export type TextToken = z.infer<typeof textTokenSchema>;
export type ColorToken = z.infer<typeof colorTokenSchema>;
export type SpacingToken = z.infer<typeof spacingTokenSchema>;
export type TypographySystem = z.infer<typeof typographySystemSchema>;
export type ColorSystem = z.infer<typeof colorSystemSchema>;
export type SpacingSystem = z.infer<typeof spacingSystemSchema>;
export type Capture = z.infer<typeof captureSchema>;

/** How values are written. The value as the site authored it is always kept alongside. */
export const captureSettingsSchema = z.object({
  units: z.enum(UNIT_SETTINGS).default('px'),
  colors: z.enum(COLOR_SETTINGS).default('hex'),
  /** The page's root font size in px, for rem conversion. */
  rootFontSize: z.number().positive().default(16)
});
export type CaptureSettings = z.input<typeof captureSettingsSchema>;
