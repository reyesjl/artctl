import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { BrailleNoiseStream } from "../components/BrailleNoiseStream.jsx";
import { RouteFrame } from "../components/RouteFrame.jsx";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.5;
const VIEWER_MODES = ["original", "edges", "detail", "composition"];
const MODE_PRESENTATION = {
  original: {
    suffix: "",
    filter: "none"
  },
  edges: {
    suffix: " (Edges)",
    filter: "grayscale(1) contrast(2.2) brightness(1.15)"
  },
  detail: {
    suffix: " (Detail)",
    filter: "contrast(1.35) saturate(1.25) brightness(1.05)"
  },
  composition: {
    suffix: " (Composition)",
    filter: "grayscale(0.35) contrast(0.9) brightness(1.1) sepia(0.18)"
  }
};

function getModeButtonClassName(isActive) {
  return isActive ? "text-action text-primary" : "text-action";
}

function normalizeStudyNote(data) {
  return {
    observe: String(data?.observe ?? "").trim(),
    context: String(data?.context ?? "").trim(),
    technique: String(data?.technique ?? "").trim(),
    sources: Array.isArray(data?.sources) ? data.sources.filter((source) => source?.url) : []
  };
}

function getStudyFields(note) {
  return [
    { label: "observe", value: note.observe },
    { label: "context", value: note.context },
    { label: "technique", value: note.technique }
  ].filter((field) => field.value);
}

