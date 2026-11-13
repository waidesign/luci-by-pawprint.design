/** Copy text: the clipboard API, or a selected textarea when the page does not allow it. */
export async function copyToClipboard(doc: Document, text: string): Promise<boolean> {
  try {
    await doc.defaultView!.navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('data-luci-ui', '');
    ta.style.cssText = 'position:fixed;left:-9999px';
    doc.body.appendChild(ta);
    ta.select();
    const ok = doc.execCommand('copy');
    ta.remove();
    return ok;
  }
}
