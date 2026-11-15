/**
 * Computed layout relationships (v0.4.3): extracts flex and grid container and item
 * layout relationships from element snapshots.
 */
import type { ComputedLayout } from '@luci/format/capture';
import type { ElementSnapshot } from './model.js';

/** Compute layout relationships (container and/or item) for an element. */
export function computeElementLayout(el: ElementSnapshot, parentEl?: ElementSnapshot): ComputedLayout | undefined {
  const display = el.styles.display ?? '';
  const isFlexContainer = /flex/.test(display);
  const isGridContainer = /grid/.test(display);

  const parentDisplay = parentEl?.styles.display ?? '';
  const isFlexItem = Boolean(parentEl && /flex/.test(parentDisplay));
  const isGridItem = Boolean(parentEl && /grid/.test(parentDisplay));

  if (!isFlexContainer && !isGridContainer && !isFlexItem && !isGridItem) {
    return undefined;
  }

  const layout: ComputedLayout = {};

  if (isFlexContainer || isGridContainer) {
    layout.display = isFlexContainer
      ? (display.includes('inline') ? 'inline-flex' : 'flex')
      : (display.includes('inline') ? 'inline-grid' : 'grid');
  }

  if (isFlexContainer) {
    const dir = el.styles['flex-direction'];
    if (dir && dir !== 'row') layout.direction = dir as any;
    const wrap = el.styles['flex-wrap'];
    if (wrap && wrap !== 'nowrap') layout.wrap = wrap as any;
    const justify = el.styles['justify-content'];
    if (justify && justify !== 'normal' && justify !== 'start' && justify !== 'flex-start') layout.justifyContent = justify;
    const align = el.styles['align-items'];
    if (align && align !== 'normal' && align !== 'stretch') layout.alignItems = align;
    const alignContent = el.styles['align-content'];
    if (alignContent && alignContent !== 'normal') layout.alignContent = alignContent;

    const gap = el.styles.gap;
    const rowGap = el.styles['row-gap'];
    const colGap = el.styles['column-gap'];
    if (gap && gap !== '0px' && gap !== 'normal') layout.gap = gap;
    else if ((rowGap && rowGap !== '0px' && rowGap !== 'normal') || (colGap && colGap !== '0px' && colGap !== 'normal')) {
      if (rowGap && rowGap !== '0px' && rowGap !== 'normal') layout.rowGap = rowGap;
      if (colGap && colGap !== '0px' && colGap !== 'normal') layout.columnGap = colGap;
    }
  }

  if (isGridContainer) {
    const cols = el.styles['grid-template-columns'];
    if (cols && cols !== 'none') layout.columns = cols;
    const rows = el.styles['grid-template-rows'];
    if (rows && rows !== 'none') layout.rows = rows;
    const autoFlow = el.styles['grid-auto-flow'];
    if (autoFlow && autoFlow !== 'row') layout.autoFlow = autoFlow;
    const justifyItems = el.styles['justify-items'];
    if (justifyItems && justifyItems !== 'legacy' && justifyItems !== 'normal') layout.justifyItems = justifyItems;
    const alignItems = el.styles['align-items'];
    if (alignItems && alignItems !== 'normal') layout.alignItems = alignItems;
    const justify = el.styles['justify-content'];
    if (justify && justify !== 'normal') layout.justifyContent = justify;

    const gap = el.styles.gap;
    if (gap && gap !== '0px' && gap !== 'normal') layout.gap = gap;
    else {
      const rowGap = el.styles['row-gap'];
      const colGap = el.styles['column-gap'];
      if (rowGap && rowGap !== '0px' && rowGap !== 'normal') layout.rowGap = rowGap;
      if (colGap && colGap !== '0px' && colGap !== 'normal') layout.columnGap = colGap;
    }
  }

  if (isFlexItem) {
    layout.parentLayout = 'flex';
    const alignSelf = el.styles['align-self'];
    if (alignSelf && alignSelf !== 'auto' && alignSelf !== 'normal') layout.alignSelf = alignSelf;
    const flexGrow = el.styles['flex-grow'];
    if (flexGrow && flexGrow !== '0') layout.flexGrow = flexGrow;
    const flexShrink = el.styles['flex-shrink'];
    if (flexShrink && flexShrink !== '1') layout.flexShrink = flexShrink;
    const flexBasis = el.styles['flex-basis'];
    if (flexBasis && flexBasis !== 'auto') layout.flexBasis = flexBasis;
    const order = el.styles.order;
    if (order && order !== '0') layout.order = order;
  }

  if (isGridItem) {
    layout.parentLayout = 'grid';
    const gridCol = el.styles['grid-column'];
    if (gridCol && gridCol !== 'auto' && gridCol !== 'auto / auto') layout.gridColumn = gridCol;
    const gridRow = el.styles['grid-row'];
    if (gridRow && gridRow !== 'auto' && gridRow !== 'auto / auto') layout.gridRow = gridRow;
    const alignSelf = el.styles['align-self'];
    if (alignSelf && alignSelf !== 'auto' && alignSelf !== 'normal') layout.alignSelf = alignSelf;
    const justifySelf = el.styles['justify-self'];
    if (justifySelf && justifySelf !== 'auto' && justifySelf !== 'normal') layout.justifySelf = justifySelf;
    const order = el.styles.order;
    if (order && order !== '0') layout.order = order;
  }

  return Object.keys(layout).length ? layout : undefined;
}
