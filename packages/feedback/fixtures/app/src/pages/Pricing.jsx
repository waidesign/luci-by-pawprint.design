import { PlanCard } from '../components/PlanCard.jsx';

export function Pricing() {
  return (
    <section>
      <h1>Simple pricng for teams</h1>
      <PlanCard name="Starter" price="$0" />
      <PlanCard name="Pro" price="$12" featured />
    </section>
  );
}
