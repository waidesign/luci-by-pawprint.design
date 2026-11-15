/** Shared components (brand/DESIGN.md section 6). */
import type { ComponentChildren, JSX } from 'preact';
import { Icon, type IconSize } from './icon.js';
import { ICON_SVG, IconChevron, IconError, IconInfo, IconSuccess, IconWarning, type LucideIcon } from './icons.js';
import { LUCI_REPO_URL, LUCI_VERSION } from './about.js';
import { COPY } from './copy.js';
import { Mascot, type MascotPose } from './mascot/mascot.js';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'size' | 'icon' | 'label' | 'type'> & {
  variant?: ButtonVariant;
  /** Default: the surface's size (sm on Luci's compact panels, md elsewhere). */
  size?: ButtonSize;
  icon?: LucideIcon;
  /**
   * Icon-only: the label becomes the accessible name and the tooltip, never shown as text. `tip`
   * adds to the tooltip (a shortcut, for example).
   */
  iconOnly?: boolean;
  label?: string;
  tip?: string;
  tipAbove?: boolean;
  /** Alignment: 'left' anchors tooltip left edge to button (expands rightward); 'right' anchors right edge; default centered. */
  tipAlign?: 'left' | 'right' | 'center';
  /** Working: aria-busy, and a click does nothing until it is done. */
  loading?: boolean;
  /** Its single-key shortcut ("C"): shown in the tooltip and as aria-keyshortcuts (the surface runs it with useShortcuts). */
  shortcut?: string;
  /** A small count on an icon-only button (notes, planned changes). */
  badge?: number | string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  class?: string;
  children?: ComponentChildren;
};

/**
 * A button: one of the kit's variants and sizes, with an optional icon. Icon-only buttons always
 * carry an aria-label and a tooltip (DESIGN.md section 7).
 */
export function Button(props: ButtonProps) {
  const { variant = 'ghost', size, icon, iconOnly, label, tip, tipAbove, tipAlign, loading, shortcut, badge, class: extra, children, type = 'button', onClick, ...rest } = props;
  const iconSize: IconSize = size === 'lg' ? 'toolbar' : size === 'md' ? 'content' : 'compact';
  const cls = [
    `btn-${variant}`,
    size ? `btn-${size}` : '',
    iconOnly ? 'btn-icon' : icon ? 'btn-with-ico' : '',
    extra ?? ''
  ].filter(Boolean).join(' ');
  const name = label ?? (typeof children === 'string' ? children : undefined);
  const tipText = iconOnly ? [name, tip, shortcut].filter(Boolean).join('  ') : [tip, shortcut].filter(Boolean).join('  ') || undefined;
  return (
    <button
      type={type}
      class={cls}
      {...(iconOnly && name ? { 'aria-label': name } : {})}
      {...(shortcut ? { 'aria-keyshortcuts': shortcut } : {})}
      {...(tipText ? { 'data-tip': tipText } : {})}
      {...(tipText && tipAbove ? { 'data-tip-pos': 'above' } : {})}
      {...(tipText && tipAlign && tipAlign !== 'center' ? { 'data-tip-align': tipAlign } : {})}
      {...(loading ? { 'aria-busy': 'true' } : {})}
      onClick={loading ? undefined : onClick}
      {...rest}
    >
      {icon && <Icon icon={icon} size={iconSize} />}
      {!iconOnly && (children ?? label)}
      {badge !== undefined && badge !== '' && badge !== 0 && <span class="btn-badge" aria-hidden="true">{badge}</span>}
    </button>
  );
}

/**
 * GitHub's mark and Luci's version ("v0.3.0"), top right in every menu. A link to the repository once
 * it is public (LUCI_REPO_URL); until then the same pill, saying the link is coming.
 */
export function RepoButton() {
  const inner = (
    <>
      <span class="gh-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_SVG.github }} />
      <span class="repo-version">v{LUCI_VERSION}</span>
      <span class="repo-beta">Beta</span>
    </>
  );
  return LUCI_REPO_URL
    ? <a class="repo-btn" data-part="repo" href={LUCI_REPO_URL} target="_blank" rel="noopener noreferrer"
      aria-label={`${COPY.repo.link}, version ${LUCI_VERSION} (Beta)`} data-tip={COPY.repo.link}>{inner}</a>
    : <span class="repo-btn" data-part="repo" role="img" aria-label={`Luci version ${LUCI_VERSION} (Beta). ${COPY.repo.soon}`} data-tip={COPY.repo.soon}>{inner}</span>;
}

export type SelectProps = Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, 'class'> & { class?: string; children?: ComponentChildren };

/** A select with the kit's chevron (the approved Lucide icon), always 12 px from its edge. */
export function Select(props: SelectProps) {
  const { class: extra, children, ...rest } = props;
  return (
    <span class={`select${extra ? ` ${extra}` : ''}`}>
      <select {...rest}>{children}</select>
      <Icon icon={IconChevron} size="compact" />
    </span>
  );
}

export type Status = 'success' | 'warning' | 'danger' | 'info';

const STATUS_ICON: Record<Status, LucideIcon> = { success: IconSuccess, warning: IconWarning, danger: IconError, info: IconInfo };

/**
 * A status message: tinted fill, the status icon and title in the status colour, one line of
 * detail (status is never colour alone: the icon and the words say it). `pose` puts Luci there
 * instead of the icon, for the moments the kit gives him (BRAND.md section 5).
 */
export function StatusMessage(props: { status: Status; title: string; children?: ComponentChildren; pose?: MascotPose; toast?: boolean; part?: string }) {
  const role = props.status === 'danger' || props.status === 'warning' ? 'alert' : 'status';
  return (
    <div class={`status-msg ${props.status}${props.toast ? ' toast' : ''}`} role={role} {...(props.part ? { 'data-part': props.part } : {})}>
      {props.pose ? <Mascot pose={props.pose} size={48} /> : <Icon icon={STATUS_ICON[props.status]} />}
      <div class="status-body">
        <p class="status-title">{props.title}</p>
        {props.children !== undefined && <div class="status-detail">{props.children}</div>}
      </div>
    </div>
  );
}

/** An empty state: Luci (Watching by default), a title, one line, an optional action. */
export function EmptyState(props: { title: string; body?: string; pose?: MascotPose; size?: number; children?: ComponentChildren; part?: string }) {
  return (
    <div class="empty" {...(props.part ? { 'data-part': props.part } : {})}>
      <Mascot pose={props.pose ?? 'peek'} size={props.size ?? 120} />
      <p class="t-title">{props.title}</p>
      {props.body && <p>{props.body}</p>}
      {props.children}
    </div>
  );
}

export function Badge(props: { children: ComponentChildren; brand?: boolean }) {
  return <span class={props.brand ? 'badge brand' : 'badge'}>{props.children}</span>;
}

export function Count(props: { n: number; label?: string }) {
  return <span class="count" {...(props.label ? { 'aria-label': props.label } : {})}>{props.n}</span>;
}
