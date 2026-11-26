/**
 * Puts the dev toolbar into an app without the person editing code (user request, 2026-11-15):
 * find the app's root file, add a small loader between `luci:toolbar` markers, take it out again.
 *
 * The loader only runs where the app is opened on this machine (localhost), or in development, so
 * nothing changes for a deployed site and no package has to be installed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PRODUCT, stripBom } from '@luci-dev/format';

export const TOOLBAR_START = 'luci:toolbar';
export const TOOLBAR_END = '/luci:toolbar';
const NOTE = `dev only: ${PRODUCT.name}'s dev toolbar from \`${PRODUCT.command} serve\` on this machine; remove with \`${PRODUCT.command} toolbar remove\``;

/** How the loader is written in the file it goes into. */
export type LoaderKind = 'html' | 'astro' | 'jsx' | 'snippet';

export interface ToolbarTarget {
  /** Absolute path of the file. */
  file: string;
  /** Project-relative path, for messages. */
  rel: string;
  kind: LoaderKind;
  /** What the file is, in words ("Vite index.html", "Next.js root layout"). */
  what: string;
}

const scriptUrl = (port: number) => `http://127.0.0.1:${port}/toolbar.js`;

/** Exact prompt text copied by "Copy fix for my agent" when luci serve is off. */
export function agentFixPrompt(port: number): string {
  const cmd = port === 4545 ? 'luci serve' : `luci serve --port ${port}`;
  return `Luci's dev toolbar can't connect. In this project, start \`${cmd}\` and keep it running in the background. If \`luci\` isn't found, install it with \`npm install -g @luci-dev/cli\`. On Windows, if PowerShell blocks \`luci\`, use \`luci.cmd\`. Don't change any system setting without asking me. Then tell me when it's running.`;
}

/**
 * Self-contained inline loader script: loads toolbar.js from luci serve, and if it fails,
 * mounts a small shadow-root badge ("Luci isn't running") in the toolbar button's corner.
 * Uses \x3c instead of literal '<' so HTML <script> blocks never contain raw angle brackets.
 */
