# Layout changes: /pricing, 2 elements, 7 changes
Make every change below on /pricing (src/pages/Pricing.jsx), in the code, with the project's own styles and tokens.
They were planned in a 1920px wide window: keep the layout working at other widths.
Sizes "as rendered" (width, height and their min and max) are the size on screen, border and padding included.

Note: "Make the plans feel more spacious, and put Pro first"

## 1. div · PlanCard  (src/components/PlanCard.jsx:3:5)
selector: main > section > div:nth-of-type(2)
text: "Pro $12 per month Start free trial"
components: App > Pricing > PlanCard
- move it before `main > section > div:nth-of-type(1)` (div): 2nd of 2 → 1st
- max-width as rendered none → 480px
- padding-top 16px → 24px (--space-6)
- padding-bottom 16px → 24px (--space-6)

## 2. section (region) · Pricing  (src/pages/Pricing.jsx:5)
selector: main > section
components: App > Pricing
- display block → grid
- grid columns none → repeat(2, minmax(0, 1fr))
- column-gap normal → 24px (--space-6)

## When done
Report every element number (1 to 2) as done, skipped or blocked, and name the route to open to verify it.
