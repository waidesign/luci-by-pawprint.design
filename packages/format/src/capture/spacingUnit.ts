/**
 * The base unit of a spacing system: the unit most spacing uses are multiples of. Moved here from
 * @luci-dev/capture (unchanged) in v0.3.3, so a site-level system merged from several pages finds its
 * base unit the same way a page's own system does. Pure and browser-safe.
 */

/** Sub-pixel rounding only: 10.5px is not a multiple of 2px. */
export const MULTIPLE_TOLERANCE = 0.25;
/** Is `v` px a whole number (1 or more) of `unit` px, give or take sub-pixel rounding? */
export const isMultipleOf = (v: number, unit: number) => {
  const n = Math.round(v / unit);
  return n >= 1 && Math.abs(v - n * unit) <= MULTIPLE_TOLERANCE;
};

/** Candidate base units, largest first. */
export const BASE_UNITS = [16, 12, 10, 8, 6, 5, 4, 3, 2] as const;
/** A base unit must fit at least this share of uses, and at least this many distinct values. */
export const BASE_UNIT_SHARE = 0.75;
export const BASE_UNIT_MIN_STEPS = 3;

/** A smaller unit replaces the chosen one when it explains at least this much more of the uses... */
export const BASE_UNIT_REFINE = 0.1;
/** ...and is at least this large (2px and 3px explain almost anything). */
export const BASE_UNIT_REFINE_MIN = 4;

/**
 * The unit most spacing uses are multiples of, or null when none fits well enough: the largest
 * candidate that fits at least 75% of uses and 3 distinct values; then a smaller divisor (4px or
 * more) that explains 10 points more of the uses wins, so a 4px scale with a few 12px values is
 * not read as 8px.
 */
export function findBaseUnit(values: readonly { px: number; count: number }[]): { px: number; share: number } | null {
  const total = values.reduce((n, v) => n + v.count, 0);
  if (!total) return null;
  const shareOf = (unit: number) => values.filter(v => isMultipleOf(v.px, unit)).reduce((n, v) => n + v.count, 0) / total;
  const steps = (unit: number) => values.filter(v => isMultipleOf(v.px, unit)).length;
  let best: number | null = null;
  for (const unit of BASE_UNITS) {
    if (shareOf(unit) >= BASE_UNIT_SHARE && steps(unit) >= Math.min(BASE_UNIT_MIN_STEPS, values.length)) { best = unit; break; }
  }
  if (best === null) return null;
  for (const unit of BASE_UNITS) {
    if (unit < best && unit >= BASE_UNIT_REFINE_MIN && best % unit === 0 && shareOf(unit) >= shareOf(best) + BASE_UNIT_REFINE) best = unit;
  }
  return { px: best, share: Number(shareOf(best).toFixed(2)) };
}