function inlineLoaderCode(port: number, checkHost: boolean): string {
  const url = scriptUrl(port);
  const fix = JSON.stringify(agentFixPrompt(port));
  const runCmd = JSON.stringify(port === 4545 ? 'luci serve' : `luci serve --port ${port}`);
  const guard = checkHost ? 'if (/^(localhost|127\\.0\\.0\\.1|\\[::1\\])$/.test(location.hostname)) ' : '';
  const body = [
    `var u='${url}',k='luci.offline.dismissed',b=0,d=0,a=0,h=null,t=0,rb=null,rt=0;`,
    `function pos(){try{var p=JSON.parse(localStorage.getItem('luci.ui')||'{}'),v=p.devPlace;if(v&&typeof v.x==='number'&&typeof v.y==='number')return(v.h==='left'?'left':'right')+':min('+v.x+'px,calc(100vw - 260px));'+(v.v==='top'?'top':'bottom')+':min('+v.y+'px,calc(100vh - 120px))';if(p.dock==='left')return'left:12px;bottom:12px'}catch(e){}return'right:12px;bottom:12px'}`,
    `function cp(s){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(s).then(function(){return true},function(){return fb(s)});return Promise.resolve(fb(s))}`,
    `function fb(s){var e=document.createElement('textarea');e.value=s;e.setAttribute('readonly','');e.style.cssText='position:fixed;top:-9999px;opacity:0';(document.body||document.documentElement).appendChild(e);e.select();var ok=false;try{ok=document.execCommand('copy')}catch(x){}e.remove();return Boolean(ok)}`,
    `function rm(){if(h){h.remove();h=null;rb=null}}`,
    `function off(){if(typeof window!=='undefined'){window.removeEventListener('focus',onVis);document.removeEventListener('visibilitychange',onVis)}}`,
    `function onVis(){if(d||b||a)return;if(document.visibilityState&&document.visibilityState!=='visible')return;a=1;ld()}`,
    `function show(){if(d||h)return;try{if(sessionStorage.getItem(k)==='1')return}catch(e){}if(!document.documentElement)return;`,
    `h=document.createElement('luci-offline');h.setAttribute('data-luci-ui','');var r=h.attachShadow({mode:'open'});`,
    `var st=document.createElement('style');st.textContent=`,
    `':host{all:initial}*,*::before,*::after{box-sizing:border-box}'+`,
    `'.card{position:fixed;'+pos()+';z-index:2147483647;display:flex;flex-direction:column;gap:8px;max-width:calc(100vw - 24px);padding:12px 14px;border-radius:16px;background:#2B2B2B;color:#F5EFEA;font:400 13px/18px Inter,system-ui,-apple-system,sans-serif;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),inset 0 0 0 1px rgba(255,255,255,.05),0 1px 2px rgba(0,0,0,.24),0 8px 24px rgba(0,0,0,.28)}'+`,
    `'.top{display:flex;align-items:center;justify-content:space-between;gap:12px}'+`,
    `'.title{display:inline-flex;align-items:center;gap:8px;font-weight:600;color:#F5EFEA}'+`,
    `'.dot{width:8px;height:8px;border-radius:50%;background:#E6D17A;flex:none}'+`,
    `'.sub{margin:0;color:#C2BCB8;font-size:12px;line-height:16px}'+`,
    `'.actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px}'+`,
    `'button{appearance:none;border:0;margin:0;font:600 12px/16px Inter,system-ui,-apple-system,sans-serif;cursor:pointer;border-radius:8px;padding:6px 10px;transition:background-color .15s ease-out}'+`,
    `'button:focus-visible{outline:2px solid #F5EFEA;outline-offset:2px}'+`,
    `'.copy{background:#EC862B;color:#2B2B2B}.copy:hover{background:#D86D1D}'+`,
    `'.retry{background:#3B3A39;color:#F5EFEA;font-weight:500}.retry:hover{background:#4F4D4B}'+`,
    `'.close{padding:2px 6px;border-radius:9999px;background:transparent;color:#C2BCB8;font:600 15px/1 Inter,system-ui,sans-serif}.close:hover{background:#3B3A39;color:#F5EFEA}';`,
    `var box=document.createElement('div');box.className='card';box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.setAttribute('data-part','offline-badge');`,
    `var top=document.createElement('div');top.className='top';`,
    `var ttl=document.createElement('span');ttl.className='title';var dot=document.createElement('i');dot.className='dot';dot.setAttribute('aria-hidden','true');var tx=document.createElement('span');tx.textContent="Luci isn't running";ttl.append(dot,tx);`,
    `var x=document.createElement('button');x.type='button';x.className='close';x.setAttribute('aria-label','Close Luci status');x.setAttribute('data-action','close');x.textContent='\\u00d7';`,
    `x.onclick=function(){try{sessionStorage.setItem(k,'1')}catch(e){}rm();off()};top.append(ttl,x);`,
    `var sub=document.createElement('p');sub.className='sub';sub.textContent='Start luci serve in this project.';`,
    `var act=document.createElement('div');act.className='actions';`,
    `var cb=document.createElement('button');cb.type='button';cb.className='copy';cb.setAttribute('data-action','copy-fix');cb.textContent='Copy fix for my agent';`,
    `cb.onclick=function(){cp(${fix}).then(function(ok){clearTimeout(t);if(ok){cb.textContent='Copied';t=setTimeout(function(){cb.textContent='Copy fix for my agent'},2000)}else{cb.textContent="Couldn't copy";sub.textContent='Run in project: '+${runCmd};t=setTimeout(function(){cb.textContent='Copy fix for my agent'},3000)}})};`,
    `rb=document.createElement('button');rb.type='button';rb.className='retry';rb.setAttribute('data-action','retry');rb.textContent='Retry';`,
    `rb.onclick=function(){ld()};act.append(cb,rb);box.append(top,sub,act);r.append(st,box);document.documentElement.appendChild(h)}`,
    `function ld(){if(b||d)return;b=1;if(rb){rb.disabled=true;rb.textContent='Checking\\u2026'}var s=Object.assign(document.createElement('script'),{src:u,onload:function(){b=0;d=1;rm();off()},onerror:function(){b=0;if(s.remove)s.remove();show();if(rb){rb.disabled=false;rb.textContent='Still not running';clearTimeout(rt);rt=setTimeout(function(){if(rb)rb.textContent='Retry'},2000)}}});document.head.appendChild(s)}`,
    `if(typeof window!=='undefined'&&window.addEventListener){window.addEventListener('focus',onVis);document.addEventListener('visibilitychange',onVis);window.addEventListener('blur',function(){a=0});document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')a=0})}`,
    `ld()`
  ].join('');
  return `${guard}(function(){${body}})();`;
}

