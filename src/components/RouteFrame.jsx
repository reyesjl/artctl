export function RouteFrame({ title, children, maxWidthClassName = "max-w-[896px]" }) {
  return (
    <main className={["mx-auto w-full p-3 sm:p-4", maxWidthClassName].join(" ")}>
      <section className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">{title}</h1>
        {children}
      </section>
    </main>
  );
}
