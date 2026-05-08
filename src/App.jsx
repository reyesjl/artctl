import { useEffect, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { applyTheme, DEFAULT_THEME_ID, THEMES } from "./themes.js";
import { HelpPage } from "./pages/HelpPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { SearchPage } from "./pages/SearchPage.jsx";
import { ThemesPage } from "./pages/ThemesPage.jsx";
import { WorkPage } from "./pages/WorkPage.jsx";

const themeStorageKey = "artctl-theme";

function AppShell({ shell, apiBaseUrl, fetchImpl, themeName, onThemeChange }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <strong className="brand">{shell.brand}</strong>
        </div>
        <nav className="primary-nav" aria-label="Primary">
          {shell.navigation.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
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
      <footer className="status-line">v0.1.0</footer>
    </div>
  );
}

export function App({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [shell, setShell] = useState(null);
  const [themeName, setThemeName] = useState(() => {
    if (typeof window === "undefined" || !window.localStorage?.getItem) {
      return DEFAULT_THEME_ID;
    }

    const storedTheme = window.localStorage.getItem(themeStorageKey);

    return THEMES.some((theme) => theme.id === storedTheme) ? storedTheme : DEFAULT_THEME_ID;
  });

  useEffect(() => {
    const theme = THEMES.find((entry) => entry.id === themeName) ?? THEMES[0];

    applyTheme(theme);
    document.documentElement.dataset.theme = themeName;
    window.localStorage?.setItem?.(themeStorageKey, themeName);
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