/** The lines added to the file (without indentation). */
export function loaderLines(kind: LoaderKind, port: number): string[] {
  if (kind === 'jsx') {
    const code = inlineLoaderCode(port, true);
    return [
      `{/* ${TOOLBAR_START} (${NOTE}) */}`,
      `{process.env.NODE_ENV === 'development' && <script dangerouslySetInnerHTML={{ __html: ${JSON.stringify(code)} }} />}`,
      `{/* ${TOOLBAR_END} */}`
    ];
  }
  const load = inlineLoaderCode(port, true);
  return [
    `<!-- ${TOOLBAR_START} (${NOTE}) -->`,
    `<script${kind === 'astro' ? ' is:inline' : ''}>${load}</script>`,
    `<!-- ${TOOLBAR_END} -->`
  ];
}

const exists = (f: string) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const dirExists = (d: string) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } };
const read = (f: string) => stripBom(fs.readFileSync(f, 'utf8'));
const first = (dir: string, names: readonly string[]) => names.map(n => path.join(dir, n)).find(exists);
const SCRIPT_EXT = ['tsx', 'jsx', 'js', 'ts'];

function storybookTarget(projectDir: string): ToolbarTarget | null {
  const sbDir = path.join(projectDir, '.storybook');
  if (!dirExists(sbDir)) return null;
  const bodyFile = path.join(sbDir, 'preview-body.html');
  const headFile = path.join(sbDir, 'preview-head.html');
  // Reuse preview-head.html if the user already installed Luci there; otherwise prefer preview-body.html
  const file = !exists(bodyFile) && exists(headFile) && INSTALLED.test(read(headFile)) ? headFile : bodyFile;
  const name = path.basename(file);
  return { file, rel: `.storybook/${name}`, kind: 'snippet', what: `Storybook ${name}` };
}

/**
 * Where the toolbar goes, most specific framework first: Next.js (app or pages router), SvelteKit,
 * Astro, then an index.html (Vite, Create React App, Angular, plain sites), then Storybook
 * (.storybook/preview-body.html). Pass `{ storybook: true }` to target Storybook directly.
 */
