# Design check: primary-button (button)
Built: `form > button` on http://localhost:5173/checkout
Design: .luci/design/example-com.component.primary-button.design.md, captured from https://example.com/pricing
12 values match; 10 differences.

Make the built component match the design:
1. Its border-radius is 8px, the right value; the design sets it with --radius-md, which this page defines too: use var(--radius-md).
2. Its background-color is #2563eb; the design says #0f62fe (--color-primary).
3. Its box-shadow is #0000001a 0px 1px 2px 0px; the design does not set it.
4. The label's font-family is Inter, sans-serif; the design does not set it.
5. The design has an icon (svg), optional; the built one has none.
6. On hover, its background-color changes to #1d4ed8; the design says #0353e9.
7. On focus-visible, its outline does not change; the design changes it to #0f62fe solid 2px.
8. On focus-visible, its outline-offset does not change; the design changes it to 2px.
9. Its transition of background-color is 0.3s ease; the design has 150ms ease-out.
10. Focus does not show: nothing changes when it has focus. In the design it does (outline change on focus-visible). (accessibility)
