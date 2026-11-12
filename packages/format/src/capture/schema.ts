/**
 * Capture files (design.md): one Markdown file per capture, with YAML frontmatter saying
 * where it came from, then fixed sections that depend on scope and type. See
 * docs/format/capture.md. This module is browser-safe (no Node imports): the extension uses it.
 *
 * M4 defines the token captures (one text style, colour or spacing value) and the three
 * page systems (typography, colour, spacing). Component, section and collection follow in M5.
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
  style: textStyleSchema,
  usedBy: elementRefSchema
});

export const colorTokenSchema = z.object({
  meta: tokenMeta('color'),
  value: valueSchema,
  role: z.enum(COLOR_ROLES).optional(),
  /** Each place the colour is applied. Empty for a pixel that matched no element colour. */
  usedFor: z.array(elementRefSchema.extend({ property: z.string().min(1) }))
});

export const SPACING_KINDS = ['padding', 'margin', 'gap', 'distance'] as const;
export const spacingTokenSchema = z.object({
  meta: tokenMeta('spacing'),
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
  scale: z.array(z.object({ value: valueSchema, count: z.number().int().positive() })).min(1),
  /** The unit most values are multiples of. `share` is the fraction of uses that fit it. */
  baseUnit: z.object({ px: z.number().positive(), share: z.number().min(0).max(1) }).nullable(),
  outliers: z.array(z.object({ value: valueSchema, count: z.number().int().positive() }))
});

export const captureSchema = z.union([textTokenSchema, colorTokenSchema, spacingTokenSchema, typographySystemSchema, colorSystemSchema, spacingSystemSchema]);

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
