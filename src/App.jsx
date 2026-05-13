import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { BrowserRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
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

function AdminLoginPage({ apiBaseUrl, fetchImpl, onAuthenticated }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle");

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("submitting");
    setError("");

    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/admin/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to log in.");
        setStatus("idle");
        return;
      }

      onAuthenticated();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to log in.");
      setStatus("idle");
    }
  }

  return (
    <main className="mx-auto w-full p-3 sm:p-4">
      <div className="max-w-md mx-auto pt-10">
        <div aria-level="1" role="heading" className="sr-only">
          Admin Login
        </div>
        <form
          className="border border-border bg-card text-card-foreground px-3 py-3 space-y-2 text-sm font-mono"
          onSubmit={handleSubmit}
        >
          <div>log in</div>
          <label htmlFor="admin-username" className="sr-only">
            Username
          </label>
          <input
            id="admin-username"
            name="username"
            type="text"
            placeholder="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full bg-transparent border border-border px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <label htmlFor="admin-password" className="sr-only">
            Password
          </label>
          <input
            id="admin-password"
            name="password"
            type="password"
            placeholder="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full bg-transparent border border-border px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {error ? (
            <div role="alert" className="text-destructive">
              {error}
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              className="text-muted-foreground hover:text-foreground"
              disabled={status === "submitting"}
            >
              [submit]
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function AdminRoute({
  apiBaseUrl,
  fetchImpl,
  children,
  onAuthenticated,
  isAdminAuthenticated
}) {
  const [status, setStatus] = useState("loading");
  const [authConfigured, setAuthConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminSession() {
      const response = await fetchImpl(`${apiBaseUrl}/api/admin/session`);
      const data = await response.json();

      if (cancelled) {
        return;
      }

      setAuthConfigured(Boolean(data.authConfigured));
      setStatus(data.authenticated ? "authenticated" : "unauthenticated");
    }

    loadAdminSession();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, fetchImpl]);

  useEffect(() => {
    setStatus(isAdminAuthenticated ? "authenticated" : "unauthenticated");
  }, [authConfigured, isAdminAuthenticated]);

  if (status === "loading") {
    return <p>Checking admin session...</p>;
  }

  if (status === "unauthenticated") {
    return (
      <AdminLoginPage
        apiBaseUrl={apiBaseUrl}
        fetchImpl={fetchImpl}
        onAuthenticated={() => {
          setStatus("authenticated");
          onAuthenticated?.();
        }}
      />
    );
  }

  return children;
}

function AppShell({
  shell,
  apiBaseUrl,
  fetchImpl,
  adminSession,
  onAdminAuthenticated,
  onAdminLoggedOut
}) {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigation = shell.navigation.filter(
    (item) => item.href !== "/admin" || adminSession.authenticated
  );
  const showAdminLogout = adminSession.authenticated && location.pathname.startsWith("/admin");

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  async function handleAdminLogout() {
    await fetchImpl(`${apiBaseUrl}/api/admin/logout`, {
      method: "POST"
    });
    onAdminLoggedOut?.();
  }

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr_auto] bg-background font-mono text-foreground">
      <header className="app-header-strip flex items-center justify-between gap-3 bg-background px-4 py-2 text-foreground">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid gap-1">
            <strong className="brand text-sm font-bold text-primary">{shell.brand}</strong>
          </div>
          <nav className="hidden gap-2 text-xs sm:flex" aria-label="Primary">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) =>
                  [
                    "nav-link inline-flex items-center px-2 py-0.5 transition-colors hover:text-foreground",
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
        </div>
        <div className="flex items-center gap-3">
          {showAdminLogout ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={handleAdminLogout}
            >
              [logout]
            </button>
          ) : null}
          <button
            type="button"
            aria-label={isMobileMenuOpen ? "close menu" : "open menu"}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-navigation"
            className="text-muted-foreground transition-colors hover:text-foreground sm:hidden"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>
      {isMobileMenuOpen ? (
        <div
          id="mobile-navigation"
          role="dialog"
          aria-modal="true"
          aria-label="mobile navigation"
          className="fixed inset-0 z-50 bg-background px-4 py-3 sm:hidden"
        >
          <div className="flex items-center justify-between border-b border-border pb-3">
            <strong className="brand text-sm font-bold text-primary">{shell.brand}</strong>
            <button
              type="button"
              aria-label="close menu"
              className="text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-3 py-6 text-lg" aria-label="Primary">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) =>
                  [
                    "nav-link block py-3 text-center transition-colors hover:text-foreground",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
                onClick={() => setIsMobileMenuOpen(false)}
              >
                [{item.label.toLowerCase()}]
              </NavLink>
            ))}
          </nav>
          {showAdminLogout ? (
            <div className="border-t border-border pt-4 text-center">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={handleAdminLogout}
              >
                [logout]
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
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
          element={
            <AdminRoute
              apiBaseUrl={apiBaseUrl}
              fetchImpl={fetchImpl}
              onAuthenticated={onAdminAuthenticated}
              isAdminAuthenticated={adminSession.authenticated}
            >
              <AdminPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/curated-groups"
          element={
            <AdminRoute
              apiBaseUrl={apiBaseUrl}
              fetchImpl={fetchImpl}
              onAuthenticated={onAdminAuthenticated}
              isAdminAuthenticated={adminSession.authenticated}
            >
              <CuratedGroupsPage apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/curated-groups/new"
          element={
            <AdminRoute
              apiBaseUrl={apiBaseUrl}
              fetchImpl={fetchImpl}
              onAuthenticated={onAdminAuthenticated}
              isAdminAuthenticated={adminSession.authenticated}
            >
              <CreateCuratedGroupPage apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/curated-groups/:groupSlug"
          element={
            <AdminRoute
              apiBaseUrl={apiBaseUrl}
              fetchImpl={fetchImpl}
              onAuthenticated={onAdminAuthenticated}
              isAdminAuthenticated={adminSession.authenticated}
            >
              <AdminGalleryPage apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} />
            </AdminRoute>
          }
        />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/theme" element={<ThemesPage />} />
      </Routes>
      <footer className="app-footer-strip bg-background px-4 py-3 text-center text-[10px] text-muted-foreground">
        ARTCTL v1.0
      </footer>
    </div>
  );
}

export function App({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [shell, setShell] = useState(null);
  const [adminSession, setAdminSession] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadShell() {
      const [shellResponse, adminSessionResponse] = await Promise.all([
        fetchImpl(`${apiBaseUrl}/api/app-shell`),
        fetchImpl(`${apiBaseUrl}/api/admin/session`)
      ]);
      const [shellData, adminSessionData] = await Promise.all([
        shellResponse.json(),
        adminSessionResponse.json()
      ]);

      if (!cancelled) {
        setShell(shellData);
        setAdminSession(adminSessionData);
      }
    }

    loadShell();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, fetchImpl]);

  return (
    <ThemeProvider>
      {!shell || !adminSession ? (
        <p>Booting ARTCTL...</p>
      ) : (
        <BrowserRouter>
          <AppShell
            shell={shell}
            apiBaseUrl={apiBaseUrl}
            fetchImpl={fetchImpl}
            adminSession={adminSession}
            onAdminAuthenticated={() => {
              setAdminSession((currentSession) => ({
                ...(currentSession ?? {}),
                authenticated: true
              }));
            }}
            onAdminLoggedOut={() => {
              setAdminSession((currentSession) => ({
                ...(currentSession ?? {}),
                authenticated: false
              }));
            }}
          />
        </BrowserRouter>
      )}
    </ThemeProvider>
  );
}
