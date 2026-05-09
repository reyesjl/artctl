import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

function normalizePageParam(value) {
  const parsedPage = Number.parseInt(value ?? "", 10);

  return Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
}

const MEDIUM_OPTIONS = [
  {
    label: "Type",
    options: [
      { value: "paintings", label: "Paintings" },
      { value: "drawings", label: "Drawings" },
      { value: "prints", label: "Prints" },
      { value: "photos", label: "Photos" },
      { value: "sculpture", label: "Sculpture" }
    ]
  },
  {
    label: "Material",
    options: [
      { value: "oil", label: "Oil" },
      { value: "paper", label: "Paper" },
      { value: "canvas", label: "Canvas" },
      { value: "metal", label: "Metal" },
      { value: "wood", label: "Wood" }
    ]
  }
];
const SEARCH_PAGE_SIZE = 12;

export function SearchPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const departmentId = searchParams.get("departmentId")?.trim() ?? "";
  const medium = searchParams.get("medium")?.trim() ?? "";
  const page = normalizePageParam(searchParams.get("page"));
  const [draftQuery, setDraftQuery] = useState(query);
  const [draftDepartmentId, setDraftDepartmentId] = useState(departmentId);
  const [draftMedium, setDraftMedium] = useState(medium);
  const [departments, setDepartments] = useState([]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    setDraftDepartmentId(departmentId);
  }, [departmentId]);

  useEffect(() => {
    setDraftMedium(medium);
  }, [medium]);

  useEffect(() => {
    let cancelled = false;

    async function loadDepartments() {
      const response = await fetchImpl(`${apiBaseUrl}/api/search/departments`);
      const data = await response.json();

      if (cancelled || !response.ok) {
        return;
      }

      setDepartments(data.departments ?? []);
    }

    loadDepartments();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, fetchImpl]);

  useEffect(() => {
    let cancelled = false;

    async function loadResults() {
      setStatus("loading");
      setError("");

      try {
        const requestParams = new URLSearchParams({ q: query });

        if (departmentId) {
          requestParams.set("departmentId", departmentId);
        }

        if (medium) {
          requestParams.set("medium", medium);
        }

        if (searchParams.has("page") || page !== 1) {
          requestParams.set("page", String(page));
        }

        const response = await fetchImpl(`${apiBaseUrl}/api/search?${requestParams.toString()}`);
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
  }, [apiBaseUrl, departmentId, fetchImpl, medium, page, query, searchParams]);

  function handleSubmit(event) {
    event.preventDefault();

    const nextQuery = draftQuery.trim();

    if (!nextQuery) {
      setSearchParams({});
      return;
    }

    const nextSearchParams = { q: nextQuery };

    if (draftDepartmentId) {
      nextSearchParams.departmentId = draftDepartmentId;
    }

    if (draftMedium) {
      nextSearchParams.medium = draftMedium;
    }

    setSearchParams(nextSearchParams);
  }

  function handlePageChange(nextPage) {
    const nextSearchParams = { q: query };

    if (departmentId) {
      nextSearchParams.departmentId = departmentId;
    }

    if (medium) {
      nextSearchParams.medium = medium;
    }

    if (nextPage > 1) {
      nextSearchParams.page = String(nextPage);
    }

    setSearchParams(nextSearchParams);
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
          <label className="search-label" htmlFor="search-department">
            Department
          </label>
          <select
            id="search-department"
            className="search-input"
            name="departmentId"
            value={draftDepartmentId}
            onChange={(event) => setDraftDepartmentId(event.target.value)}
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.departmentId} value={String(department.departmentId)}>
                {department.displayName}
              </option>
            ))}
          </select>
          <label className="search-label" htmlFor="search-medium">
            Medium
          </label>
          <select
            id="search-medium"
            className="search-input"
            name="medium"
            value={draftMedium}
            onChange={(event) => setDraftMedium(event.target.value)}
          >
            <option value="">All media</option>
            {MEDIUM_OPTIONS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button className="search-button" type="submit">
            [search]
          </button>
        </div>
      </form>
      {!query ? <p>Enter a search to find works.</p> : null}
      {query && status === "loading" ? <p>Loading search results…</p> : null}
      {query && status === "error" ? <p>{error}</p> : null}
      {query && status === "success" ? (
        <>
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
          {page > 1 || results.length === SEARCH_PAGE_SIZE ? (
            <div className="search-pagination">
              {page > 1 ? (
                <button type="button" onClick={() => handlePageChange(page - 1)}>
                  Prev page
                </button>
              ) : null}
              <span>Page {page}</span>
              {results.length === SEARCH_PAGE_SIZE ? (
                <button type="button" onClick={() => handlePageChange(page + 1)}>
                  Next page
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </RouteFrame>
  );
}
