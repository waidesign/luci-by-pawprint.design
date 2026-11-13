import { Cta } from '../components/Cta.jsx';

export function Home({ go }) {
  return (
    <section>
      <h1>Welcome to the shop</h1>
      <p>Everything you need, in one place.</p>
      <Cta go={go} to="/pricing">Get started</Cta>
    </section>
  );
}
