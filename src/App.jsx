import { useEffect, useLayoutEffect, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { applyTheme, DEFAULT_THEME_ID, THEMES } from "./themes.js";
import { themeColor } from "./themeStyles.js";
import { HelpPage } from "./pages/HelpPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { SearchPage } from "./pages/SearchPage.jsx";
import { ThemesPage } from "./pages/ThemesPage.jsx";
import { WorkPage } from "./pages/WorkPage.jsx";

const themeStorageKey = "artctl-theme";

function getShellStyles() {
  return {
    root: {
      backgroundColor: themeColor("--background"),
      color: themeColor("--foreground")
    },
    header: {
      backgroundColor: themeColor("--card"),
      borderBottom: `1px solid ${themeColor("--border")}`,
      color: themeColor("--card-foreground")
    },
    footer: {
      backgroundColor: themeColor("--card"),
      borderTop: `1px solid ${themeColor("--border")}`,
      color: themeColor("--muted-foreground")
    },
    activeNav: {
      backgroundColor: themeColor("--primary", "0.1"),
      color: themeColor("--primary")
    },
    inactiveNav: {
      color: themeColor("--muted-foreground")
    }
  };
}

function AppShell({ shell, apiBaseUrl, fetchImpl, themeName, onThemeChange }) {
  const styles = getShellStyles();

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr_auto] font-mono" style={styles.root}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-2" style={styles.header}>
        <div className="grid gap-1">
          <strong className="brand text-base font-semibold tracking-[0.08em]">{shell.brand}</strong>
        </div>
        <nav className="flex flex-wrap gap-2 text-xs" aria-label="Primary">
          {shell.navigation.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                [
                  "nav-link inline-flex items-center rounded-sm border border-transparent px-2 py-0.5 transition-colors hover:text-[hsl(var(--foreground))]",
                  isActive ? "active" : ""
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              style={({ isActive }) => (isActive ? styles.activeNav : styles.inactiveNav)}
            >
              [{item.label.toLowerCase()}]
            </NavLink>
          ))}
        </nav>
      </header>
      <Routes>
        <Route
          path="/"
          element={<HomePage apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} />}
        />
        <Route
          path="/search"
          element={<SearchPage apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} />}
        />
        <Route
          path="/works/:objectId"
          element={<WorkPage apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} />}
        />
        <Route path="/help" element={<HelpPage />} />
        <Route
          path="/themes"
          element={<ThemesPage themeName={themeName} onThemeChange={onThemeChange} />}
        />
      </Routes>
      <footer className="px-4 py-3 text-center text-xs" style={styles.footer}>
        v0.1.0
      </footer>
    </div>
  );
}

export function App({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [shell, setShell] = useState(null);
  const [, setThemeRenderVersion] = useState(0);
  const [themeName, setThemeName] = useState(() => {
    if (typeof window === "undefined" || !window.localStorage?.getItem) {
      return DEFAULT_THEME_ID;
    }

    const storedTheme = window.localStorage.getItem(themeStorageKey);

    return THEMES.some((theme) => theme.id === storedTheme) ? storedTheme : DEFAULT_THEME_ID;
  });

  useLayoutEffect(() => {
    const theme = THEMES.find((entry) => entry.id === themeName) ?? THEMES[0];

    applyTheme(theme);
    document.documentElement.dataset.theme = themeName;
    window.localStorage?.setItem?.(themeStorageKey, themeName);
    setThemeRenderVersion((version) => version + 1);
  }, [themeName]);

  useEffect(() => {
    let cancelled = false;

    async function loadShell() {
      const response = await fetchImpl(`${apiBaseUrl}/api/app-shell`);
      const data = await response.json();

      if (!cancelled) {
        setShell(data);
      }
    }

    loadShell();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  if (!shell) {
    return <p>Booting ARTCTL...</p>;
  }

  return (
    <BrowserRouter>
      <AppShell
        shell={shell}
        apiBaseUrl={apiBaseUrl}
        fetchImpl={fetchImpl}
        themeName={themeName}
        onThemeChange={setThemeName}
      />
    </BrowserRouter>
  );
}
