import { useEffect, useRef, useState } from "react";
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
  const [showDepartments, setShowDepartments] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const departmentsPopoverRef = useRef(null);
  const mediaPopoverRef = useRef(null);

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

  useEffect(() => {
    function handleDocumentPointerDown(event) {
      const target = event.target;

      if (
        departmentsPopoverRef.current &&
        !departmentsPopoverRef.current.contains(target)
      ) {
        setShowDepartments(false);
      }

      if (mediaPopoverRef.current && !mediaPopoverRef.current.contains(target)) {
        setShowMedia(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentPointerDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentPointerDown);
    };
  }, []);

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

  function handleClearFilters() {
    setDraftDepartmentId("");
    setDraftMedium("");
  }

  const activeDepartment = departments.find(
    (department) => String(department.departmentId) === draftDepartmentId
  );
  const activeMedium = MEDIUM_OPTIONS.flatMap((group) => group.options).find(
    (option) => option.value === draftMedium
  );
  const activeFiltersLabel = [
    activeDepartment ? activeDepartment.displayName : null,
    activeMedium ? activeMedium.label : null
  ]
    .filter(Boolean)
    .join(" · ");
  const hasActiveFilters = Boolean(activeDepartment || activeMedium);

  return (
    <RouteFrame maxWidthClassName="max-w-7xl">
      <div className="search-shell w-full max-w-full border border-border border-solid divide-y divide-border font-mono">
        <form className="search-form" onSubmit={handleSubmit}>
          <div className="px-3 py-2 text-xs text-primary">{"> type search"}</div>
          <div>
            <label className="sr-only" htmlFor="search-query">
              Query
            </label>
            <div className="search-controls flex flex-wrap items-center">
              <input
                id="search-query"
                className="search-input min-h-10 w-full appearance-none border-0 bg-transparent bg-none px-3 py-2 text-foreground shadow-none outline-none ring-0 focus:outline-none focus:ring-0"
                name="q"
                type="search"
                placeholder="artist, title, culture, medium..."
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="px-3 py-2 text-xs">
            <div className="flex flex-wrap items-start gap-3">
              <div className="relative" ref={departmentsPopoverRef}>
                <button
                  type="button"
                  className={showDepartments ? "text-action text-primary" : "text-action"}
                  aria-expanded={showDepartments}
                  onClick={() => {
                    setShowDepartments((current) => !current);
                    setShowMedia(false);
                  }}
                >
                  [departments]
                </button>
                {showDepartments ? (
                  <div
                    data-search-filter-popover="departments"
                    className="absolute left-0 top-full z-10 mt-2 w-max max-w-[calc(100vw-2rem)] max-h-56 overflow-y-auto border border-border border-solid bg-background p-3"
                  >
                    <div className="grid gap-2">
                      {departments.map((department) => (
                        <button
                          key={department.departmentId}
                          type="button"
                          className={[
                            "appearance-none border-0 bg-transparent p-0 text-left shadow-none transition-colors",
                            draftDepartmentId === String(department.departmentId)
                              ? "text-primary"
                              : "text-foreground hover:text-primary"
                          ].join(" ")}
                          onClick={() => {
                            setDraftDepartmentId(String(department.departmentId));
                            setShowDepartments(false);
                          }}
                        >
                          [{department.displayName.toLowerCase()}]
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="relative" ref={mediaPopoverRef}>
                <button
                  type="button"
                  className={showMedia ? "text-action text-primary" : "text-action"}
                  aria-expanded={showMedia}
                  onClick={() => {
                    setShowMedia((current) => !current);
                    setShowDepartments(false);
                  }}
                >
                  [media]
                </button>
                {showMedia ? (
                  <div
                    data-search-filter-popover="media"
                    className="absolute left-0 top-full z-10 mt-2 w-max max-w-[calc(100vw-2rem)] max-h-56 overflow-y-auto border border-border border-solid bg-background p-3"
                  >
                    <div className="grid gap-2">
                      {MEDIUM_OPTIONS.map((group) => (
                        <div key={group.label} className="grid gap-1">
                          <p className="m-0 text-muted-foreground">{group.label.toLowerCase()}</p>
                          <div className="grid gap-2">
                            {group.options.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={[
                                  "appearance-none border-0 bg-transparent p-0 text-left shadow-none transition-colors",
                                  draftMedium === option.value
                                    ? "text-primary"
                                    : "text-foreground hover:text-primary"
                                ].join(" ")}
                                onClick={() => {
                                  setDraftMedium(option.value);
                                  setShowMedia(false);
                                }}
                              >
                                [{option.label.toLowerCase()}]
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                className="search-button text-action"
                type="submit"
              >
                [search]
              </button>
              {hasActiveFilters ? (
                <button
                  type="button"
                  className="text-action"
                  onClick={handleClearFilters}
                >
                  [clear filters]
                </button>
              ) : null}
            </div>
          </div>
        </form>
        <div className="sr-only">
          <label className="search-label block text-xs text-muted-foreground" htmlFor="search-department">
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
          <label className="search-label block text-xs text-muted-foreground" htmlFor="search-medium">
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
        </div>
      </div>
      {hasActiveFilters ? (
        <p className="m-0 text-xs text-foreground">{activeFiltersLabel}</p>
      ) : null}
      {query && status === "loading" ? <p>Loading search results…</p> : null}
      {query && status === "error" ? <p>{error}</p> : null}
      {query && status === "success" ? (
        <>
          <ul className="search-results mt-4 list-none border-t border-border p-0">
            {results.map((result) => (
              <li key={result.objectId} className="search-result border-b border-border py-3">
                <Link className="font-medium text-primary" to={`/works/${result.objectId}`}>
                  {result.title}
                </Link>
                <p className="search-result-meta mt-1 text-sm text-muted-foreground">
                  {[result.artist, result.date, result.department].filter(Boolean).join(" · ")}
                </p>
                {!result.isPublicDomain || !result.hasImage ? (
                  <p className="search-result-flags mt-2 flex flex-wrap gap-2">
                    {!result.isPublicDomain ? (
                      <span className="search-result-flag text-xs text-muted-foreground">
                        Rights Restricted
                      </span>
                    ) : null}
                    {!result.hasImage ? (
                      <span className="search-result-flag text-xs text-muted-foreground">
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
                  aria-label="Prev page"
                  className="text-action"
                  type="button"
                  onClick={() => handlePageChange(page - 1)}
                >
                  [prev]
                </button>
              ) : null}
              <span className="text-xs text-muted-foreground">Page {page}</span>
              {results.length === SEARCH_PAGE_SIZE ? (
                <button
                  aria-label="Next page"
                  className="text-action"
                  type="button"
                  onClick={() => handlePageChange(page + 1)}
                >
                  [next]
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </RouteFrame>
  );
}
