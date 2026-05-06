import { useEffect, useState } from "react";
import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  useParams
} from "react-router-dom";

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

function SearchPage() {
  return (
    <RouteFrame
      eyebrow="[search]"
      title="Search"
      description="Live Met-backed search will appear here once a query is submitted."
    />
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
    />
  );
}

function ThemesPage() {
  return (
    <RouteFrame
      eyebrow="[themes]"
      title="Themes"
      description="Built-in terminal-adjacent themes will be previewed and selected here."
    />
  );
}

function AppShell({ shell }) {
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
        <Route path="/search" element={<SearchPage />} />
        <Route path="/works/:objectId" element={<WorkPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/themes" element={<ThemesPage />} />
      </Routes>
      <footer className="status-line">v0.1.0 [met-only mvp]</footer>
    </div>
  );
}

export function App({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [shell, setShell] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
  }, []);

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
      <AppShell shell={shell} />
    </BrowserRouter>
  );
}