export function findToolbarTarget(projectDir: string, options: { storybook?: boolean } = {}): ToolbarTarget | null {
  if (options.storybook) return storybookTarget(projectDir);
  const t = (file: string | undefined, kind: LoaderKind, what: string): ToolbarTarget | null =>
    (file && /<\/body>/i.test(read(file)) ? { file, rel: path.relative(projectDir, file).replace(/\\/g, '/'), kind, what } : null);
  const candidates: (() => ToolbarTarget | null)[] = [
    () => t(first(projectDir, ['app', 'src/app'].flatMap(d => SCRIPT_EXT.map(e => `${d}/layout.${e}`))), 'jsx', 'Next.js root layout'),
    () => t(first(projectDir, ['pages', 'src/pages'].flatMap(d => SCRIPT_EXT.map(e => `${d}/_document.${e}`))), 'jsx', 'Next.js _document'),
    () => t(first(projectDir, ['src/app.html']), 'html', 'SvelteKit app.html'),
    () => {
      const dir = path.join(projectDir, 'src', 'layouts');
      let layouts: string[] = [];
      try { layouts = fs.readdirSync(dir).filter(f => f.endsWith('.astro')); } catch { /* no layouts */ }
      const pick = layouts.find(f => /^(Base)?Layout\.astro$/i.test(f)) ?? (layouts.length === 1 ? layouts[0] : undefined);
      return t(pick ? path.join(dir, pick) : undefined, 'astro', 'Astro layout');
    },
    () => t(first(projectDir, ['index.html']), 'html', 'index.html'),
    () => t(first(projectDir, ['src/index.html']), 'html', 'index.html'),
    () => t(first(projectDir, ['public/index.html']), 'html', 'index.html'),
    () => storybookTarget(projectDir)
  ];
  for (const c of candidates) {
    const found = c();
    if (found) return found;
  }
  return null;
}

/** The file that has the toolbar (between its markers, or any line that loads toolbar.js), if any. */
export function toolbarInstalledIn(projectDir: string, options: { storybook?: boolean } = {}): ToolbarTarget | null {
  const target = findToolbarTarget(projectDir, options);
  if (target && exists(target.file) && INSTALLED.test(read(target.file))) return target;
  if (!options.storybook) {
    const sb = storybookTarget(projectDir);
    if (sb && exists(sb.file) && INSTALLED.test(read(sb.file))) return sb;
  }
  return null;
}
/** The markers, or a line someone added by hand from `luci serve`'s instructions. */
const INSTALLED = /luci:toolbar|127\.0\.0\.1:\d+\/toolbar\.js/;

const MARKED_BLOCK_ONE = /^([ \t]*)(?:<!--|\{\/\*) luci:toolbar\b[\s\S]*?\/luci:toolbar (?:-->|\*\/\})[ \t]*/m;
const MARKED_BLOCK_ALL = /^[ \t]*(?:<!--|\{\/\*) luci:toolbar\b[\s\S]*?\/luci:toolbar (?:-->|\*\/\})[ \t]*\r?\n?/gm;

export type AddResult =
  | { status: 'added' | 'updated' | 'already'; target: ToolbarTarget; lines: string[] }
  | { status: 'not-found' };

