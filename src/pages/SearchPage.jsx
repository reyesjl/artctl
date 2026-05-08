import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

export function SearchPage({ apiBaseUrl = "", fetchImpl = fetch }) {
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
  }, [apiBaseUrl, fetchImpl, query]);

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
