/**
 * Computed layout tree (v0.4.3): build, format and parse hierarchical layout trees
 * with parent/child flex and grid relationships for component and section captures.
 */
import type { ComputedLayout, LayoutTreeNode } from './schema.js';

export interface LayoutNodeInput {
  part: string;
  element: string;
  depth?: number;
  parent?: string;
  layout?: ComputedLayout;
}

/** Build a nested LayoutTreeNode hierarchy from a flat list of anatomy parts or structure nodes. */
export function buildLayoutTree(nodes: readonly LayoutNodeInput[]): LayoutTreeNode | undefined {
  if (!nodes.length) return undefined;

  const rootNode = nodes[0]!;
  const root: LayoutTreeNode = {
    part: rootNode.part,
    element: rootNode.element,
    depth: 0,
    ...(rootNode.layout ? { layout: rootNode.layout } : {}),
    children: []
  };

  const stack: LayoutTreeNode[] = [root];

  for (let i = 1; i < nodes.length; i++) {
    const item = nodes[i]!;
    const depth = item.depth ?? (item.parent ? (stack.find(s => s.part === item.parent)?.depth ?? 0) + 1 : 1);
    const node: LayoutTreeNode = {
      part: item.part,
      element: item.element,
      depth,
      ...(item.parent ? { parent: item.parent } : {}),
      ...(item.layout ? { layout: item.layout } : {}),
      children: []
    };

    let parentNode: LayoutTreeNode | undefined;
    if (item.parent) {
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s]!.part === item.parent) {
          parentNode = stack[s];
          break;
        }
      }
    }

    if (!parentNode) {
      while (stack.length > 1 && stack[stack.length - 1]!.depth >= depth) {
        stack.pop();
      }
      parentNode = stack[stack.length - 1]!;
    }

    if (!node.parent && parentNode) {
      node.parent = parentNode.part;
    }

    parentNode.children.push(node);
    stack.push(node);
  }

  return root;
}

/** Format a ComputedLayout object into a readable inline description. */
export function formatLayoutDescription(layout?: ComputedLayout): string {
  if (!layout) return '';
  const parts: string[] = [];

  if (layout.display) {
    const mode = layout.display;
    const details: string[] = [];
    if (layout.direction && layout.direction !== 'row') details.push(layout.direction);
    if (layout.wrap && layout.wrap !== 'nowrap') details.push(layout.wrap);
    if (layout.columns) details.push(`cols: ${layout.columns}`);
    if (layout.rows) details.push(`rows: ${layout.rows}`);
    if (layout.gap) details.push(`gap: ${layout.gap}`);
    else if (layout.rowGap || layout.columnGap) {
      if (layout.rowGap) details.push(`row-gap: ${layout.rowGap}`);
      if (layout.columnGap) details.push(`col-gap: ${layout.columnGap}`);
    }
    if (layout.justifyContent) details.push(`justify: ${layout.justifyContent}`);
    if (layout.alignItems) details.push(`align: ${layout.alignItems}`);
    if (layout.alignContent) details.push(`align-content: ${layout.alignContent}`);
    if (layout.autoFlow && layout.autoFlow !== 'row') details.push(`flow: ${layout.autoFlow}`);
    parts.push(`${mode}${details.length ? ` (${details.join(', ')})` : ''}`);
  }

  if (layout.parentLayout) {
    const itemDetails: string[] = [];
    if (layout.flex) itemDetails.push(`flex: ${layout.flex}`);
    else {
      if (layout.flexGrow && layout.flexGrow !== '0') itemDetails.push(`grow: ${layout.flexGrow}`);
      if (layout.flexShrink && layout.flexShrink !== '1') itemDetails.push(`shrink: ${layout.flexShrink}`);
      if (layout.flexBasis && layout.flexBasis !== 'auto') itemDetails.push(`basis: ${layout.flexBasis}`);
    }
    if (layout.gridColumn) itemDetails.push(`col: ${layout.gridColumn}`);
    if (layout.gridRow) itemDetails.push(`row: ${layout.gridRow}`);
    if (layout.alignSelf && layout.alignSelf !== 'auto') itemDetails.push(`align-self: ${layout.alignSelf}`);
    if (layout.justifySelf && layout.justifySelf !== 'auto') itemDetails.push(`justify-self: ${layout.justifySelf}`);
    if (layout.order && layout.order !== '0') itemDetails.push(`order: ${layout.order}`);
    if (itemDetails.length) parts.push(itemDetails.join(', '));
  }

  return parts.join('; ');
}

/** Format a LayoutTreeNode hierarchy into markdown bullet tree lines. */
export function formatLayoutTree(tree: LayoutTreeNode, indent = ''): string {
  const desc = formatLayoutDescription(tree.layout);
  const line = `${indent}- **${tree.part}** (${tree.element})${desc ? ` — ${desc}` : ''}`;
  const lines = [line];

  for (const child of tree.children) {
    lines.push(formatLayoutTree(child, `${indent}  `));
  }

  return lines.join('\n');
}

/** Flatten a LayoutTreeNode hierarchy back into an array of nodes with depth and parent pointers. */
export function flattenLayoutTree(tree: LayoutTreeNode): LayoutTreeNode[] {
  const out: LayoutTreeNode[] = [];
  const walk = (node: LayoutTreeNode) => {
    out.push(node);
    for (const child of node.children) {
      walk(child);
    }
  };
  walk(tree);
  return out;
}
