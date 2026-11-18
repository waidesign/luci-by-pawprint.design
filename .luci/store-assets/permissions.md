# Luci 0.5.7: why each permission is needed

For the Chrome Web Store "Permission justification" fields. Each line matches what the code in `packages/extension` does.

## Permissions

- **activeTab**: When you click Luci's icon, activeTab lets Luci open its toolbar in that one tab and, in Pixel mode, take a screenshot of it, with no access to any other tab or site.
- **scripting**: Luci uses scripting to add its toolbar to the tab where you clicked the icon; it has no content scripts that run on pages by themselves.
- **storage**: Luci uses storage to keep your settings, your capture basket, your saved tokens and the address of your local Luci project on your own computer.
- **debugger**: Luci attaches the debugger only to the current tab and only when you start a capture that needs it (a component's exact hover, focus and active states, or a responsive capture at other widths), detaches it as soon as that reading is done, and can be switched off in Luci's settings, in which case states are read from the page's stylesheet rules instead.
  - States: `DOM.enable`, `CSS.enable`, `DOM.getDocument`, `DOM.querySelector`, `CSS.getComputedStyleForNode`, `CSS.forcePseudoState`, `Input.dispatchMouseEvent`
  - Responsive widths: `Emulation.setDeviceMetricsOverride`, `Emulation.clearDeviceMetricsOverride`

## Host permissions

- **http://127.0.0.1/\***: Luci sends your captures to `luci serve`, the Luci command running on your own computer, which saves them into your project; nothing is sent to any other server.
- **http://localhost/\***: The same connection to `luci serve` on your own computer, for setups that reach it as localhost instead of 127.0.0.1.
