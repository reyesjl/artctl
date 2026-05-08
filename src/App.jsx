import { useEffect, useRef, useState } from "react";
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

function HomePage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadGallery() {
      setStatus("loading");
      setError("");

      try {
        const response = await fetchImpl(`${apiBaseUrl}/api/gallery`);
        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setResults([]);
          setError(data.error || "Unable to load gallery.");
          setStatus("error");
          return;
        }

        setResults(data.results ?? []);
        setStatus("success");
      } catch (error) {
        if (!cancelled) {
          setResults([]);
          setError(error instanceof Error ? error.message : "Unable to load gallery.");
          setStatus("error");
        }
      }
    }

    loadGallery();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, fetchImpl]);

  return (
    <RouteFrame
      eyebrow="[gallery]"
      title="Gallery"
      description="Showing The Met's highlighted works in deterministic order."
    >
      {status === "loading" ? <p>Loading gallery…</p> : null}
      {status === "error" ? <p>{error}</p> : null}
      {status === "success" ? (
        <ul className="gallery-grid">
          {results.map((work) => (
            <li key={work.objectId} className="gallery-card">
              <Link to={`/works/${work.objectId}`}>
                <figure className="gallery-card-media">
                  {work.imageUrl ? (
                    <img className="gallery-card-image" src={work.imageUrl} alt={work.title} />
                  ) : (
                    <div className="gallery-card-image gallery-card-image-placeholder" />
                  )}
                </figure>
                <div className="gallery-card-copy">
                  <strong className="gallery-card-title">{work.title}</strong>
                  <p className="gallery-card-meta">{work.artist}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </RouteFrame>
  );
}

function SearchPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const [draftQuery, setDraftQuery] = useState(query);
  const previousQueryRef = useRef(query);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    if (previousQueryRef.current !== query) {
      previousQueryRef.current = query;
      setDraftQuery(query);
    }
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    async function loadResults() {
      setStatus("loading");
      setError("");

      try {
        const response = await fetchImpl(
          `${apiBaseUrl}/api/search?q=${encodeURIComponent(query)}`
        );
        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setResults([]);
          setError(data.error || "Unable to load search results.");
          setStatus("error");
          return;
        }

        setResults(data.results ?? []);
        setStatus("success");
      } catch (error) {
        if (!cancelled) {
          setResults([]);
          setError(error instanceof Error ? error.message : "Unable to load search results.");
          setStatus("error");
        }
      }
    }

    if (!query) {
      setResults([]);
      setError("");
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
      {!query ? <p>Enter a search to find works.</p> : null}
      {query && status === "loading" ? <p>Loading search results…</p> : null}
      {query && status === "error" ? <p>{error}</p> : null}
      {query && status === "success" ? (
        <ul className="search-results">
          {results.map((result) => (
            <li key={result.objectId} className="search-result">
              <Link to={`/works/${result.objectId}`}>{result.title}</Link>
              {!result.isPublicDomain || !result.hasImage ? (
                <p className="search-result-flags">
                  {!result.isPublicDomain ? (
                    <span className="search-result-flag">Rights Restricted</span>
                  ) : null}
                  {!result.hasImage ? (
                    <span className="search-result-flag">No Image Available</span>
                  ) : null}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </RouteFrame>
  );
}

function WorkPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const { objectId } = useParams();
  const [work, setWork] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadWork() {
      const response = await fetchImpl(`${apiBaseUrl}/api/works/${objectId}`);
      const data = await response.json();

      if (!cancelled) {
        if (!response.ok) {
          setError(data.error || "Unable to load work.");
          setWork(null);
          return;
        }

        setError("");
        setWork(data);
      }
    }

    setError("");
    setWork(null);
    loadWork();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, fetchImpl, objectId]);

  return (
    <RouteFrame
      eyebrow="[viewer]"
      title={work?.title || `Work ${objectId}`}
      description={
        error
          ? error
          : work
          ? "The object viewer will render here with image-first inspection tools."
          : "Loading work detail from the Met collection through ARTCTL."
      }
    >
      {work ? (
        <div className="work-viewer">
          <figure className="work-image-frame">
            {work.imageUrl ? (
              <img className="work-image" src={work.imageUrl} alt={work.title} />
            ) : (
              <p className="work-image-unavailable">Image unavailable through the Met API.</p>
            )}
          </figure>
          <section className="work-metadata" aria-label="Work metadata">
            <dl className="work-metadata-list">
              <div>
                <dt>Artist</dt>
                <dd>{work.artist}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{work.date}</dd>
              </div>
              <div>
                <dt>Context</dt>
                <dd>{work.context}</dd>
              </div>
            </dl>
            <a href={work.metUrl} target="_blank" rel="noreferrer">
              View on the Met
            </a>
          </section>
        </div>
      ) : null}
    </RouteFrame>
  );
}

function HelpSection({ title, children }) {
  return (
    <section className="help-section">
      <p className="help-section-title">── {title} ──</p>
      {children}
    </section>
  );
}

function HelpPage() {
  return (
    <main className="app-main">
      <article className="help-page">
        <h1 className="sr-only">Help</h1>
        <div className="help-page-header">
          <p className="help-page-manual">ARTCTL(1)</p>
          <p className="help-page-subtitle">Terminal Art Browser — User Manual</p>
        </div>

        <HelpSection title="NAME">
          <p className="help-page-copy">
            ARTCTL — a terminal-style browser for the Metropolitan Museum of Art collection.
            Browse highlights, search the collection, inspect work detail, and switch visual themes.
          </p>
        </HelpSection>

        <HelpSection title="SYNOPSIS">
          <div className="help-page-example">
            <span className="help-page-prompt">&gt; </span>
            browse gallery | search collection | inspect work
          </div>
          <p className="help-page-copy">Routes stay lightweight and use the Met-backed Express surface for collection data.</p>
        </HelpSection>

        <HelpSection title="EXAMPLES">
          <div className="help-page-examples">
            <div className="help-page-example">
              <span className="help-page-prompt">&gt; </span>
              open /
            </div>
            <div className="help-page-example">
              <span className="help-page-prompt">&gt; </span>
              open /search?q=sunflowers
            </div>
            <div className="help-page-example">
              <span className="help-page-prompt">&gt; </span>
              open /works/436121
            </div>
            <div className="help-page-example">
              <span className="help-page-prompt">&gt; </span>
              open /themes
            </div>
          </div>
        </HelpSection>

        <HelpSection title="GALLERY">
          <p className="help-page-copy">
            Shows highlighted public-domain works in a deterministic order. Hover a card to pick up the current theme accent, then open a work for closer inspection.
          </p>
        </HelpSection>

        <HelpSection title="SEARCH">
          <p className="help-page-copy">
            Search submits your query through the Express backend and restores the current query from the URL so the same result set can be revisited directly.
          </p>
        </HelpSection>

        <HelpSection title="WORK VIEWER">
          <p className="help-page-copy">
            Viewer shows the preferred Met image when available, then falls back to metadata context, date, and the original Met object link.
          </p>
        </HelpSection>

        <HelpSection title="THEMES">
          <p className="help-page-copy">
            Switch between built-in color themes. The current theme is stored in browser localStorage and is applied across gallery, search, help, and viewer routes.
          </p>
        </HelpSection>
      </article>
    </main>
  );
}

function ThemesPage({ themeName, onThemeChange }) {
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
