export function Cta({ go, to, children }) {
  return (
    <a className="cta" href={to} onClick={(e) => { e.preventDefault(); go(to); }}>
      {children}
    </a>
  );
}
