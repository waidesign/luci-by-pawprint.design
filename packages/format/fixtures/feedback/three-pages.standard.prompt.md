# UI feedback: 3 pages, 6 items
Apply every item below, on all 3 pages. Do not stop after the first page.

## Page 1 of 3: /pricing  (src/pages/Pricing.jsx)
- [P1-A1] fix, high: "Button label wraps on mobile"
  selector: main > section:nth-of-type(2) > button
  text: "Start free trial"
  source: src/components/PlanCard.jsx:12:7
  components: App > Pricing > PlanCard
- [P1-A2] fix, medium: "Typo: \"pricing\""
  selector: main > h1
  selected text: "pricng"
  text: "Simple pricng for teams"
  source: src/pages/Pricing.jsx:8
  components: App > Pricing

## Page 2 of 3: /  (src/pages/Home.jsx)
- [P2-A1] change, medium: "Use 24px between the links / and align them with the logo"
  selector: header > nav
  element: nav (navigation)
  source: src/components/Nav.jsx:3
  components: App > Layout > Nav
  you asked: "Should the logo move, or only the links?"
  answer: "Only the links."
- [P2-A2] change, low: "Use the secondary button style"
  selector: main > a:nth-of-type(1)
  text: "Get started"
  source: src/components/Cta.jsx:2
  components: App > Home > Cta

## Page 3 of 3: /checkout  (src/pages/Checkout.jsx)
- [P3-A1] fix, high: "Error text is too low contrast"
  selector: form > p:nth-of-type(2)
  text: "Card number is not valid"
  source: src/components/FieldError.jsx:4:10
  components: App > Checkout > FieldError
- [P3-A2] fix, medium: "Disable while the payment is sending"
  selector: form > button
  text: "Pay now"
  source: src/pages/Checkout.jsx:21
  components: App > Checkout

## When done
Report every item ID as done, skipped or blocked, grouped by page,
and name the route to open to verify it.
End with the number of items done out of 6.
