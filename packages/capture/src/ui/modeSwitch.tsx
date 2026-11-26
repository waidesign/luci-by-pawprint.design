/**
 * The dev toolbar's mode switch: the same control, in the same place (first after "Luci"), on every
 * mode's bar, so it always reads as "which Luci tool am I in", never as an action.
 */

export interface Mode {
  id: string;
  label: string;
  /** One line on what the mode is for (the tooltip). */
  title: string;
}

export interface ModeSwitchProps {
  current: string;
  modes: readonly Mode[];
  onSelect: (id: string) => void;
}

export function ModeSwitch(props: ModeSwitchProps) {
  return (
    <div class="seg modes" role="group" aria-label="Luci mode" data-part="modes">
      {props.modes.map(m => (
        <button type="button" data-mode={m.id} aria-pressed={m.id === props.current} title={m.title}
          onClick={() => { if (m.id !== props.current) props.onSelect(m.id); }}>{m.label}</button>
      ))}
    </div>
  );
}
