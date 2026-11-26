const LINKS = [['/', 'Home'], ['/pricing', 'Pricing'], ['/checkout', 'Checkout']];

export function Nav({ go }) {
  return (
    <nav>
      {LINKS.map(([to, label]) => (
        <a key={to} href={to} onClick={(e) => { e.preventDefault(); go(to); }}>
          {label}
        </a>
      ))}
    </nav>
  );
}
