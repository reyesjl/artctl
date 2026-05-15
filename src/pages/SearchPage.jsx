import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

function normalizePageParam(value) {
  const parsedPage = Number.parseInt(value ?? "", 10);

  return Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
}

function normalizeExcludeRestrictedParam(value) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();

  if (["false", "0", "off", "no"].includes(normalizedValue)) {
    return false;
  }

  return true;
}

function formatSearchDuration(durationMs) {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  return `${(durationMs / 1000).toFixed(1)} s`;
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
const PAGINATION_WINDOW_SIZE = 10;
const RANDOM_WORK_MAX_ATTEMPTS = 5;
const RANDOM_WORK_RETRY_DELAY_MS = 500;
const RANDOM_WORK_RETRY_JITTER_MS = 250;

function buildPaginationWindow(page, totalResults) {
  const totalPages = Math.max(1, Math.ceil(totalResults / SEARCH_PAGE_SIZE));
  const windowIndex = Math.floor((page - 1) / PAGINATION_WINDOW_SIZE);
  const windowStart = windowIndex * PAGINATION_WINDOW_SIZE + 1;
  const windowEnd = Math.min(totalPages, windowStart + PAGINATION_WINDOW_SIZE - 1);

  return {
    totalPages,
    windowStart,
    windowEnd,
    pages: Array.from({ length: windowEnd - windowStart + 1 }, (_, index) => windowStart + index)
  };
}

export function SearchPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const departmentId = searchParams.get("departmentId")?.trim() ?? "";
  const medium = searchParams.get("medium")?.trim() ?? "";
  const excludeRestricted = normalizeExcludeRestrictedParam(
    searchParams.get("excludeRestricted")
  );
  const page = normalizePageParam(searchParams.get("page"));
  const [draftQuery, setDraftQuery] = useState(query);
  const [draftDepartmentId, setDraftDepartmentId] = useState(departmentId);
  const [draftMedium, setDraftMedium] = useState(medium);
  const [draftExcludeRestricted, setDraftExcludeRestricted] = useState(excludeRestricted);
  const [departments, setDepartments] = useState([]);
  const [results, setResults] = useState([]);
  const [totalResults, setTotalResults] = useState(0);
  const [searchDurationMs, setSearchDurationMs] = useState(0);
  const [error, setError] = useState("");
  const [randomWorkError, setRandomWorkError] = useState("");
  const [randomWorkStatus, setRandomWorkStatus] = useState("idle");
  const [status, setStatus] = useState("idle");
  const [showFilters, setShowFilters] = useState(false);

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
    setDraftExcludeRestricted(excludeRestricted);
  }, [excludeRestricted]);

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
      const startedAt = performance.now();

      try {
        const requestParams = new URLSearchParams({ q: query });

        if (departmentId) {
          requestParams.set("departmentId", departmentId);
        }

        if (medium) {
          requestParams.set("medium", medium);
        }

        if (!excludeRestricted) {
          requestParams.set("excludeRestricted", "false");
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
          setTotalResults(0);
          setSearchDurationMs(0);
          setError(data.error || "Unable to load search results.");
          setStatus("error");
          return;
        }

        setResults(data.results ?? []);
        setTotalResults(
          Number.isFinite(data.totalResults) ? data.totalResults : (data.results ?? []).length
        );
        setSearchDurationMs(Math.max(0, performance.now() - startedAt));
        setStatus("success");
      } catch (error) {
        if (!cancelled) {
          setResults([]);
          setTotalResults(0);
          setSearchDurationMs(0);
          setError(error instanceof Error ? error.message : "Unable to load search results.");
          setStatus("error");
        }
      }
    }

    if (!query) {
      setResults([]);
      setTotalResults(0);
      setSearchDurationMs(0);
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
  }, [apiBaseUrl, departmentId, excludeRestricted, fetchImpl, medium, page, query, searchParams]);

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

    if (!draftExcludeRestricted) {
      nextSearchParams.excludeRestricted = "false";
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

    if (!excludeRestricted) {
      nextSearchParams.excludeRestricted = "false";
    }

    if (nextPage > 1) {
      nextSearchParams.page = String(nextPage);
    }

    setSearchParams(nextSearchParams);
  }

  function handleClearFilters() {
    setDraftDepartmentId("");
    setDraftMedium("");
    setDraftExcludeRestricted(true);
  }

  async function handleRandomWork() {
    if (randomWorkStatus === "loading") {
      return;
    }

    setRandomWorkError("");
    setRandomWorkStatus("loading");
    const attemptedObjectIds = [];

    try {
      for (let attempt = 0; attempt < RANDOM_WORK_MAX_ATTEMPTS; attempt += 1) {
        const requestParams = new URLSearchParams();

        if (attemptedObjectIds.length > 0) {
          requestParams.set("excludeObjectIds", attemptedObjectIds.join(","));
        }

        const randomWorkResponse = await fetchImpl(
          `${apiBaseUrl}/api/search/random-work${requestParams.size > 0 ? `?${requestParams.toString()}` : ""}`
        );
        const randomWorkData = await randomWorkResponse.json();

        if (!randomWorkResponse.ok) {
          setRandomWorkError(randomWorkData.error || "Unable to find a random work.");
          setRandomWorkStatus("idle");
          return;
        }

        const objectId = Number.parseInt(String(randomWorkData.objectId ?? ""), 10);

        if (Number.isNaN(objectId)) {
          setRandomWorkError("Unable to find a random work.");
          setRandomWorkStatus("idle");
          return;
        }

        attemptedObjectIds.push(objectId);

        const workResponse = await fetchImpl(`${apiBaseUrl}/api/works/${objectId}`);
        const workData = await workResponse.json();

        if (!workResponse.ok) {
          setRandomWorkError(workData.error || "Unable to load work.");
          setRandomWorkStatus("idle");
          return;
        }

        if (workData.hydrationStatus === "no_image") {
          if (attempt === RANDOM_WORK_MAX_ATTEMPTS - 1) {
            setRandomWorkError("Unable to find a random work with an image right now.");
            setRandomWorkStatus("idle");
            return;
          }

          const retryDelayMs =
            RANDOM_WORK_RETRY_DELAY_MS +
            Math.floor(Math.random() * RANDOM_WORK_RETRY_JITTER_MS);

          await new Promise((resolve) => {
            window.setTimeout(resolve, retryDelayMs);
          });
          continue;
        }

        setRandomWorkStatus("idle");
        navigate(`/works/${objectId}`);
        return;
      }
    } catch (randomWorkLoadError) {
      setRandomWorkError(
        randomWorkLoadError instanceof Error
          ? randomWorkLoadError.message
          : "Unable to find a random work."
      );
      setRandomWorkStatus("idle");
    }
  }

  const activeDepartment = departments.find(
    (department) => String(department.departmentId) === draftDepartmentId
  );
  const activeMedium = MEDIUM_OPTIONS.flatMap((group) => group.options).find(
    (option) => option.value === draftMedium
  );
  const activeFiltersLabel = [
    activeDepartment ? activeDepartment.displayName : null,
    activeMedium ? activeMedium.label : null,
    !draftExcludeRestricted ? "Restricted visible" : null
  ]
    .filter(Boolean)
    .join(" · ");
  const hasActiveFilters = Boolean(activeDepartment || activeMedium || !draftExcludeRestricted);
  const activeFilterCount = [
    activeDepartment ? 1 : 0,
    activeMedium ? 1 : 0,
    !draftExcludeRestricted ? 1 : 0
  ].reduce((total, count) => total + count, 0);
  const paginationWindow = buildPaginationWindow(page, totalResults);
  const hasPreviousWindow = paginationWindow.windowStart > 1;
  const hasNextWindow = paginationWindow.windowEnd < paginationWindow.totalPages;

  return (
    <RouteFrame maxWidthClassName="max-w-7xl">
      <div className="search-shell w-full max-w-full border border-solid border-border bg-card divide-y divide-border font-mono">
        <form className="search-form" onSubmit={handleSubmit}>
          <div className="border-b border-border px-3 py-1 text-xs text-muted-foreground">
            {"> type search"}
          </div>
          <div>
            <label className="sr-only" htmlFor="search-query">
              Query
            </label>
            <div className="search-controls flex flex-wrap items-center">
              <input
                id="search-query"
                className="search-input min-h-10 w-full appearance-none border-0 bg-transparent bg-none px-3 py-3 font-mono text-sm text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0"
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
                <button
                  className="search-button text-action"
                  type="submit"
                >
                  [search]
                </button>
                <button
                  type="button"
                  className={randomWorkStatus === "loading" ? "text-action text-primary" : "text-action"}
                  disabled={randomWorkStatus === "loading"}
                  onClick={() => {
                    void handleRandomWork();
                  }}
                >
                  {randomWorkStatus === "loading" ? "[finding random work]" : "[random work]"}
                </button>
            </div>
          </div>
          {randomWorkError ? (
            <p className="m-0 px-3 pb-2 text-xs text-foreground">{randomWorkError}</p>
          ) : null}
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
          <label
            className="search-label block text-xs text-muted-foreground"
            htmlFor="search-exclude-restricted"
          >
            Hide restricted works
          </label>
          <input
            id="search-exclude-restricted"
            name="excludeRestricted"
            type="checkbox"
            checked={draftExcludeRestricted}
            onChange={(event) => setDraftExcludeRestricted(event.target.checked)}
          />
        </div>
      </div>
      <div className="grid gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          <button
            type="button"
            className={[
              "transition-colors hover:text-foreground",
              showFilters || hasActiveFilters ? "text-primary" : ""
            ].join(" ")}
            aria-expanded={showFilters}
            onClick={() => setShowFilters((current) => !current)}
          >
            [filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}]
          </button>
          {hasActiveFilters ? (
            <button
              type="button"
              className="text-action hover:text-foreground"
              onClick={handleClearFilters}
            >
              [clear]
            </button>
          ) : null}
        </div>
        {showFilters ? (
          <div className="grid gap-2 text-muted-foreground">
            <div className="flex flex-wrap items-center gap-1">
              <span className="w-16">dept:</span>
              <button
                type="button"
                className={[
                  "px-2 py-0.5 transition-colors",
                  !draftDepartmentId ? "text-primary bg-primary/10" : "hover:text-foreground"
                ].join(" ")}
                onClick={() => setDraftDepartmentId("")}
              >
                all
              </button>
              {departments.map((department) => (
                <button
                  key={department.departmentId}
                  type="button"
                  className={[
                    "px-2 py-0.5 transition-colors",
                    draftDepartmentId === String(department.departmentId)
                      ? "text-primary bg-primary/10"
                      : "hover:text-foreground"
                  ].join(" ")}
                  onClick={() => {
                    setDraftDepartmentId(String(department.departmentId));
                  }}
                >
                  {department.displayName.toLowerCase()}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-start gap-1">
              <span className="w-16 pt-0.5">media:</span>
              <button
                type="button"
                className={[
                  "px-2 py-0.5 transition-colors",
                  !draftMedium ? "text-primary bg-primary/10" : "hover:text-foreground"
                ].join(" ")}
                onClick={() => setDraftMedium("")}
              >
                all
              </button>
              {MEDIUM_OPTIONS.flatMap((group) => group.options).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={[
                    "px-2 py-0.5 transition-colors",
                    draftMedium === option.value
                      ? "text-primary bg-primary/10"
                      : "hover:text-foreground"
                  ].join(" ")}
                  onClick={() => {
                    setDraftMedium(option.value);
                  }}
                >
                  {option.label.toLowerCase()}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="w-16">rights:</span>
              <button
                type="button"
                className={[
                  "px-2 py-0.5 transition-colors",
                  draftExcludeRestricted ? "text-primary bg-primary/10" : "hover:text-foreground"
                ].join(" ")}
                onClick={() => setDraftExcludeRestricted(true)}
              >
                hide restricted
              </button>
              <button
                type="button"
                className={[
                  "px-2 py-0.5 transition-colors",
                  !draftExcludeRestricted ? "text-primary bg-primary/10" : "hover:text-foreground"
                ].join(" ")}
                onClick={() => setDraftExcludeRestricted(false)}
              >
                show restricted
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {hasActiveFilters ? (
        <p className="m-0 text-xs text-foreground">{activeFiltersLabel}</p>
      ) : null}
      {query && status === "loading" ? <p>Loading search results…</p> : null}
      {query && status === "error" ? <p>{error}</p> : null}
      {query && status === "success" ? (
        <>
          <p className="m-0 text-xs text-muted-foreground">
            {`${totalResults} ${totalResults === 1 ? "result" : "results"} · in ${formatSearchDuration(searchDurationMs)} · Page ${page}`}
          </p>
          <ul className="search-results mt-4 list-none border-t border-border p-0">
            {results.map((result) => (
              <li key={result.objectId} className="search-result border-b border-border py-3">
                <Link className="font-medium text-primary" to={`/works/${result.objectId}`}>
                  {result.title}
                </Link>
                <p className="search-result-meta mt-1 text-sm text-muted-foreground">
                  {[result.artist, result.date, result.department].filter(Boolean).join(" · ")}
                </p>
                {!result.isPublicDomain || (!result.hasImage && result.hydrationStatus === "no_image") ? (
                  <p className="search-result-flags mt-2 flex flex-wrap gap-2">
                    {!result.isPublicDomain ? (
                      <span className="search-result-flag text-xs text-muted-foreground">
                        Rights Restricted
                      </span>
                    ) : null}
                    {!result.hasImage && result.hydrationStatus === "no_image" ? (
                      <span className="search-result-flag text-xs text-muted-foreground">
                        No Image Available
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {paginationWindow.totalPages > 1 ? (
            <div className="search-pagination mt-4 flex flex-wrap items-center justify-center gap-3">
              {hasPreviousWindow ? (
                <button
                  aria-label="Prev page"
                  className="text-action"
                  type="button"
                  onClick={() =>
                    handlePageChange(
                      Math.max(1, paginationWindow.windowStart - PAGINATION_WINDOW_SIZE)
                    )
                  }
                >
                  [prev]
                </button>
              ) : null}
              {paginationWindow.pages.map((pageNumber) => (
                <button
                  key={pageNumber}
                  aria-label={`Page ${pageNumber}`}
                  aria-current={pageNumber === page ? "page" : undefined}
                  className={pageNumber === page ? "text-action text-primary" : "text-action"}
                  type="button"
                  onClick={() => handlePageChange(pageNumber)}
                >
                  [{pageNumber}]
                </button>
              ))}
              {hasNextWindow ? (
                <button
                  aria-label="Next page"
                  className="text-action"
                  type="button"
                  onClick={() => handlePageChange(paginationWindow.windowEnd + 1)}
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
