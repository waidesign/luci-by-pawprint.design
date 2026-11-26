/** Names for elements in capture files: from tag and role, never from class names (often hashed). */

/** Implicit ARIA roles for common tags. */
const IMPLICIT_ROLES: Readonly<Record<string, string>> = {
  a: 'link', button: 'button', nav: 'navigation', main: 'main', header: 'banner', footer: 'contentinfo',
  aside: 'complementary', section: 'region', article: 'article', form: 'form', ul: 'list', ol: 'list',
  li: 'listitem', table: 'table', tr: 'row', td: 'cell', th: 'columnheader', h1: 'heading', h2: 'heading',
  h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', p: 'paragraph', img: 'img', input: 'textbox',
  select: 'combobox', textarea: 'textbox', dialog: 'dialog', hr: 'separator', figure: 'figure', label: 'label'
};

export function implicitRole(tag: string, attrs: { href?: boolean; type?: string } = {}): string | null {
  const t = tag.toLowerCase();
  if (t === 'a' && attrs.href === false) return null;
  if (t === 'input') {
    const type = (attrs.type ?? 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (['button', 'submit', 'reset'].includes(type)) return 'button';
    return 'textbox';
  }
  return IMPLICIT_ROLES[t] ?? null;
}

/** "h1 (heading)", "ul (list)", "button", "div". The role is shown when it adds something. */
export function elementName(tag: string, role: string | null): string {
  const t = tag.toLowerCase();
  if (!role || role === t) return t;
  return `${t} (${role})`;
}
