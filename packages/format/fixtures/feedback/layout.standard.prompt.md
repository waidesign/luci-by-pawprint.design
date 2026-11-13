# UI feedback: 1 page, 1 item
Apply every item below.

## Page 1 of 1: /pricing  (src/pages/Pricing.jsx)
- [P1-A3] change, medium: "Put the Pro plan first and make the cards wider"
  selector: main > section > div:nth-of-type(2)
  text: "Pro $12 per month Start free trial"
  source: src/components/PlanCard.jsx:3:5
  components: App > Pricing > PlanCard
  layout, planned in a 1280px wide window (keep it working at other widths):
    - move it before `main > section > div:nth-of-type(1)` (div): 2nd of 2 → 1st
    - width as rendered 360px → 400px
    - padding 16px → 24px (--space-6)

## When done
Report every item ID as done, skipped or blocked, grouped by page,
and name the route to open to verify it.
End with the number of items done out of 1.
If Luci's MCP tools are connected, also call resolve_feedback for each item you did (with a one-line summary), dismiss_feedback for each you did not (with the reason), and ask_feedback_question when something is unclear.
