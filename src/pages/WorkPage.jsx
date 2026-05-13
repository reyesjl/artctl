import { useEffect, useRef, useState } from "react";
import { Info, Receipt, Share2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { BrailleNoiseStream } from "../components/BrailleNoiseStream.jsx";
import { RouteFrame } from "../components/RouteFrame.jsx";
import { shareCurrentPage } from "../lib/share.js";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.5;
const MOBILE_SHEET_CLOSE_THRESHOLD = 80;
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

function useIsMobileLayout() {
  const getMatches = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 639px)").matches
      : false;
  const [isMobileLayout, setIsMobileLayout] = useState(getMatches);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const updateLayout = (event) => {
      setIsMobileLayout(event.matches);
    };

    setIsMobileLayout(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateLayout);

    return () => {
      mediaQuery.removeEventListener("change", updateLayout);
    };
  }, []);

  return isMobileLayout;
}

function getTouchDistance(touches) {
  if (touches.length < 2) {
    return 0;
  }

  const [firstTouch, secondTouch] = touches;
  return Math.hypot(secondTouch.clientX - firstTouch.clientX, secondTouch.clientY - firstTouch.clientY);
}

export function WorkPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const { objectId } = useParams();
  const isMobileLayout = useIsMobileLayout();
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
  const [isOpenAccessInfoVisible, setIsOpenAccessInfoVisible] = useState(false);
  const [isPrintModalVisible, setIsPrintModalVisible] = useState(false);
  const [isMobileDetailsExpanded, setIsMobileDetailsExpanded] = useState(false);
  const [scale, setScale] = useState(MIN_SCALE);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeMode, setActiveMode] = useState("original");
  const dragStateRef = useRef(null);
  const lastTapAtRef = useRef(0);
  const imageRef = useRef(null);
  const imageStageRef = useRef(null);
  const studySheetTouchRef = useRef(null);

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
        setIsMobileDetailsExpanded(!data.imageUrl);
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
    setIsOpenAccessInfoVisible(false);
    setIsPrintModalVisible(false);
    setIsMobileDetailsExpanded(false);
    dragStateRef.current = null;
    lastTapAtRef.current = 0;
    studySheetTouchRef.current = null;
  }, [objectId]);

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

  function clampPan(nextPan, nextScale) {
    if (!isMobileLayout || !imageRef.current || !imageStageRef.current) {
      return nextPan;
    }

    const imageRect = imageRef.current.getBoundingClientRect();
    const stageRect = imageStageRef.current.getBoundingClientRect();

    if (!imageRect.width || !imageRect.height || !stageRect.width || !stageRect.height) {
      return nextPan;
    }

    const maxOffsetX = Math.max(0, ((imageRect.width * nextScale) - stageRect.width) / 2);
    const maxOffsetY = Math.max(0, ((imageRect.height * nextScale) - stageRect.height) / 2);

    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, nextPan.x)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, nextPan.y))
    };
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
      kind: "mouse",
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
      kind: "mouse",
      x: event.clientX,
      y: event.clientY
    };

    setPan((currentPan) =>
      clampPan(
        {
          x: currentPan.x + deltaX,
          y: currentPan.y + deltaY
        },
        scale
      )
    );
  }

  function handleMouseUp() {
    dragStateRef.current = null;
  }

  function handleTouchStart(event) {
    if (event.touches.length === 2) {
      dragStateRef.current = {
        kind: "pinch",
        distance: getTouchDistance(event.touches),
        scale
      };
      return;
    }

    if (scale === MIN_SCALE || event.touches.length !== 1) {
      dragStateRef.current = null;
      return;
    }

    const touch = event.touches[0];

    dragStateRef.current = {
      kind: "pan",
      startX: touch.clientX,
      startY: touch.clientY,
      x: touch.clientX,
      y: touch.clientY
    };
  }

  function handleTouchMove(event) {
    if (!dragStateRef.current) {
      return;
    }

    if (dragStateRef.current.kind === "pinch" && event.touches.length === 2) {
      const nextDistance = getTouchDistance(event.touches);

      if (dragStateRef.current.distance > 0) {
        updateScale(dragStateRef.current.scale * (nextDistance / dragStateRef.current.distance));
      }

      return;
    }

    if (scale === MIN_SCALE || event.touches.length !== 1 || dragStateRef.current.kind !== "pan") {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - dragStateRef.current.x;
    const deltaY = touch.clientY - dragStateRef.current.y;

    dragStateRef.current = {
      kind: "pan",
      startX: dragStateRef.current.startX,
      startY: dragStateRef.current.startY,
      x: touch.clientX,
      y: touch.clientY
    };

    setPan((currentPan) =>
      clampPan(
        {
          x: currentPan.x + deltaX,
          y: currentPan.y + deltaY
        },
        scale
      )
    );
  }

  function handleTouchEnd(event) {
    const tappedOnce =
      event.changedTouches.length === 1 &&
      dragStateRef.current &&
      dragStateRef.current.kind === "pan" &&
      Math.abs(event.changedTouches[0].clientX - dragStateRef.current.startX) < 8 &&
      Math.abs(event.changedTouches[0].clientY - dragStateRef.current.startY) < 8;
    const now = Date.now();

    if (tappedOnce && now - lastTapAtRef.current < 300) {
      handleResetView();
      lastTapAtRef.current = 0;
      dragStateRef.current = null;
      return;
    }

    if (tappedOnce) {
      lastTapAtRef.current = now;
    }

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

  function handleStudySheetTouchStart(event) {
    if (event.touches.length !== 1) {
      studySheetTouchRef.current = null;
      return;
    }

    studySheetTouchRef.current = {
      startY: event.touches[0].clientY,
      currentY: event.touches[0].clientY
    };
  }

  function handleStudySheetTouchMove(event) {
    if (!studySheetTouchRef.current || event.touches.length !== 1) {
      return;
    }

    studySheetTouchRef.current = {
      ...studySheetTouchRef.current,
      currentY: event.touches[0].clientY
    };
  }

  function handleStudySheetTouchEnd() {
    if (!studySheetTouchRef.current) {
      return;
    }

    if (studySheetTouchRef.current.currentY - studySheetTouchRef.current.startY >= MOBILE_SHEET_CLOSE_THRESHOLD) {
      setIsStudyOverlayVisible(false);
    }

    studySheetTouchRef.current = null;
  }

  const currentModePresentation = MODE_PRESENTATION[activeMode];
  const displayedTitle = work?.title
    ? `${work.title}${currentModePresentation.suffix}`
    : `Work ${objectId}`;
  const studyFields = getStudyFields(aiNote);
  const showExpandedMetadata = !isMobileLayout || isMobileDetailsExpanded;
  const studyContent = (
    <>
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
          aria-label={isMobileLayout ? "Close study sheet" : "Close study overlay"}
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
    </>
  );
  const viewerControls = (
    <div
      className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-background/45 px-3 py-2 text-xs text-foreground/80 shadow-sm transition-colors hover:bg-background/60 hover:text-foreground focus-within:bg-background/60 focus-within:text-foreground"
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
    </div>
  );

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
                  {!isMobileLayout ? (
                    <figcaption className="absolute left-3 top-3 z-10">
                      {viewerControls}
                    </figcaption>
                  ) : null}
                  <div ref={imageStageRef} className="work-image-stage min-h-[320px] overflow-hidden">
                    <img
                      key={activeMode}
                      ref={imageRef}
                      className="work-image block h-auto w-full select-none"
                      src={work.imageUrl}
                      alt={displayedTitle}
                      draggable="false"
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                      style={{
                        cursor: scale > MIN_SCALE ? (dragStateRef.current ? "grabbing" : "grab") : "default",
                        filter: currentModePresentation.filter,
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                        transformOrigin: "center center",
                        transition: dragStateRef.current ? "none" : "transform 150ms ease"
                      }}
                    />
                  </div>
                  {isStudyOverlayVisible && !isMobileLayout ? (
                    <section
                      className="absolute inset-x-3 bottom-3 z-10 max-h-[55%] overflow-y-auto border border-border bg-background/90 p-3 text-sm shadow-sm backdrop-blur-sm"
                      aria-label="Study overlay"
                    >
                      {studyContent}
                    </section>
                  ) : null}
                </>
              ) : (
                <p className="work-image-unavailable m-0 px-4 py-6 text-center text-muted-foreground">
                  Image unavailable through the Met API.
                </p>
              )}
            </figure>
            {work.imageUrl && isMobileLayout ? viewerControls : null}
            <section
              className="work-metadata grid gap-3 border-t border-border sm:mt-0 sm:border-l sm:border-t-0 sm:pl-4"
              aria-label="Work metadata"
            >
              {isMobileLayout ? (
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 border border-border bg-secondary px-3 py-2 text-left"
                  aria-expanded={isMobileDetailsExpanded}
                  aria-label={isMobileDetailsExpanded ? "Hide work details" : "Show work details"}
                  onClick={() => setIsMobileDetailsExpanded((current) => !current)}
                >
                  <span className="grid gap-1">
                    <span>{work.artist}</span>
                    <span className="text-xs text-muted-foreground">{work.date}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isMobileDetailsExpanded ? "[hide]" : "[details]"}
                  </span>
                </button>
              ) : null}
              {showExpandedMetadata ? (
                <>
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
                  {work.imageUrl && work.isPublicDomain ? (
                    <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <span
                        aria-label="Open Access"
                        className="inline-flex h-5 w-5 items-center justify-center border border-border text-[10px] text-foreground"
                      >
                        OA
                      </span>
                      <span>Public Domain</span>
                      <button
                        type="button"
                        aria-label="Open Access and Public Domain info"
                        className="inline-flex items-center text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setIsOpenAccessInfoVisible(true);
                        }}
                      >
                        <Info className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-primary"
                    onClick={() => {
                      void shareCurrentPage({
                        title: work.title,
                        text: work.artist
                      });
                    }}
                  >
                    <span>[Share this Work]</span>
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="[Buy a Print]"
                    className="inline-flex items-center gap-1 text-xs text-primary"
                    onClick={() => {
                      setIsPrintModalVisible(true);
                    }}
                  >
                    <span>[Buy a Print]</span>
                    <Receipt className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}
      {isPrintModalVisible ? (
        <>
          <button
            type="button"
            aria-label="Close print modal backdrop"
            className="fixed inset-0 z-40 bg-background/60"
            onClick={() => {
              setIsPrintModalVisible(false);
            }}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Buy a Print"
            className="fixed inset-x-3 top-20 z-50 mx-auto w-full max-w-md border border-border bg-card px-4 py-4 text-sm text-card-foreground shadow-2xl"
          >
            <div className="grid gap-3">
              <p className="m-0">The ability to purchase prints from here is coming soon!</p>
              <div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setIsPrintModalVisible(false);
                  }}
                >
                  [close]
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}
      {isOpenAccessInfoVisible ? (
        <>
          <button
            type="button"
            aria-label="Close open access info backdrop"
            className="fixed inset-0 z-40 bg-background/60"
            onClick={() => {
              setIsOpenAccessInfoVisible(false);
            }}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Open Access and Public Domain"
            className="fixed inset-x-3 top-20 z-50 mx-auto w-full max-w-md border border-border bg-card px-4 py-4 text-sm text-card-foreground shadow-2xl"
          >
            <div className="grid gap-3">
              <p className="m-0">
                Open Access means the Met has made the image available to use.
              </p>
              <p className="m-0">
                Public domain means the work is free of known copyright restrictions.
              </p>
              <div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setIsOpenAccessInfoVisible(false);
                  }}
                >
                  [close]
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}
      {isStudyOverlayVisible && isMobileLayout ? (
        <>
          <button
            type="button"
            aria-label="Close study sheet backdrop"
            className="fixed inset-0 z-40 bg-background/60"
            onClick={() => setIsStudyOverlayVisible(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Study sheet"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[50vh] overflow-y-auto border-t border-border bg-background p-4 text-sm shadow-2xl"
            onTouchStart={handleStudySheetTouchStart}
            onTouchMove={handleStudySheetTouchMove}
            onTouchEnd={handleStudySheetTouchEnd}
            onTouchCancel={handleStudySheetTouchEnd}
          >
            {studyContent}
          </section>
        </>
      ) : null}
    </RouteFrame>
  );
}
