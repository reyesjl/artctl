import { useEffect, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { AdminPage } from "./pages/AdminPage.jsx";
import { AdminGalleryPage } from "./pages/AdminGalleryPage.jsx";
import { CreateCuratedGroupPage } from "./pages/CreateCuratedGroupPage.jsx";
import { CuratedGroupsPage } from "./pages/CuratedGroupsPage.jsx";
import { HelpPage } from "./pages/HelpPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { SearchPage } from "./pages/SearchPage.jsx";
import { ThemesPage } from "./pages/ThemesPage.jsx";
import { WorkPage } from "./pages/WorkPage.jsx";
import { ThemeProvider } from "./theme-provider.jsx";
import "./styles.css";

function AppShell({ shell, apiBaseUrl, fetchImpl }) {
  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr_auto] bg-background font-sans text-foreground">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-card px-4 py-2 text-card-foreground">
        <div className="grid gap-1">
          <strong className="brand text-base font-semibold">{shell.brand}</strong>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="Primary">
          {shell.navigation.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                [
                  "nav-link inline-flex items-center rounded-sm border border-transparent px-2 py-0.5 transition-colors hover:text-foreground",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
                ]
                  .filter(Boolean)
                  .join(" ")
              }
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
        <Route
          path="/admin"
          element={<AdminPage />}
        />
        <Route
          path="/admin/curated-groups"
          element={<CuratedGroupsPage apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} />}
        />
        <Route
          path="/admin/curated-groups/new"
          element={<CreateCuratedGroupPage apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} />}
        />
        <Route
          path="/admin/curated-groups/:groupSlug"
          element={<AdminGalleryPage apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} />}
        />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/themes" element={<ThemesPage />} />
      </Routes>
      <footer className="border-t border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
        v0.1.0
      </footer>
    </div>
  );
}

export function App({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [shell, setShell] = useState(null);

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
  }, [apiBaseUrl, fetchImpl]);

  return (
    <ThemeProvider>
      {!shell ? (
        <p>Booting ARTCTL...</p>
      ) : (
        <BrowserRouter>
          <AppShell shell={shell} apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} />
        </BrowserRouter>
      )}
    </ThemeProvider>
  );
}
