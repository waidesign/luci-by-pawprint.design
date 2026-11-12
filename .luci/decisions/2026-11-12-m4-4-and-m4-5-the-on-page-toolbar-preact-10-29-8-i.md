# M4.4 and M4.5: the on-page toolbar (Preact 10.29.8 in a shadow root) with the picker and the Text, Colour and Spacing tools, shared by both shells through mountToolbar()

- Date: 2026-11-12
- Status: accepted
- Area: Capture

## What
M4.4 and M4.5: the on-page toolbar (Preact 10.29.8 in a shadow root) with the picker and the Text, Colour and Spacing tools, shared by both shells through mountToolbar()

## Why
The toolbar lives in an open shadow root on a <luci-toolbar data-luci-ui> host, so page and toolbar styles never mix and captures skip it. Picker: hover label "tag W x H", blocked elements greyed with the reason and not pickable, ArrowUp/ArrowDown widen and narrow (crossing shadow roots), Enter picks, Esc cancels, the body redirects to "The whole system". Every pick offers "This one" and "The whole system"; the preview reformats live with the unit and colour settings; copy and download .design.md. Spacing shows padding and margin overlays on hover, offers each value an element sets, and a drag between two elements measures the distance. Colour has "Pick a pixel" via the EyeDropper API, and mountToolbar().pickPixel(hex) feeds the same path. Preact 10.29.8 was chosen over 11.x because 11 is six weeks old and its latest releases under two weeks. Bugs the browser tests found and fixed: focus left on a tool button swallowed the arrow keys; Chrome's synthetic pointer moves after layout changes re-aimed the picker; listeners read stale render values (now refs and layout effects); and picking a link followed it, because the click after the pick came after picking ended (a toolbar-wide one-shot click blocker now stops it).

## Alternatives considered
_Not recorded._
