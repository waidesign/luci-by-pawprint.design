/**
 * Luci, inline. One component for every mascot use (brand/CLAUDE-CODE-GUIDE.md section 5): the kit's
 * layered SVGs are inlined unchanged so luci-animations.css can move their named parts. Only the
 * root's size, accessibility attributes and (per instance) clip-path ids are rewritten.
 */
import { FACE_SVG, POSE_SVG } from './art.js';

/** brand/BRAND.md section 5. "hello" is the sitting pose with the slow-blink greeting. */
export type MascotPose =
  | 'sit' | 'hello' | 'head' | 'peek' | 'measure'
  | 'box' | 'sleep' | 'content' | 'annoyed' | 'turned' | 'slowblink';
export type MascotFace = keyof typeof FACE_SVG;

export interface MascotArtOptions {
  /** false renders him still. Under prefers-reduced-motion the kit's CSS stops every loop anyway. */
  animated?: boolean;
  /** Meaningful use: role="img" with this label. Without it the art is decorative (aria-hidden). */
  label?: string;
}

let instances = 0;

/** Give every id in the SVG (and every reference to one) a prefix unique to this instance. */
function uniqueIds(svg: string): string {
  const prefix = `luci${++instances}-`;
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]!);
  let out = svg;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`(\\sid=")${esc}(")`, 'g'), `$1${prefix}${id}$2`)
      .replace(new RegExp(`url\\(#${esc}\\)`, 'g'), `url(#${prefix}${id})`)
      .replace(new RegExp(`(href=")#${esc}(")`, 'g'), `$1#${prefix}${id}$2`);
  }
  return out;
}

/** Rewrite the root element: classes, no fixed pixel size, accessibility. */
function rootAttributes(svg: string, extraClass: string, opts: MascotArtOptions): string {
  return svg.replace(/^<svg\b([^>]*)>/, (_m, attrs: string) => {
    let a = attrs
      .replace(/\s(width|height)="[^"]*"/g, '')
      .replace(/\srole="[^"]*"/, '')
      .replace(/\saria-label="[^"]*"/, '')
      .replace(/\sclass="([^"]*)"/, (_c, cls: string) => ` class="${cls}${extraClass}"`);
    if (!/\sclass="/.test(a)) a += ` class="luci${extraClass}"`;
    a += opts.label ? ` role="img" aria-label="${opts.label.replace(/"/g, '&quot;')}"` : ' aria-hidden="true" focusable="false"';
    return `<svg${a}>`;
  });
}

/** The pose as an SVG string, ready to inline. */
export function mascotSvg(pose: MascotPose, opts: MascotArtOptions = {}): string {
  const file = pose === 'hello' ? POSE_SVG.sit : POSE_SVG[pose];
  const extra = `${pose === 'hello' ? ' luci-hello' : ''}${opts.animated === false ? ' luci-still' : ''}`;
  return uniqueIds(rootAttributes(file, extra, opts));
}

/** A small face (48 px) for toasts and inline messages, as an SVG string. */
export function faceSvg(face: MascotFace, opts: MascotArtOptions = {}): string {
  return uniqueIds(rootAttributes(FACE_SVG[face], opts.animated === false ? ' luci-still' : '', opts));
}

export interface MascotProps extends MascotArtOptions {
  pose: MascotPose;
  /** Width in px (the kit's minimum for full-body poses is 96; avatars may be smaller). */
  size?: number;
  class?: string;
}

export function Mascot(props: MascotProps) {
  const { pose, size = 96, animated, label } = props;
  const html = mascotSvg(pose, { ...(animated === undefined ? {} : { animated }), ...(label ? { label } : {}) });
  return <span class={`mascot${props.class ? ` ${props.class}` : ''}`} data-pose={pose} style={{ width: `${size}px` }} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Face(props: { face: MascotFace; size?: number; label?: string; animated?: boolean }) {
  const { face, size = 48, label, animated } = props;
  const html = faceSvg(face, { ...(animated === undefined ? {} : { animated }), ...(label ? { label } : {}) });
  return <span class="mascot face" data-face={face} style={{ width: `${size}px` }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Luci's head in a Ginger 500 circle: the menu button and avatar (BRAND.md section 8). */
export function LuciAvatar(props: { size?: number; animated?: boolean }) {
  const size = props.size ?? 32;
  return (
    <span class="luci-avatar" style={{ width: `${size}px`, height: `${size}px` }}>
      <Mascot pose="head" size={Math.round(size * 0.78)} {...(props.animated === undefined ? {} : { animated: props.animated })} />
    </span>
  );
}
