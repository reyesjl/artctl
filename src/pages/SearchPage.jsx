import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";
import { themeColor } from "../themeStyles.js";

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

function getSearchControlStyles() {
  return {
    label: {
      color: themeColor("--muted-foreground")
    },
    control: {
      backgroundColor: themeColor("--secondary"),
      border: `1px solid ${themeColor("--input")}`,
      color: themeColor("--foreground")
    },
    button: {
      backgroundColor: themeColor("--secondary"),
      border: `1px solid ${themeColor("--input")}`,
      color: themeColor("--foreground")
    },
    resultsList: {
      borderTop: `1px solid ${themeColor("--border")}`
    },
    resultRow: {
      borderBottom: `1px solid ${themeColor("--border")}`
    },
    resultLink: {
      color: themeColor("--primary")
    },
    resultFlag: {
      color: themeColor("--muted-foreground")
    },
    paginationButton: {
      backgroundColor: themeColor("--secondary"),
      border: `1px solid ${themeColor("--input")}`,
      color: themeColor("--foreground")
    },
    paginationLabel: {
      color: themeColor("--muted-foreground")
    }
  };
}

export function SearchPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const styles = getSearchControlStyles();
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
      <form className="search-form mt-4 grid gap-3" onSubmit={handleSubmit}>
        <label className="search-label block text-xs" htmlFor="search-query" style={styles.label}>
          Query
        </label>
        <div className="search-controls flex flex-wrap gap-2">
          <input
            id="search-query"
            className="search-input min-h-10 flex-[1_1_320px] px-3 py-2"
            name="q"
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            style={styles.control}
          />
          <label
            className="search-label block text-xs"
            htmlFor="search-department"
            style={styles.label}
          >
            Department
          </label>
          <select
            id="search-department"
            className="search-input min-h-10 flex-[1_1_320px] px-3 py-2"
            name="departmentId"
            value={draftDepartmentId}
            onChange={(event) => setDraftDepartmentId(event.target.value)}
            style={styles.control}
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.departmentId} value={String(department.departmentId)}>
                {department.displayName}
              </option>
            ))}
          </select>
          <label className="search-label block text-xs" htmlFor="search-medium" style={styles.label}>
            Medium
          </label>
          <select
            id="search-medium"
            className="search-input min-h-10 flex-[1_1_320px] px-3 py-2"
            name="medium"
            value={draftMedium}
            onChange={(event) => setDraftMedium(event.target.value)}
            style={styles.control}
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
          <button
            className="search-button min-h-10 rounded-sm px-3"
            type="submit"
            style={styles.button}
          >
            [search]
          </button>
        </div>
      </form>
      {!query ? <p>Enter a search to find works.</p> : null}
      {query && status === "loading" ? <p>Loading search results…</p> : null}
      {query && status === "error" ? <p>{error}</p> : null}
      {query && status === "success" ? (
        <>
          <ul className="search-results mt-4 list-none p-0" style={styles.resultsList}>
            {results.map((result) => (
              <li key={result.objectId} className="search-result py-3" style={styles.resultRow}>
                <Link
                  className="font-medium"
                  to={`/works/${result.objectId}`}
                  style={styles.resultLink}
                >
                  {result.title}
                </Link>
                {!result.isPublicDomain || !result.hasImage ? (
                  <p className="search-result-flags mt-2 flex flex-wrap gap-2">
                    {!result.isPublicDomain ? (
                      <span className="search-result-flag text-xs" style={styles.resultFlag}>
                        Rights Restricted
                      </span>
                    ) : null}
                    {!result.hasImage ? (
                      <span className="search-result-flag text-xs" style={styles.resultFlag}>
                        No Image Available
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {page > 1 || results.length === SEARCH_PAGE_SIZE ? (
            <div className="search-pagination mt-4 flex flex-wrap items-center gap-3">
              {page > 1 ? (
                <button
                  className="min-h-10 rounded-sm px-3"
                  type="button"
                  onClick={() => handlePageChange(page - 1)}
                  style={styles.paginationButton}
                >
                  Prev page
                </button>
              ) : null}
              <span className="text-xs" style={styles.paginationLabel}>
                Page {page}
              </span>
              {results.length === SEARCH_PAGE_SIZE ? (
                <button
                  className="min-h-10 rounded-sm px-3"
                  type="button"
                  onClick={() => handlePageChange(page + 1)}
                  style={styles.paginationButton}
                >
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
