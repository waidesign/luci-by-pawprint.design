import { describe, expect, it } from 'vitest';
import {
  buildLayoutTree,
  formatLayoutDescription,
  formatLayoutTree,
  formatCapture,
  parseCapture,
  type ComponentCapture,
  type ComputedLayout,
  type LayoutTreeNode
} from '../src/capture/index.js';

describe('Computed Layout Tree (v0.4.3)', () => {
  it('formats layout description for flex and grid containers and items', () => {
    const flexContainer: ComputedLayout = {
      display: 'flex',
      direction: 'column',
      wrap: 'wrap',
      gap: '16px',
      justifyContent: 'space-between',
      alignItems: 'center'
    };
    const desc = formatLayoutDescription(flexContainer);
    expect(desc).toContain('flex');
    expect(desc).toContain('column');
    expect(desc).toContain('wrap');
    expect(desc).toContain('gap: 16px');
    expect(desc).toContain('justify: space-between');
    expect(desc).toContain('align: center');

    const flexItem: ComputedLayout = {
      parentLayout: 'flex',
      flexGrow: '1',
      alignSelf: 'flex-end',
      order: '2'
    };
    const itemDesc = formatLayoutDescription(flexItem);
    expect(itemDesc).toContain('grow: 1');
    expect(itemDesc).toContain('align-self: flex-end');
    expect(itemDesc).toContain('order: 2');

    const gridContainer: ComputedLayout = {
      display: 'grid',
      columns: 'repeat(3, 1fr)',
      gap: '24px',
      justifyItems: 'center'
    };
    const gridDesc = formatLayoutDescription(gridContainer);
    expect(gridDesc).toContain('grid');
    expect(gridDesc).toContain('cols: repeat(3, 1fr)');
    expect(gridDesc).toContain('gap: 24px');

    const gridItem: ComputedLayout = {
      parentLayout: 'grid',
      gridColumn: '1 / span 2',
      gridRow: '2',
      justifySelf: 'stretch'
    };
    const gridItemDesc = formatLayoutDescription(gridItem);
    expect(gridItemDesc).toContain('col: 1 / span 2');
    expect(gridItemDesc).toContain('row: 2');
    expect(gridItemDesc).toContain('justify-self: stretch');
  });

  it('builds a hierarchical LayoutTreeNode tree from flat parts with parent pointers and depths', () => {
    const parts = [
      {
        part: 'container',
        element: 'article',
        depth: 0,
        layout: { display: 'flex', direction: 'column' as const, gap: '16px' }
      },
      {
        part: 'header',
        element: 'div',
        depth: 1,
        parent: 'container',
        layout: { display: 'flex', direction: 'row' as const, justifyContent: 'space-between', parentLayout: 'flex' as const }
      },
      {
        part: 'title',
        element: 'h3',
        depth: 2,
        parent: 'header',
        layout: { parentLayout: 'flex' as const, flexGrow: '1' }
      },
      {
        part: 'badge',
        element: 'span',
        depth: 2,
        parent: 'header',
        layout: { parentLayout: 'flex' as const, alignSelf: 'center' }
      },
      {
        part: 'body',
        element: 'div',
        depth: 1,
        parent: 'container',
        layout: { display: 'flex', direction: 'column' as const, gap: '8px', parentLayout: 'flex' as const }
      },
      {
        part: 'description',
        element: 'p',
        depth: 2,
        parent: 'body'
      }
    ];

    const tree = buildLayoutTree(parts);
    expect(tree).toBeDefined();
    expect(tree!.part).toBe('container');
    expect(tree!.children).toHaveLength(2); // header and body

    const header = tree!.children[0]!;
    expect(header.part).toBe('header');
    expect(header.children).toHaveLength(2); // title and badge
    expect(header.children[0]!.part).toBe('title');
    expect(header.children[1]!.part).toBe('badge');

    const body = tree!.children[1]!;
    expect(body.part).toBe('body');
    expect(body.children).toHaveLength(1); // description
    expect(body.children[0]!.part).toBe('description');

    const formatted = formatLayoutTree(tree!);
    expect(formatted).toContain('- **container** (article) — flex (column, gap: 16px)');
    expect(formatted).toContain('  - **header** (div) — flex (justify: space-between)');
    expect(formatted).toContain('    - **title** (h3) — grow: 1');
    expect(formatted).toContain('    - **badge** (span) — align-self: center');
    expect(formatted).toContain('  - **body** (div) — flex (column, gap: 8px)');
    expect(formatted).toContain('    - **description** (p)');
  });

  it('formats ComponentCapture with ## Layout Tree when layoutTree setting is enabled', () => {
    const tree: LayoutTreeNode = {
      part: 'container',
      element: 'article',
      depth: 0,
      layout: { display: 'flex', direction: 'column', gap: '16px' },
      children: [
        {
          part: 'label',
          element: 'span',
          depth: 1,
          parent: 'container',
          layout: { parentLayout: 'flex', alignSelf: 'center' },
          children: []
        }
      ]
    };

    const comp: ComponentCapture = {
      meta: {
        name: 'test-card',
        scope: 'component',
        type: 'card',
        source: 'http://localhost:3000/',
        captured: '2026-11-15',
        method: 'measured',
        selector: '#card'
      },
      tokens: [],
      anatomy: [
        {
          part: 'container',
          element: 'article',
          depth: 0,
          layout: tree.layout,
          styles: [{ property: 'display', value: { computed: 'flex' } }]
        },
        {
          part: 'label',
          element: 'span',
          parent: 'container',
          depth: 1,
          layout: tree.children[0]!.layout,
          styles: [{ property: 'color', value: { computed: '#161616' } }]
        }
      ],
      layoutTree: tree,
      states: [],
      motion: []
    };

    // Standard output (layoutTree: false) does not include ## Layout Tree
    const normal = formatCapture(comp, { layoutTree: false });
    expect(normal).not.toContain('## Layout Tree');
    expect(normal).toContain('- container — article: display flex');
    expect(normal).toContain('- label — span: color #161616');

    // Enabled output (layoutTree: true) includes ## Layout Tree and indented anatomy
    const withTree = formatCapture(comp, { layoutTree: true });
    expect(withTree).toContain('## Layout Tree');
    expect(withTree).toContain('- **container** (article) — flex (column, gap: 16px)');
    expect(withTree).toContain('  - **label** (span) — align-self: center');
    expect(withTree).toContain('- container — article: display flex');
    expect(withTree).toContain('  - label — span: color #161616');

    // Both files parse cleanly
    const parseNormal = parseCapture(normal);
    expect(parseNormal.ok).toBe(true);

    const parseWithTree = parseCapture(withTree);
    expect(parseWithTree.ok).toBe(true);
  });
});
