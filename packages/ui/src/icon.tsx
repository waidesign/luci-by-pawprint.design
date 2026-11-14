/**
 * The one way to show an icon (brand/DESIGN.md section 7): an approved Lucide icon from icons.ts,
 * 1.75 stroke, currentColor, hidden from assistive tech (the button or the words beside it name it).
 */
import { ICON_STYLE, type LucideIcon } from './icons.js';

export type IconSize = keyof typeof ICON_STYLE.size;

export interface IconProps {
  icon: LucideIcon;
  /** toolbar 22 px, content 20 px (default), compact 16 px */
  size?: IconSize;
  class?: string;
}

export function Icon(props: IconProps) {
  const Glyph = props.icon;
  const px = ICON_STYLE.size[props.size ?? 'content'];
  return (
    <Glyph
      size={px}
      strokeWidth={ICON_STYLE.strokeWidth}
      color={ICON_STYLE.color}
      aria-hidden="true"
      focusable="false"
      class={`icon${props.class ? ` ${props.class}` : ''}`}
    />
  );
}
