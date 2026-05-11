export function RouteFrame({ title, children }) {
  return (
    <main className="mx-auto w-full max-w-[896px] p-3 sm:p-4">
      <section className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">{title}</h1>
        {children}
      </section>
    </main>
  );
}
