import { THEMES } from "../themes.js";
import { themeColor } from "../themeStyles.js";

function getThemesStyles() {
  return {
    title: {
      color: themeColor("--primary")
    },
    description: {
      color: themeColor("--muted-foreground")
    },
    footnote: {
      color: themeColor("--muted-foreground")
    },
    option: {
      backgroundColor: themeColor("--card"),
      border: `1px solid ${themeColor("--border")}`,
      color: themeColor("--foreground")
    },
    activeOption: {
      backgroundColor: themeColor("--primary", "0.1"),
      border: `1px solid ${themeColor("--primary")}`,
      color: themeColor("--primary")
    }
  };
}

export function ThemesPage({ themeName, onThemeChange }) {
  const styles = getThemesStyles();

  return (
    <main className="app-main">
      <section className="theme-page max-w-[640px] text-xs">
        <h1 className="sr-only">Themes</h1>
        <p className="theme-page-title m-0" style={styles.title}>
          ── theme ──
        </p>
        <p className="theme-page-description mt-4 leading-6" style={styles.description}>
          Choose a color theme. Your selection is saved locally.
        </p>
        <div className="theme-grid mt-0 grid gap-2 sm:grid-cols-2">
          {THEMES.map((theme) => {
            const isActive = theme.id === themeName;

            return (
              <button
                key={theme.id}
                type="button"
                aria-label={theme.label}
                aria-pressed={isActive}
                className="theme-option flex w-full items-center gap-3 px-3 py-2 text-left transition-colors"
                onClick={() => onThemeChange(theme.id)}
                style={isActive ? styles.activeOption : styles.option}
              >
                <span className="theme-option-swatches flex shrink-0 gap-1" aria-hidden="true">
                  <span
                    className="theme-option-swatch h-4 w-4 rounded-sm"
                    style={{ background: theme.preview.bg }}
                  />
                  <span
                    className="theme-option-swatch h-4 w-4 rounded-sm"
                    style={{ background: theme.preview.primary }}
                  />
                </span>
                <span className="theme-option-name flex-1 text-xs">{theme.label}</span>
                {isActive ? <span className="theme-option-check text-xs">✓</span> : null}
              </button>
            );
          })}
        </div>
        <p className="theme-page-footnote mt-4 text-[10px] opacity-50" style={styles.footnote}>
          theme is stored in browser localStorage
        </p>
      </section>
    </main>
  );
}
