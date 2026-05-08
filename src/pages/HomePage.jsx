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
