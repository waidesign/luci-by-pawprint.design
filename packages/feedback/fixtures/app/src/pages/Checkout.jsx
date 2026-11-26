import { FieldError } from '../components/FieldError.jsx';

export function Checkout() {
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <h1>Checkout</h1>
      <label>
        Card number <input name="card" defaultValue="4242" />
      </label>
      <FieldError>Card number is not valid</FieldError>
      <button type="submit">Pay now</button>
    </form>
  );
}
