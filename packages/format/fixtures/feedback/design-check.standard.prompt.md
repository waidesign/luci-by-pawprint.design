# UI feedback: 1 page, 2 items
Apply every item below.

## Page 1 of 1: /checkout  (src/pages/Checkout.jsx)
- [P1-A1] fix, medium: "Its background-color is #2563eb; the design says #0f62fe (--color-primary)."
  selector: form > button
  text: "Pay now"
  source: src/components/Button.jsx:3:10
  components: App > Checkout > Button
  design check against .luci/design/example-com.component.primary-button.design.md: container, background-color: the design says #0f62fe (--color-primary); built: #2563eb
- [P1-A2] fix, medium: "On hover, its background-color changes to #1d4ed8; the design says #0353e9."
  selector: form > button
  text: "Pay now"
  source: src/components/Button.jsx:3:10
  components: App > Checkout > Button
  design check against .luci/design/example-com.component.primary-button.design.md: container on hover, background-color: the design says #0353e9; built: #1d4ed8

## When done
Report every item ID as done, skipped or blocked, grouped by page,
and name the route to open to verify it.
End with the number of items done out of 2.
