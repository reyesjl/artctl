import { THEMES } from "../themes.js";
import { useTheme } from "../theme-provider.jsx";

export function ThemesPage() {
  const { themeId, setThemeId } = useTheme();

  return (
    <main className="app-main">
      <section className="theme-page max-w-xl font-mono space-y-4">
        <div aria-level="1" role="heading" className="sr-only m-0">
          Theme
        </div>
        <p className="theme-page-title m-0 text-xs text-primary">
          ── theme ──
        </p>
        <p className="theme-page-description m-0 text-xs text-muted-foreground">
          Choose a color theme. Your selection is saved locally.
        </p>
        <div className="theme-grid grid gap-2 sm:grid-cols-2">
          {THEMES.map((theme) => {
            const isActive = theme.id === themeId;

            return (
              <button
                key={theme.id}
                type="button"
                aria-label={theme.label}
                aria-pressed={isActive}
                className={[
                  "theme-option flex w-full appearance-none items-center gap-3 border border-solid px-3 py-2.5 text-left text-xs font-mono shadow-none transition-colors",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:bg-secondary"
                ].join(" ")}
                onClick={() => setThemeId(theme.id)}
              >
                <span className="theme-option-swatches flex shrink-0 gap-1" aria-hidden="true">
                  <span
                    className="theme-option-swatch h-4 w-4 border border-border border-solid"
                    style={{ background: theme.preview.bg }}
                  />
                  <span
                    className="theme-option-swatch h-4 w-4 border border-border border-solid"
                    style={{ background: theme.preview.primary }}
                  />
                </span>
                <span className="theme-option-name flex-1">{theme.label}</span>
                {isActive ? <span className="theme-option-check text-primary">✓</span> : null}
              </button>
            );
          })}
        </div>
        <p className="theme-page-footnote m-0 text-[10px] text-muted-foreground/50">
          theme is stored in browser localStorage
        </p>
      </section>
    </main>
  );
}
