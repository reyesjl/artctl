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
    <RouteFrame
      eyebrow="[viewer]"
      title={work?.title || `Work ${objectId}`}
      description={
        error
          ? error
          : work
            ? "The object viewer will render here with image-first inspection tools."
            : "Loading work detail from the Met collection through ARTCTL."
      }
    >
      {work ? (
        <div className="work-viewer">
          <figure className="work-image-frame">
            {work.imageUrl ? (
              <img className="work-image" src={work.imageUrl} alt={work.title} />
            ) : (
              <p className="work-image-unavailable">Image unavailable through the Met API.</p>
            )}
          </figure>
          <section className="work-metadata" aria-label="Work metadata">
            <dl className="work-metadata-list">
              <div>
                <dt>Artist</dt>
                <dd>{work.artist}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{work.date}</dd>
              </div>
              <div>
                <dt>Context</dt>
                <dd>{work.context}</dd>
              </div>
            </dl>
            <a href={work.metUrl} target="_blank" rel="noreferrer">
              View on the Met
            </a>
          </section>
        </div>
      ) : null}
    </RouteFrame>
  );
}
