# 2026-11-17: The toolbar stands out on dark pages and works on a phone

- Date: 2026-11-17
- Status: accepted

## Context
The user found the toolbar and its cards disappearing on dark sites: the float shadow was Charcoal at 14%, the same colour as the bar (and as dark-theme cards). On a phone the dev toolbar wrapped into three rows and covered its own description cards (cards sat a fixed 72 px above the bar), tapped buttons kept their tooltips, Annotate showed no outline before a tap opened the form, the pick layer blocked scrolling, and the note's Intent and Priority were native selects whose list opened far from the form. The user approved a plan and asked to keep the description cards for every mode and tool.

## Decisions
1. **Shadow on dark pages**: `shadow-float` is black in two layers (`0 1px 2px rgba(0,0,0,.24), 0 8px 24px rgba(0,0,0,.28)`). A new `shadow-edge` (a faint inner light, not a border) is added on Charcoal surfaces only: the bar always, cards in the dark theme (`--luci-elevation`, `--luci-elevation-bar`). DESIGN.md updated.
2. **Phone layout under 640 px (dev toolbar)**: the bar spans the window in two planned rows (Luci, mode switch, Close; then the tools at 44 px). The connection shows as its dot, the basket as icon and count. The host carries the bar's measured height (`--luci-bar-h`, ResizeObserver), which every card offset uses, so a wrapped bar never covers a card, on desktop too.
3. **Tooltips**: on `(hover: none)` they show for keyboard focus only. The description cards stay.
4. **Touch picking (Annotate, Layout, Capture)**: a first tap outlines and names the element, a second tap on it acts. Annotate's hint card offers Add note and Parent. Touch moves and leaves are ignored; the pick layer lets the page pan and zoom. Mouse picking is unchanged.
5. **Note form**: Intent and Priority are segmented buttons everywhere. Under 640 px a new or opened note is a full-width sheet just above the bar.

## Alternatives considered
- A 1 px outline around the bar: DESIGN.md forbids a border with the float shadow.
- A custom dropdown for Intent and Priority: four and three options fit as buttons, one tap each, and no list can open in the wrong place.
- Horizontal scrolling for the bar on a phone: hides tools without saying so.
