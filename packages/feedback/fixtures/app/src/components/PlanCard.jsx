export function PlanCard({ name, price, featured = false }) {
  return (
    <div className="plan">
      <h2>{name}</h2>
      <p className={featured ? 'pulse' : undefined}>{price} per month</p>
      <button type="button">Start free trial</button>
    </div>
  );
}
