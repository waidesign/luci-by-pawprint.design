/** Small shared components (brand/DESIGN.md section 6). Buttons are plain <button>s with a class. */
import type { ComponentChildren } from 'preact';
import { Face, Mascot, type MascotFace, type MascotPose } from './mascot/mascot.js';

export type Status = 'success' | 'warning' | 'danger' | 'info';

/** The face for each status (DESIGN.md section 6, Status message and toast). */
export const STATUS_FACE: Record<Status, MascotFace> = { success: 'slowblink', warning: 'focused', danger: 'annoyed', info: 'calm' };

/**
 * A status message: tinted fill, the title in the status colour, one line of detail. With `face`,
 * Luci's face for the status sits on the left (status is never colour alone: the title says it).
 */
export function StatusMessage(props: { status: Status; title: string; children?: ComponentChildren; face?: boolean; toast?: boolean; part?: string }) {
  const role = props.status === 'danger' || props.status === 'warning' ? 'alert' : 'status';
  return (
    <div class={`status-msg ${props.status}${props.toast ? ' toast' : ''}`} role={role} {...(props.part ? { 'data-part': props.part } : {})}>
      {props.face && <Face face={STATUS_FACE[props.status]} size={40} />}
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

export function Badge(props: { children: ComponentChildren }) {
  return <span class="badge">{props.children}</span>;
}

export function Count(props: { n: number; label?: string }) {
  return <span class="count" {...(props.label ? { 'aria-label': props.label } : {})}>{props.n}</span>;
}
