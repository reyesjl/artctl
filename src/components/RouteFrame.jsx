import { themeColor } from "../themeStyles.js";

function getRouteFrameStyles() {
  return {
    frame: {
      backgroundColor: themeColor("--card"),
      border: `1px solid ${themeColor("--border")}`,
      color: themeColor("--card-foreground")
    },
    eyebrow: {
      color: themeColor("--muted-foreground")
    },
    description: {
      color: themeColor("--muted-foreground")
    }
  };
}

export function RouteFrame({ eyebrow, title, description, children }) {
  const styles = getRouteFrameStyles();

  return (
    <main className="mx-auto w-full max-w-[896px] p-3 sm:p-4">
      <section className="flex flex-col gap-3 px-3 py-2 sm:px-4 sm:py-3" style={styles.frame}>
        <p className="text-xs" style={styles.eyebrow}>
          {eyebrow}
        </p>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="max-w-[60ch] leading-6" style={styles.description}>
          {description}
        </p>
        {children}
      </section>
    </main>
  );
}