/** Add the loader before </body> of the app's root file (or into .storybook/preview-body.html), or replace an older luci:toolbar block in place. */
export function addToolbar(projectDir: string, options: { port?: number; dryRun?: boolean; storybook?: boolean } = {}): AddResult {
  const target = findToolbarTarget(projectDir, { storybook: options.storybook });
  if (!target) return { status: 'not-found' };
  const port = options.port ?? 4545;
  const lines = loaderLines(target.kind, port);
  const text = exists(target.file) ? read(target.file) : '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';

  const existingMatch = MARKED_BLOCK_ONE.exec(text);
  if (existingMatch) {
    const indent = existingMatch[1] ?? '';
    const block = lines.map(l => `${indent}${l}`).join(eol);
    let replacedFirst = false;
    const updated = text.replace(MARKED_BLOCK_ALL, (match) => {
      if (!replacedFirst) {
        replacedFirst = true;
        const trailingNewline = /\r?\n$/.exec(match)?.[0] ?? '';
        return `${block}${trailingNewline}`;
      }
      return '';
    });
    if (updated === text) return { status: 'already', target, lines };
    if (!options.dryRun) fs.writeFileSync(target.file, updated, 'utf8');
    return { status: 'updated', target, lines };
  }

  // Handle manual / comment-less <script src="http://127.0.0.1:<port>/toolbar.js"></script>
  const MANUAL_SCRIPT_ONE = /^([ \t]*)<script\b[^>]*\b127\.0\.0\.1:\d+\/toolbar\.js[^>]*>(?:<\/script>)?[ \t]*/m;
  const MANUAL_SCRIPT_ALL = /^[ \t]*<script\b[^>]*\b127\.0\.0\.1:\d+\/toolbar\.js[^>]*>(?:<\/script>)?[ \t]*\r?\n?/gm;
  const manualMatch = MANUAL_SCRIPT_ONE.exec(text);
  if (manualMatch) {
    const indent = manualMatch[1] ?? '';
    const block = lines.map(l => `${indent}${l}`).join(eol);
    let replacedFirst = false;
    const updated = text.replace(MANUAL_SCRIPT_ALL, (match) => {
      if (!replacedFirst) {
        replacedFirst = true;
        const trailingNewline = /\r?\n$/.exec(match)?.[0] ?? '';
        return `${block}${trailingNewline}`;
      }
      return '';
    });
    if (updated === text) return { status: 'already', target, lines };
    if (!options.dryRun) fs.writeFileSync(target.file, updated, 'utf8');
    return { status: 'updated', target, lines };
  }

  if (INSTALLED.test(text)) return { status: 'already', target, lines };
  if (target.kind === 'snippet') {
    const block = lines.join(eol);
    const trimmed = text.trimEnd();
    const updated = trimmed ? `${trimmed}${eol}${block}${eol}` : `${block}${eol}`;
    if (!options.dryRun) fs.writeFileSync(target.file, updated, 'utf8');
    return { status: 'added', target, lines };
  }
  // Before the last </body>, indented one step deeper than it
  const at = text.search(/<\/body>(?![\s\S]*<\/body>)/i);
  const lineStart = text.lastIndexOf('\n', at - 1) + 1;
  const indent = /^[ \t]*/.exec(text.slice(lineStart, at))![0];
  const inner = `${indent}${indent.includes('\t') ? '\t' : '  '}`;
  const onOwnLine = text.slice(lineStart, at).trim() === '';
  const block = lines.map(l => `${inner}${l}`).join(eol);
  const updated = onOwnLine
    ? `${text.slice(0, lineStart)}${block}${eol}${text.slice(lineStart)}`
    : `${text.slice(0, at)}${eol}${block}${eol}${indent}${text.slice(at)}`;
  if (!options.dryRun) fs.writeFileSync(target.file, updated, 'utf8');
  return { status: 'added', target, lines };
}

/** Take the loader out again: every block between the markers, in the file Luci would use. */
export function removeToolbar(projectDir: string, options: { dryRun?: boolean; storybook?: boolean } = {}): { status: 'removed' | 'none'; target?: ToolbarTarget } {
  const target = findToolbarTarget(projectDir, { storybook: options.storybook });
  if (!target || !exists(target.file)) return { status: 'none', ...(target ? { target } : {}) };
  const text = read(target.file);
  const block = /^[ \t]*(?:<!--|\{\/\*) luci:toolbar\b[\s\S]*?\/luci:toolbar (?:-->|\*\/\})[ \t]*\r?\n?/gm;
  const manualScript = /^[ \t]*<script\b[^>]*\b127\.0\.0\.1:\d+\/toolbar\.js[^>]*>(?:<\/script>)?[ \t]*\r?\n?/gm;
  let updated = text.replace(block, '');
  updated = updated.replace(manualScript, '');
  if (updated === text) return { status: 'none', target };
  if (!options.dryRun) fs.writeFileSync(target.file, updated, 'utf8');
  return { status: 'removed', target };
}

/** What to do by hand when no root file is found. */
export function manualToolbarHelp(port = 4545): string[] {
  return [
    `Add this line to your app's root HTML or layout, before </body>:`,
    `  <script src="${scriptUrl(port)}"></script>`,
    `Or ask your agent: "Add ${PRODUCT.name}'s dev toolbar to this app (\`${PRODUCT.command} toolbar\`)."`
  ];
}
