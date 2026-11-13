# New page: /enterprise, 4 parts
Create the page /enterprise in this project and add it to the app's routing, with the project's own components, styles and tokens.
It was sketched in a 1280px wide window, over /pricing: keep it working at other widths. Heights are rough: let the content decide.
Inserted parts are new: reuse the named component when there is one; a saved capture (.luci/design/) is a reference to rebuild with the project's own components and tokens (luci-mcp get_capture reads it); a new block is a placeholder for what its label says.

Note: "Same look as Pricing, for teams of 50 and more"

## The page, top to bottom
1. Full width, about 56px tall: the `Nav` component (src/components/Nav.jsx; one is at `nav`)
2. A row of 2 side by side, about 420px tall:
   - 2a. 2/3 of the width: a new text: "Headline, pitch, Talk to sales"
   - 2b. 1/3 of the width: a new image slot: "Team dashboard screenshot"
3. A row of 3 side by side, about 320px tall:
   - 3a. 1/3 of the width: the `PlanCard` component (src/components/PlanCard.jsx; one is at `main > section > div:nth-of-type(1)`): "Business"
   - 3b. 1/3 of the width: a part like the saved capture "Card" (.luci/design/example-com.component.card.design.md): "Customer quote"
   - 3c. 1/3 of the width: an area: "Logos of customers"
4. Full width, about 160px tall: a new footer

## When done
Report every part (1 to 4) as done, skipped or blocked, and name the route to open to verify it.
