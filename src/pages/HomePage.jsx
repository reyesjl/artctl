import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

function isArtistSummary(item) {
  return typeof item?.artistSlug === "string";
}

function GalleryCard({ item }) {
  const [imageFailed, setImageFailed] = useState(false);
  const title = isArtistSummary(item) ? item.artist : item.title;
  const meta = isArtistSummary(item) ? `${item.workCount} works` : item.artist;
  const href = isArtistSummary(item) ? `/artists/${item.artistSlug}` : `/works/${item.objectId}`;
  const key = isArtistSummary(item) ? item.artistSlug : item.objectId;

  return (
    <li
      key={key}
      className="gallery-card overflow-hidden border border-solid border-border bg-card transition-colors hover:border-primary focus-within:border-primary active:border-primary"
    >
      <Link className="block h-full" to={href}>
        <figure className="gallery-card-media m-0 bg-secondary">
          {item.imageUrl && !imageFailed ? (
            <img
              className="gallery-card-image block aspect-[4/3] w-full object-cover"
              src={item.imageUrl}
              alt={title}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="gallery-card-image gallery-card-image-placeholder block aspect-[4/3] w-full bg-muted" />
          )}
        </figure>
        <div className="gallery-card-copy grid gap-1 p-3">
          <strong className="gallery-card-title text-foreground">{title}</strong>
          <p className="gallery-card-meta text-muted-foreground">{meta}</p>
        </div>
      </Link>
    </li>
  );
}

export function HomePage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [results, setResults] = useState([]);
  const [emptyState, setEmptyState] = useState(null);
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
          setEmptyState(null);
          setError(data.error || "Unable to load gallery.");
          setStatus("error");
          return;
        }

        setResults(data.results ?? []);
        setEmptyState(data.emptyState ?? null);
        setStatus("success");
      } catch (error) {
        if (!cancelled) {
          setResults([]);
          setEmptyState(null);
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
    <RouteFrame maxWidthClassName="max-w-7xl">
      {status === "loading" ? <p>Loading gallery…</p> : null}
      {status === "error" ? <p>{error}</p> : null}
      {status === "success" && results.length === 0 && emptyState ? (
        <div className="grid gap-2">
          <p>{emptyState.title}</p>
          <p>{emptyState.message}</p>
        </div>
      ) : null}
      {status === "success" ? (
        <ul
          className="gallery-grid mt-4 grid list-none gap-4 p-0 sm:grid-cols-4"
          hidden={results.length === 0}
        >
          {results.map((item) => (
            <GalleryCard key={isArtistSummary(item) ? item.artistSlug : item.objectId} item={item} />
          ))}
        </ul>
      ) : null}
    </RouteFrame>
  );
}
