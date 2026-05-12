import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

export function WorkPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const { objectId } = useParams();
  const [work, setWork] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadWork() {
      const response = await fetchImpl(`${apiBaseUrl}/api/works/${objectId}`);
      const data = await response.json();

      if (!cancelled) {
        if (!response.ok) {
          setError(data.error || "Unable to load work.");
          setWork(null);
          return;
        }

        setError("");
        setWork(data);
      }
    }

    setError("");
    setWork(null);
    loadWork();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, fetchImpl, objectId]);

  return (
    <RouteFrame maxWidthClassName="max-w-7xl">
      <div aria-level="1" role="heading" className="m-0 text-lg font-semibold">
        {work?.title || `Work ${objectId}`}
      </div>
      {work ? (
        <div
          className="work-viewer mt-4 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)] sm:items-start"
        >
          <figure className="work-image-frame m-0 border border-border bg-secondary">
            {work.imageUrl ? (
              <img className="work-image block h-auto w-full" src={work.imageUrl} alt={work.title} />
            ) : (
              <p className="work-image-unavailable m-0 px-4 py-6 text-center text-muted-foreground">
                Image unavailable through the Met API.
              </p>
            )}
          </figure>
          <section
            className="work-metadata grid gap-3 border-t border-border sm:mt-0 sm:border-l sm:border-t-0 sm:pl-4"
            aria-label="Work metadata"
          >
            <dl className="work-metadata-list grid gap-3">
              <div className="work-metadata-item grid gap-1">
                <dt className="text-xs text-muted-foreground">
                  Artist
                </dt>
                <dd className="m-0">{work.artist}</dd>
              </div>
              <div className="work-metadata-item grid gap-1">
                <dt className="text-xs text-muted-foreground">
                  Date
                </dt>
                <dd className="m-0">{work.date}</dd>
              </div>
              <div className="work-metadata-item grid gap-1">
                <dt className="text-xs text-muted-foreground">
                  Context
                </dt>
                <dd className="m-0">{work.context}</dd>
              </div>
            </dl>
            <a href={work.metUrl} target="_blank" rel="noreferrer" className="text-primary">
              View on the Met
            </a>
          </section>
        </div>
      ) : null}
    </RouteFrame>
  );
}
