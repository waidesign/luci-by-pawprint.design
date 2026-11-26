# UI feedback: 1 page, 1 item
Apply every item below.

## Page 1 of 1: /checkout (item IDs start with P3)
- [P3-A2] fix, medium: "Disable while the payment is sending"
  selector: form > button
  text: "Pay now"
  source: src/pages/Checkout.jsx:21
  components: App > Checkout
  styles: background-color rgb(15, 98, 254); font-size 16px; padding 12px 20px

## When done
Report every item ID as done, skipped or blocked, grouped by page,
and name the route to open to verify it.
End with the number of items done out of 1.
