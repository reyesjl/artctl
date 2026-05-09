import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";
import { themeColor } from "../themeStyles.js";

function normalizePageParam(value) {
  const parsedPage = Number.parseInt(value ?? "", 10);

  return Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
}

function buildGallerySearchParams({ page, shuffle }) {
  const nextSearchParams = {};

  if (page > 1) {
    nextSearchParams.page = String(page);
  }

  if (shuffle) {
    nextSearchParams.shuffle = shuffle;
  }

  return nextSearchParams;
}

function createShuffleSeed() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getGalleryCardStyles() {
  return {
    grid: {
      display: "grid",
      gap: "16px",
      padding: "0",
      listStyle: "none"
    },
    card: {
      backgroundColor: themeColor("--card"),
      border: `1px solid ${themeColor("--border")}`
    },
    media: {
      backgroundColor: themeColor("--secondary")
    },
    image: {
      display: "block",
      width: "100%",
      aspectRatio: "4 / 3",
      objectFit: "cover"
    },
    placeholder: {
      backgroundColor: themeColor("--muted")
    },
    copy: {
      display: "grid",
      gap: "4px",
      padding: "12px"
    },
    title: {
      color: themeColor("--foreground")
    },
    meta: {
      color: themeColor("--muted-foreground")
    },
    controls: {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px"
    },
    button: {
      backgroundColor: themeColor("--secondary"),
      border: `1px solid ${themeColor("--input")}`,
      color: themeColor("--foreground")
    }
  };
}

export function HomePage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const styles = getGalleryCardStyles();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = normalizePageParam(searchParams.get("page"));
  const shuffle = searchParams.get("shuffle")?.trim() ?? "";
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadGallery() {
      setStatus("loading");
      setError("");

      try {
        const loadedResults = [];
        let nextHasMore = false;

        for (let currentPage = 1; currentPage <= page; currentPage += 1) {
          const requestParams = new URLSearchParams();

          if (currentPage > 1) {
            requestParams.set("page", String(currentPage));
          }

          if (shuffle) {
            requestParams.set("shuffle", shuffle);
          }

          const requestPath = requestParams.size
            ? `${apiBaseUrl}/api/gallery?${requestParams.toString()}`
            : `${apiBaseUrl}/api/gallery`;
          const response = await fetchImpl(requestPath);
          const data = await response.json();

          if (cancelled) {
            return;
          }

          if (!response.ok) {
            setResults([]);
            setHasMore(false);
            setError(data.error || "Unable to load gallery.");
            setStatus("error");
            return;
          }

          loadedResults.push(...(data.results ?? []));
          nextHasMore = Boolean(data.hasMore);
        }

        setResults(loadedResults);
        setHasMore(nextHasMore);
        setStatus("success");
      } catch (error) {
        if (!cancelled) {
          setResults([]);
          setHasMore(false);
          setError(error instanceof Error ? error.message : "Unable to load gallery.");
          setStatus("error");
        }
      }
    }

    loadGallery();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, fetchImpl, page, shuffle]);

  function handleLoadMore() {
    setSearchParams(
      buildGallerySearchParams({
        page: page + 1,
        shuffle
      })
    );
  }

  function handleShuffle() {
    setSearchParams(
      buildGallerySearchParams({
        page: 1,
        shuffle: createShuffleSeed()
      })
    );
  }

  return (
    <RouteFrame
      eyebrow="[gallery]"
      title="Gallery"
      description={
        shuffle
          ? "Showing The Met's highlighted works in a stable shuffled order."
          : "Showing The Met's highlighted works in deterministic order."
      }
    >
      <div className="mt-4" style={styles.controls}>
        <button type="button" className="rounded-sm px-3 py-2" style={styles.button} onClick={handleShuffle}>
          Shuffle
        </button>
        {status === "success" && hasMore ? (
          <button
            type="button"
            className="rounded-sm px-3 py-2"
            style={styles.button}
            onClick={handleLoadMore}
          >
            Load More
          </button>
        ) : null}
      </div>
      {status === "loading" ? <p>Loading gallery…</p> : null}
      {status === "error" ? <p>{error}</p> : null}
      {status === "success" ? (
        <ul className="gallery-grid mt-4 grid-cols-1 sm:grid-cols-4" style={styles.grid}>
          {results.map((work) => (
            <li
              key={work.objectId}
              className="gallery-card overflow-hidden transition-colors hover:border-[hsl(var(--primary))] focus-within:border-[hsl(var(--primary))]"
              style={styles.card}
            >
              <Link className="block h-full" to={`/works/${work.objectId}`}>
                <figure className="gallery-card-media m-0" style={styles.media}>
                  {work.imageUrl ? (
                    <img
                      className="gallery-card-image"
                      src={work.imageUrl}
                      alt={work.title}
                      style={styles.image}
                    />
                  ) : (
                    <div
                      className="gallery-card-image gallery-card-image-placeholder"
                      style={{ ...styles.image, ...styles.placeholder }}
                    />
                  )}
                </figure>
                <div className="gallery-card-copy" style={styles.copy}>
                  <strong className="gallery-card-title" style={styles.title}>
                    {work.title}
                  </strong>
                  <p className="gallery-card-meta" style={styles.meta}>
                    {work.artist}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </RouteFrame>
  );
}
