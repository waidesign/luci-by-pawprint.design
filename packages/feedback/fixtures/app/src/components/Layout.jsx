import { Nav } from './Nav.jsx';

export function Layout({ go, children }) {
  return (
    <>
      <header>
        <strong>Shop</strong>
        <Nav go={go} />
      </header>
      <main>{children}</main>
    </>
  );
}
