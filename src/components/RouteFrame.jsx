export function RouteFrame({ eyebrow, title, description, children }) {
  return (
    <main className="app-main">
      <section className="panel">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lede">{description}</p>
        {children}
      </section>
    </main>
  );
}
