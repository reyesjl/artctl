import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";
import { themeColor } from "../themeStyles.js";

function getViewerStyles() {
  return {
    viewer: {
      display: "grid",
      gap: "16px"
    },
    frame: {
      margin: 0,
      border: `1px solid ${themeColor("--border")}`,
      backgroundColor: themeColor("--secondary")
    },
    image: {
      display: "block",
      width: "100%",
      height: "auto"
    },
    unavailable: {
      margin: 0,
      padding: "24px 16px",
      color: themeColor("--muted-foreground"),
      textAlign: "center"
    },
    metadata: {
      display: "grid",
      gap: "12px",
      paddingTop: "16px",
      borderTop: `1px solid ${themeColor("--border")}`
    },
    metadataList: {
      display: "grid",
      gap: "12px",
      margin: 0
    },
    metadataItem: {
      display: "grid",
      gap: "4px"
    },
    metadataLabel: {
      color: themeColor("--muted-foreground")
    },
    metadataLink: {
      color: themeColor("--primary")
    }
  };
}

export function WorkPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const styles = getViewerStyles();
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
        <div
          className="work-viewer mt-4 sm:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)] sm:items-start"
          style={styles.viewer}
        >
          <figure className="work-image-frame" style={styles.frame}>
            {work.imageUrl ? (
              <img className="work-image" src={work.imageUrl} alt={work.title} style={styles.image} />
            ) : (
              <p className="work-image-unavailable" style={styles.unavailable}>
                Image unavailable through the Met API.
              </p>
            )}
          </figure>
          <section
            className="work-metadata sm:mt-0 sm:border-l sm:border-t-0 sm:border-[hsl(var(--border))] sm:pl-4"
            aria-label="Work metadata"
            style={styles.metadata}
          >
            <dl className="work-metadata-list" style={styles.metadataList}>
              <div style={styles.metadataItem}>
                <dt className="text-xs" style={styles.metadataLabel}>
                  Artist
                </dt>
                <dd className="m-0">{work.artist}</dd>
              </div>
              <div style={styles.metadataItem}>
                <dt className="text-xs" style={styles.metadataLabel}>
                  Date
                </dt>
                <dd className="m-0">{work.date}</dd>
              </div>
              <div style={styles.metadataItem}>
                <dt className="text-xs" style={styles.metadataLabel}>
                  Context
                </dt>
                <dd className="m-0">{work.context}</dd>
              </div>
            </dl>
            <a href={work.metUrl} target="_blank" rel="noreferrer" style={styles.metadataLink}>
              View on the Met
            </a>
          </section>
        </div>
      ) : null}
    </RouteFrame>
  );
}
