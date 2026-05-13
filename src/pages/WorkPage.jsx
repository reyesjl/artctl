import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.5;

export function WorkPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const { objectId } = useParams();
  const [work, setWork] = useState(null);
  const [error, setError] = useState("");
  const [scale, setScale] = useState(MIN_SCALE);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef(null);

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

  useEffect(() => {
    setScale(MIN_SCALE);
    setPan({ x: 0, y: 0 });
    dragStateRef.current = null;
  }, [objectId, work?.imageUrl]);

  function updateScale(nextScale) {
    const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));

    setScale(clampedScale);

    if (clampedScale === MIN_SCALE) {
      setPan({ x: 0, y: 0 });
    }
  }

  function handleZoomIn() {
    updateScale(scale + SCALE_STEP);
  }

  function handleZoomOut() {
    updateScale(scale - SCALE_STEP);
  }

  function handleResetView() {
    updateScale(MIN_SCALE);
  }

  function handleMouseDown(event) {
    if (scale === MIN_SCALE) {
      return;
    }

    dragStateRef.current = {
      x: event.clientX,
      y: event.clientY
    };
  }

  function handleMouseMove(event) {
    if (!dragStateRef.current || scale === MIN_SCALE) {
      return;
    }

    const deltaX = event.clientX - dragStateRef.current.x;
    const deltaY = event.clientY - dragStateRef.current.y;

    dragStateRef.current = {
      x: event.clientX,
      y: event.clientY
    };

    setPan((currentPan) => ({
      x: currentPan.x + deltaX,
      y: currentPan.y + deltaY
    }));
  }

  function handleMouseUp() {
    dragStateRef.current = null;
  }

  return (
    <RouteFrame maxWidthClassName="max-w-7xl">
      <div aria-level="1" role="heading" className="m-0 text-lg font-semibold">
        {work?.title || `Work ${objectId}`}
      </div>
      {work ? (
        <div
          className="work-viewer mt-4 grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)] sm:items-start"
        >
          <figure
            className="work-image-frame relative m-0 overflow-hidden border border-border bg-secondary"
            aria-label={work.imageUrl ? "Artwork viewer" : undefined}
          >
            {work.imageUrl ? (
              <>
                <figcaption
                  className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-sm border border-border bg-background/45 px-3 py-2 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-background/60 focus-within:bg-background/60"
                  aria-label="Artwork inspection controls"
                >
                  <span>zoom</span>
                  <button
                    type="button"
                    className="text-action"
                    aria-label="Zoom in"
                    onClick={handleZoomIn}
                    disabled={scale >= MAX_SCALE}
                  >
                    [+]
                  </button>
                  <button
                    type="button"
                    className="text-action"
                    aria-label="Zoom out"
                    onClick={handleZoomOut}
                    disabled={scale <= MIN_SCALE}
                  >
                    [-]
                  </button>
                  <button
                    type="button"
                    className="text-action"
                    aria-label="Reset view"
                    onClick={handleResetView}
                    disabled={scale === MIN_SCALE && pan.x === 0 && pan.y === 0}
                  >
                    [reset]
                  </button>
                </figcaption>
                <div className="work-image-stage min-h-[320px] overflow-hidden">
                  <img
                    className="work-image block h-auto w-full select-none"
                    src={work.imageUrl}
                    alt={work.title}
                    draggable="false"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    style={{
                      cursor: scale > MIN_SCALE ? (dragStateRef.current ? "grabbing" : "grab") : "default",
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                      transformOrigin: "center center",
                      transition: dragStateRef.current ? "none" : "transform 150ms ease"
                    }}
                  />
                </div>
              </>
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
