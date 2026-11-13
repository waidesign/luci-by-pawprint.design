import { useEffect, useState } from 'react';
import { Layout } from './components/Layout.jsx';
import { Home } from './pages/Home.jsx';
import { Pricing } from './pages/Pricing.jsx';
import { Checkout } from './pages/Checkout.jsx';

const ROUTES = { '/': Home, '/pricing': Pricing, '/checkout': Checkout };

/** A tiny client-side router: links push a route; the back button works. */
export function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const go = (to) => {
    history.pushState(null, '', to);
    setPath(to);
  };
  const Page = ROUTES[path] ?? Home;
  return (
    <Layout go={go}>
      <Page go={go} />
    </Layout>
  );
}
