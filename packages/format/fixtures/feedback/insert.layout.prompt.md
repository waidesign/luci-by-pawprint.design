# Layout changes: /pricing, 2 elements, 3 changes
Make every change below on /pricing (src/pages/Pricing.jsx), in the code, with the project's own styles and tokens.
They were planned in a 1280px wide window: keep the layout working at other widths.
Sizes "as rendered" (width, height and their min and max) are the size on screen, border and padding included.
Inserted parts are new: reuse the named component when there is one; a saved capture (.luci/design/) is a reference to rebuild with the project's own components and tokens (luci-mcp get_capture reads it); a new block is a placeholder for what its label says.

Note: "Room for an Enterprise plan and a short FAQ"

## 1. div · PlanCard  (src/components/PlanCard.jsx:3:5)
selector: main > section > div:nth-of-type(2)
text: "Pro $12 per month Start free trial"
components: App > Pricing > PlanCard
- insert another `PlanCard` (src/components/PlanCard.jsx; one is at `main > section > div:nth-of-type(2)`) after it, 320px wide, 240px tall as rendered: "Enterprise: custom price, Talk to sales"

## 2. section (region) · Pricing  (src/pages/Pricing.jsx:5)
selector: main > section
components: App > Pricing
- insert a part like the saved capture "Accordion" (.luci/design/example-com.component.accordion.design.md) inside it, at the end, full width, 200px tall as rendered: "Three questions about billing"
- insert a new heading inside it, at the start

## When done
Report every element number (1 to 2) as done, skipped or blocked, and name the route to open to verify it.
