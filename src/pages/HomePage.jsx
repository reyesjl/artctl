import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

export function HomePage({ apiBaseUrl = "", fetchImpl = fetch }) {
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
    <RouteFrame title="Gallery">
      {status === "loading" ? <p>Loading gallery…</p> : null}
      {status === "error" ? <p>{error}</p> : null}
      {status === "success" ? (
        <ul className="gallery-grid mt-4 grid list-none gap-4 p-0 sm:grid-cols-4">
          {results.map((work) => (
            <li
              key={work.objectId}
              className="gallery-card overflow-hidden border border-border bg-card transition-colors hover:border-primary focus-within:border-primary"
            >
              <Link className="block h-full" to={`/works/${work.objectId}`}>
                <figure className="gallery-card-media m-0 bg-secondary">
                  {work.imageUrl ? (
                    <img
                      className="gallery-card-image block aspect-[4/3] w-full object-cover"
                      src={work.imageUrl}
                      alt={work.title}
                    />
                  ) : (
                    <div className="gallery-card-image gallery-card-image-placeholder block aspect-[4/3] w-full bg-muted" />
                  )}
                </figure>
                <div className="gallery-card-copy grid gap-1 p-3">
                  <strong className="gallery-card-title text-foreground">
                    {work.title}
                  </strong>
                  <p className="gallery-card-meta text-muted-foreground">
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
