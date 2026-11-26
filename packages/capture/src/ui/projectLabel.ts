/**
 * What the settings card says about the connected project. The page Luci runs on can read the
 * toolbar's text, so it never shows the project's full path on disk (it usually holds the person's
 * user name): only the folder's name and the local address of `luci serve`.
 */
export function projectLabel(project: { project?: string; name?: string; url?: string }): string {
  const folder = project.name || (project.project ?? '').split(/[\\/]+/).filter(Boolean).pop() || 'project';
  let address = '';
  try { address = project.url ? new URL(project.url).host : ''; } catch { /* not a URL */ }
  return address ? `${folder} · ${address}` : folder;
}
