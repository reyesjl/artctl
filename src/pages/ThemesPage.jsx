import { THEMES } from "../themes.js";

export function ThemesPage({ themeName, onThemeChange }) {
  return (
    <main className="app-main">
      <section className="theme-page">
        <h1 className="sr-only">Themes</h1>
        <p className="theme-page-title">── theme ──</p>
        <p className="theme-page-description">Choose a color theme. Your selection is saved locally.</p>
        <div className="theme-grid">
          {THEMES.map((theme) => {
            const isActive = theme.id === themeName;

            return (
              <button
                key={theme.id}
                type="button"
                aria-label={theme.label}
                aria-pressed={isActive}
                className={isActive ? "theme-option active" : "theme-option"}
                onClick={() => onThemeChange(theme.id)}
              >
                <span className="theme-option-swatches" aria-hidden="true">
                  <span
                    className="theme-option-swatch"
                    style={{ background: theme.preview.bg }}
                  />
                  <span
                    className="theme-option-swatch"
                    style={{ background: theme.preview.primary }}
                  />
                </span>
                <span className="theme-option-name">{theme.label}</span>
                {isActive ? <span className="theme-option-check">✓</span> : null}
              </button>
            );
          })}
        </div>
        <p className="theme-page-footnote">theme is stored in browser localStorage</p>
      </section>
    </main>
  );
}