export function WorkPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const { objectId } = useParams();
  const [work, setWork] = useState(null);
  const [error, setError] = useState("");
  const [aiNote, setAiNote] = useState({
    observe: "",
    context: "",
    technique: "",
    sources: []
  });
  const [aiInfoError, setAiInfoError] = useState("");
  const [aiInfoStatus, setAiInfoStatus] = useState("idle");
  const [isStudyOverlayVisible, setIsStudyOverlayVisible] = useState(false);
  const [isStudyOverlayExpanded, setIsStudyOverlayExpanded] = useState(true);
  const [scale, setScale] = useState(MIN_SCALE);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeMode, setActiveMode] = useState("original");
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
    setActiveMode("original");
    setAiNote({
      observe: "",
      context: "",
      technique: "",
      sources: []
    });
    setAiInfoError("");
    setAiInfoStatus("idle");
    setIsStudyOverlayVisible(false);
    setIsStudyOverlayExpanded(true);
    dragStateRef.current = null;
  }, [objectId, work?.imageUrl]);

  useEffect(() => {
    if (!work?.imageUrl) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "1") {
        setActiveMode("original");
      } else if (event.key === "2") {
        setActiveMode("edges");
      } else if (event.key === "3") {
        setActiveMode("detail");
      } else if (event.key === "4") {
        setActiveMode("composition");
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [work?.imageUrl]);

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
    setActiveMode("original");
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

  function handleModeChange(nextMode) {
    if (!VIEWER_MODES.includes(nextMode)) {
      return;
    }

    setActiveMode(nextMode);
  }

  async function handleLoadAiInfo() {
    if (aiInfoStatus === "loading") {
      return;
    }

    if (aiNote.observe || aiNote.context || aiNote.technique) {
      setIsStudyOverlayVisible(true);
      return;
    }

    setAiInfoStatus("loading");
    setIsStudyOverlayVisible(true);
    setIsStudyOverlayExpanded(true);
    setAiInfoError("");

    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/works/${objectId}/ai-info`, {
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) {
        setAiNote({
          observe: "",
          context: "",
          technique: "",
          sources: []
        });
        setAiInfoError(data.error || "Unable to load AI artwork info.");
        setAiInfoStatus("idle");
        return;
      }

      setAiNote(normalizeStudyNote(data));
      setAiInfoStatus("idle");
    } catch (requestError) {
      setAiNote({
        observe: "",
        context: "",
        technique: "",
        sources: []
      });
      setAiInfoError(
        requestError instanceof Error ? requestError.message : "Unable to load AI artwork info."
      );
      setAiInfoStatus("idle");
    }
  }

  const currentModePresentation = MODE_PRESENTATION[activeMode];
  const displayedTitle = work?.title
    ? `${work.title}${currentModePresentation.suffix}`
    : `Work ${objectId}`;
  const studyFields = getStudyFields(aiNote);

  return (
    <RouteFrame maxWidthClassName="max-w-7xl">
      <div aria-level="1" role="heading" className="m-0 text-lg font-semibold">
        {work?.title || `Work ${objectId}`}
      </div>
      {work ? (
        <div className="mt-4 grid gap-4">
          <div
            className="work-viewer grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)] sm:items-start"
          >
            <figure
              className="work-image-frame relative m-0 overflow-hidden border border-border bg-secondary"
              aria-label={work.imageUrl ? "Artwork viewer" : undefined}
            >
              {work.imageUrl ? (
                <>
                  <figcaption
                    className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2 rounded-sm border border-border bg-background/45 px-3 py-2 text-xs text-foreground/80 shadow-sm transition-colors hover:bg-background/60 hover:text-foreground focus-within:bg-background/60 focus-within:text-foreground"
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
                      disabled={
                        scale === MIN_SCALE &&
                        pan.x === 0 &&
                        pan.y === 0 &&
                        activeMode === "original"
                      }
                    >
                      [reset]
                    </button>
                    <span>mode</span>
                    <button
                      type="button"
                      className={getModeButtonClassName(activeMode === "original")}
                      aria-label="Original mode"
                      aria-pressed={activeMode === "original"}
                      onClick={() => handleModeChange("original")}
                    >
                      [1 original]
                    </button>
                    <button
                      type="button"
                      className={getModeButtonClassName(activeMode === "edges")}
                      aria-label="Edges mode"
                      aria-pressed={activeMode === "edges"}
                      onClick={() => handleModeChange("edges")}
                    >
                      [2 edges]
                    </button>
                    <button
                      type="button"
                      className={getModeButtonClassName(activeMode === "detail")}
                      aria-label="Detail mode"
                      aria-pressed={activeMode === "detail"}
                      onClick={() => handleModeChange("detail")}
                    >
                      [3 detail]
                    </button>
                    <button
                      type="button"
                      className={getModeButtonClassName(activeMode === "composition")}
                      aria-label="Composition mode"
                      aria-pressed={activeMode === "composition"}
                      onClick={() => handleModeChange("composition")}
                    >
                      [4 composition]
                    </button>
                    <button
                      type="button"
                      className="text-action"
                      aria-label="Study it"
                      onClick={handleLoadAiInfo}
                      disabled={aiInfoStatus === "loading"}
                    >
                      [study it]
                    </button>
                  </figcaption>
                  <div className="work-image-stage min-h-[320px] overflow-hidden">
                    <img
                      key={activeMode}
                      className="work-image block h-auto w-full select-none"
                      src={work.imageUrl}
                      alt={displayedTitle}
                      draggable="false"
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      style={{
                        cursor: scale > MIN_SCALE ? (dragStateRef.current ? "grabbing" : "grab") : "default",
                        filter: currentModePresentation.filter,
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                        transformOrigin: "center center",
                        transition: dragStateRef.current ? "none" : "transform 150ms ease"
                      }}
                    />
                  </div>
                  {isStudyOverlayVisible ? (
                    <section
                      className="absolute inset-x-3 bottom-3 z-10 max-h-[55%] overflow-y-auto border border-border bg-background/90 p-3 text-sm shadow-sm backdrop-blur-sm"
                      aria-label="Study overlay"
                    >
                      <div className="flex items-center justify-end gap-2 text-xs">
                        <span className="mr-auto text-[10px] text-muted-foreground">
                          Machine observation is not connoisseurship.
                        </span>
                        {studyFields.length > 0 && aiInfoStatus !== "loading" ? (
                          <button
                            type="button"
                            className="text-action"
                            aria-label={isStudyOverlayExpanded ? "Collapse study overlay" : "Expand study overlay"}
                            onClick={() => setIsStudyOverlayExpanded((current) => !current)}
                          >
                            {isStudyOverlayExpanded ? "[collapse]" : "[expand]"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-action"
                          aria-label="Close study overlay"
                          onClick={() => setIsStudyOverlayVisible(false)}
                        >
                          [close]
                        </button>
                      </div>
                      {aiInfoStatus === "loading" ? <BrailleNoiseStream /> : null}
                      {aiInfoError ? (
                        <p role="alert" className="m-0 mt-2 text-sm text-destructive">
                          {aiInfoError}
                        </p>
                      ) : null}
                      {studyFields.length > 0 && isStudyOverlayExpanded ? (
                        <div className="mt-2 grid gap-4">
                          {studyFields.map((field) => (
                            <section key={field.label} className="grid gap-1">
                              <p className="m-0 text-[10px] tracking-[0.12em] text-muted-foreground">
                                {field.label}
                              </p>
                              <p className="m-0 leading-6">{field.value}</p>
                              {field.label === "context" && aiNote.sources.length > 0 ? (
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                  {aiNote.sources.map((source, index) => (
                                    <a
                                      key={`${source.url}-${index}`}
                                      href={source.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-action"
                                      title={source.title || source.url}
                                    >
                                      [src]
                                    </a>
                                  ))}
                                </div>
                              ) : null}
                            </section>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  ) : null}
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
        </div>
      ) : null}
    </RouteFrame>
  );
}
