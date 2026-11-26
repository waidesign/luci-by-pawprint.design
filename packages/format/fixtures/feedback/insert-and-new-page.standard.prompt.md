# UI feedback: 1 page, 2 items
Apply every item below.

## Page 1 of 1: /pricing  (src/pages/Pricing.jsx)
- [P1-A1] change, medium: "A third plan for big teams"
  selector: main > section > div:nth-of-type(2)
  text: "Pro $12 per month Start free trial"
  source: src/components/PlanCard.jsx:3:5
  components: App > Pricing > PlanCard
  layout, planned in a 1280px wide window (keep it working at other widths):
    - insert another `PlanCard` (src/components/PlanCard.jsx; one is at `main > section > div:nth-of-type(2)`) after it, 320px wide, 240px tall as rendered: "Enterprise: custom price, Talk to sales"
- [P1-A2] change, high: "New page /enterprise for big teams"
  selector: body
  element: body
  new page /enterprise, sketched in a 1280px wide window (create it with the project's own components; heights are rough), top to bottom:
    1. Full width, about 56px tall: the `Nav` component (src/components/Nav.jsx; one is at `nav`)
    2. A row of 2 side by side, about 420px tall:
       - 2a. 1/2 of the width: a new text: "Headline, pitch, Talk to sales"
       - 2b. 1/2 of the width: a new image slot: "Team dashboard screenshot"

## When done
Report every item ID as done, skipped or blocked, grouped by page,
and name the route to open to verify it.
End with the number of items done out of 2.
