import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useParams,
  useSearchParams
} from "react-router-dom";
import { applyTheme, DEFAULT_THEME_ID, THEMES } from "./themes.js";

const themeStorageKey = "artctl-theme";

function RouteFrame({ eyebrow, title, description, children }) {
  return (
    <main className="app-main">
      <section className="panel">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lede">{description}</p>
        {children}
      </section>
    </main>
  );
}

function HomePage() {
  return (
    <RouteFrame
      eyebrow="[gallery]"
      title="Gallery"
      description="The Met highlighted works will land here in deterministic batches."
    />
  );
}

function SearchPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [searchParams] = useSearchParams();
  const [, setSearchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const [draftQuery, setDraftQuery] = useState(query);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    async function loadResults() {
      setStatus("loading");

      const response = await fetchImpl(
        `${apiBaseUrl}/api/search?q=${encodeURIComponent(query)}`
      );
      const data = await response.json();

      if (!cancelled) {
        setResults(data.results);
        setStatus("success");
      }
    }

    if (!query) {
      setResults([]);
      setStatus("idle");
      return () => {
        cancelled = true;
      };
    }

    loadResults();

    return () => {
      cancelled = true;
    };
  }, [query]);

  function handleSubmit(event) {
    event.preventDefault();

    const nextQuery = draftQuery.trim();

    if (!nextQuery) {
      setSearchParams({});
      return;
    }

    setSearchParams({ q: nextQuery });
  }

  return (
    <RouteFrame
      eyebrow="[search]"
      title="Search"
      description="Live Met-backed search will appear here once a query is submitted."
    >
      <form className="search-form" onSubmit={handleSubmit}>
        <label className="search-label" htmlFor="search-query">
          Query
        </label>
        <div className="search-controls">
          <input
            id="search-query"
            className="search-input"
            name="q"
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
          />
          <button className="search-button" type="submit">
            [search]
          </button>
        </div>
      </form>
      {!query ? <p>Enter a Met search query to begin browsing works.</p> : null}
      {query && status === "loading" ? <p>Loading search results…</p> : null}
      {query && status === "success" ? (
        <ul className="search-results">
          {results.map((result) => (
            <li key={result.objectId} className="search-result">
              <Link to={`/works/${result.objectId}`}>{result.title}</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </RouteFrame>
  );
}

function WorkPage() {
  const { objectId } = useParams();

  return (
    <RouteFrame
      eyebrow="[viewer]"
      title={`Work ${objectId}`}
      description="The object viewer will render here with image-first inspection tools."
    />
  );
}

function HelpPage() {
  return (
    <RouteFrame
      eyebrow="[help]"
      title="Help"
      description="Usage guidance, provenance, and analysis mode notes will live here."
    >
      <div className="manual-section">
        <h2>How to use ARTCTL</h2>
        <p>
          Browse the gallery, run a search, and open a work to move through the
          current ARTCTL browsing flow.
        </p>
      </div>
      <div className="manual-section">
        <h2>Provenance</h2>
        <p>
          Works come from The Metropolitan Museum of Art and are presented through
          ARTCTL&apos;s Express-backed application surface.
        </p>
      </div>
      <div className="manual-section">
        <h2>Analysis views</h2>
        <p>
          Edges, Detail, and Composition are browser-side analysis modes that
          replace the main work image when active.
        </p>
      </div>
    </RouteFrame>
  );
}

function ThemesPage({ themeName, onThemeChange }) {
  return (
    <RouteFrame
      eyebrow="[themes]"
      title="Themes"
      description="Built-in terminal-adjacent themes will be previewed and selected here."
    >
      <div className="theme-grid">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            aria-label={theme.label}
            className={theme.id === themeName ? "theme-option active" : "theme-option"}
            onClick={() => onThemeChange(theme.id)}
          >
            <span className="theme-option-name">{theme.label}</span>
            <span className="theme-option-preview">{theme.preview.bg}</span>
          </button>
        ))}
      </div>
    </RouteFrame>
  );
}

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
        <Route path="/" element={<HomePage />} />
        <Route
          path="/search"
          element={<SearchPage apiBaseUrl={apiBaseUrl} fetchImpl={fetchImpl} />}
        />
        <Route path="/works/:objectId" element={<WorkPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route
          path="/themes"
          element={<ThemesPage themeName={themeName} onThemeChange={onThemeChange} />}
        />
      </Routes>
      <footer className="status-line">v0.1.0 [met-only mvp]</footer>
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
