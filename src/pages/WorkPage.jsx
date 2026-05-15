import { useEffect, useRef, useState } from "react";
import { Info, MessageSquareWarning, Receipt, Share2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { BrailleNoiseStream } from "../components/BrailleNoiseStream.jsx";
import { ProgressiveArtworkImage } from "../components/ProgressiveArtworkImage.jsx";
import { buildArtworkProxyUrl } from "../lib/artwork-image-proxy.js";
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
  return isActive ? "text-action viewer-mode-button text-primary" : "text-action viewer-mode-button";
}

function getNextMode(currentMode) {
  const currentIndex = VIEWER_MODES.indexOf(currentMode);

  if (currentIndex === -1) {
    return VIEWER_MODES[0];
  }

  return VIEWER_MODES[(currentIndex + 1) % VIEWER_MODES.length];
}

function normalizeStudyNote(data) {
  return {
    observe: String(data?.observe ?? "").trim(),
    context: String(data?.context ?? "").trim(),
    technique: String(data?.technique ?? "").trim(),
    sources: Array.isArray(data?.sources) ? data.sources.filter((source) => source?.url) : []
  };
}

function readStudyResponse(data) {
  const note = data && typeof data === "object" && data.note ? data.note : data;

  return normalizeStudyNote(note);
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

export function WorkPage({ apiBaseUrl = "", fetchImpl = fetch, isAdminAuthenticated = false }) {
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
  const [aiRefreshStatus, setAiRefreshStatus] = useState("idle");
  const [aiRefreshError, setAiRefreshError] = useState("");
  const [isStudyOverlayVisible, setIsStudyOverlayVisible] = useState(false);
  const [isOpenAccessInfoVisible, setIsOpenAccessInfoVisible] = useState(false);
  const [isPrintModalVisible, setIsPrintModalVisible] = useState(false);
  const [isMobileDetailsExpanded, setIsMobileDetailsExpanded] = useState(false);
  const [isDesktopViewerHovered, setIsDesktopViewerHovered] = useState(false);
  const [imageRecoveryPhase, setImageRecoveryPhase] = useState("idle");
  const [scale, setScale] = useState(MIN_SCALE);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeMode, setActiveMode] = useState("original");
  const dragStateRef = useRef(null);
  const lastTapAtRef = useRef(0);
  const figureRef = useRef(null);
  const imageRef = useRef(null);
  const imageStageRef = useRef(null);
  const modeButtonRefs = useRef({});
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
    setAiRefreshStatus("idle");
    setAiRefreshError("");
    setIsStudyOverlayVisible(false);
    setIsOpenAccessInfoVisible(false);
    setIsPrintModalVisible(false);
    setIsMobileDetailsExpanded(false);
    setIsDesktopViewerHovered(false);
    setImageRecoveryPhase("idle");
    dragStateRef.current = null;
    lastTapAtRef.current = 0;
    studySheetTouchRef.current = null;
  }, [objectId]);

  const isImageRecoveryBlockingInteraction =
    imageRecoveryPhase === "stage-1" ||
    imageRecoveryPhase === "stage-2" ||
    imageRecoveryPhase === "stage-3" ||
    imageRecoveryPhase === "stage-4";
  const isArtworkLoading = Boolean(work?.imageUrl) && imageRecoveryPhase === "idle";

  useEffect(() => {
    if (!work?.imageUrl || isImageRecoveryBlockingInteraction) {
      return undefined;
    }

    function focusModeButton(nextMode) {
      modeButtonRefs.current[nextMode]?.focus();
    }

    function handleKeyDown(event) {
      if (event.key === "1") {
        setActiveMode("original");
        focusModeButton("original");
      } else if (event.key === "2") {
        setActiveMode("edges");
        focusModeButton("edges");
      } else if (event.key === "3") {
        setActiveMode("detail");
        focusModeButton("detail");
      } else if (event.key === "4") {
        setActiveMode("composition");
        focusModeButton("composition");
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isImageRecoveryBlockingInteraction, work?.imageUrl]);

  useEffect(() => {
    if (isMobileLayout || !work?.imageUrl || !figureRef.current || isImageRecoveryBlockingInteraction) {
      return undefined;
    }

    const figureElement = figureRef.current;
    const handleWheel = (event) => {
      if (event.target instanceof Element && event.target.closest("[data-study-overlay-scroll]")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const nextScale = event.deltaY < 0 ? scale + SCALE_STEP : scale - SCALE_STEP;

      updateScale(nextScale, {
        clientX: event.clientX,
        clientY: event.clientY
      });
    };

    figureElement.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      figureElement.removeEventListener("wheel", handleWheel);
    };
  }, [isImageRecoveryBlockingInteraction, isMobileLayout, scale, pan, work?.imageUrl]);

  function updateScale(nextScale, options = {}) {
    if (isImageRecoveryBlockingInteraction) {
      return;
    }

    const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));

    if (clampedScale === MIN_SCALE) {
      setScale(clampedScale);
      setPan({ x: 0, y: 0 });
      return;
    }

    const focalPoint = options.clientX != null && options.clientY != null
      ? { clientX: options.clientX, clientY: options.clientY }
      : null;

    if (!focalPoint || !imageStageRef.current || scale === MIN_SCALE && clampedScale === scale) {
      setScale(clampedScale);
      return;
    }

    const stageRect = imageStageRef.current.getBoundingClientRect();
    const pointFromCenter = {
      x: focalPoint.clientX - (stageRect.left + stageRect.width / 2),
      y: focalPoint.clientY - (stageRect.top + stageRect.height / 2)
    };
    const scaleRatio = clampedScale / scale;
    const anchoredPan = {
      x: pointFromCenter.x - (pointFromCenter.x - pan.x) * scaleRatio,
      y: pointFromCenter.y - (pointFromCenter.y - pan.y) * scaleRatio
    };

    setScale(clampedScale);
    setPan(anchoredPan);
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
    if (isImageRecoveryBlockingInteraction) {
      return;
    }

    updateScale(MIN_SCALE);
    setActiveMode("original");
  }

  function handleMouseDown(event) {
    if (isImageRecoveryBlockingInteraction) {
      return;
    }

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
    if (isImageRecoveryBlockingInteraction) {
      return;
    }

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
    if (isImageRecoveryBlockingInteraction) {
      dragStateRef.current = null;
      return;
    }

    if (isMobileLayout) {
      dragStateRef.current = null;
      return;
    }

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
    if (isImageRecoveryBlockingInteraction) {
      return;
    }

    if (isMobileLayout) {
      return;
    }

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
    if (isImageRecoveryBlockingInteraction) {
      dragStateRef.current = null;
      return;
    }

    if (isMobileLayout) {
      dragStateRef.current = null;
      return;
    }

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
    if (isImageRecoveryBlockingInteraction) {
      return;
    }

    if (!VIEWER_MODES.includes(nextMode)) {
      return;
    }

    setActiveMode(nextMode);
  }

  function handleCycleMode() {
    if (isImageRecoveryBlockingInteraction) {
      return;
    }

    setActiveMode((currentMode) => getNextMode(currentMode));
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

      setAiNote(readStudyResponse(data));
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

  async function handleRefreshAiInfo() {
    if (!isAdminAuthenticated || aiRefreshStatus === "loading") {
      return;
    }

    setAiRefreshStatus("loading");
    setAiRefreshError("");

    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/admin/works/${objectId}/ai-info/refresh`, {
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) {
        setAiRefreshError(data.error || "Unable to refresh AI artwork info.");
        setAiRefreshStatus("idle");
        return;
      }

      setAiNote(readStudyResponse(data));
      setAiInfoError("");
      setAiRefreshStatus("idle");
    } catch (requestError) {
      setAiRefreshError(
        requestError instanceof Error ? requestError.message : "Unable to refresh AI artwork info."
      );
      setAiRefreshStatus("idle");
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
  const workTitle = work?.title || `Work ${objectId}`;
  const imageTransform = isMobileLayout
    ? "translate(0px, 0px) scale(1)"
    : `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;
  const imageCursor = !isMobileLayout && scale > MIN_SCALE
    ? (dragStateRef.current ? "grabbing" : "grab")
    : "default";
  const imageTransition = !isMobileLayout && dragStateRef.current ? "none" : "transform 150ms ease";
  const studyFields = getStudyFields(aiNote);
  const hasStudyNote = studyFields.length > 0;
  const showExpandedMetadata = !isMobileLayout || isMobileDetailsExpanded;
  const studyContent = (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-3 py-2 text-xs backdrop-blur-sm">
        <div className="inline-flex flex-col items-start gap-1 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
          <span className="inline-flex items-center gap-2">
            <MessageSquareWarning className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Machine observation is not connoisseurship.</span>
          </span>
          <a href="/help#study-works" className="text-action text-[9px]">
            [learn more]
          </a>
        </div>
        <button
          type="button"
          className="text-action"
          aria-label={isMobileLayout ? "Close study sheet" : "Close study overlay"}
          onClick={() => setIsStudyOverlayVisible(false)}
        >
          [x]
        </button>
      </div>
      <div className="px-3 pb-3 pt-3">
        {aiInfoStatus === "loading" ? <BrailleNoiseStream /> : null}
        {aiInfoError ? (
          <p role="alert" className="m-0 text-sm text-destructive">
            {aiInfoError}
          </p>
        ) : null}
        {studyFields.length > 0 ? (
          <div className="grid gap-4">
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
      </div>
    </>
  );
  const desktopZoomLabel = isDesktopViewerHovered ? "[scroll zoom]" : "zoom";
  const desktopViewerControls = (
    <div
      className="flex w-full flex-wrap items-center gap-2 border border-border border-l-0 border-r-0 border-t-0 bg-background/45 px-3 py-2 text-xs text-foreground/80 shadow-sm transition-colors hover:bg-background/60 hover:text-foreground focus-within:bg-background/60 focus-within:text-foreground"
      aria-label="Artwork inspection controls"
    >
      <span>{desktopZoomLabel}</span>
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
        ref={(element) => {
          modeButtonRefs.current.original = element;
        }}
        className={getModeButtonClassName(activeMode === "original")}
        aria-label="Original mode"
        aria-pressed={activeMode === "original"}
        onClick={() => handleModeChange("original")}
      >
        [1 original]
      </button>
      <button
        type="button"
        ref={(element) => {
          modeButtonRefs.current.edges = element;
        }}
        className={getModeButtonClassName(activeMode === "edges")}
        aria-label="Edges mode"
        aria-pressed={activeMode === "edges"}
        onClick={() => handleModeChange("edges")}
      >
        [2 edges]
      </button>
      <button
        type="button"
        ref={(element) => {
          modeButtonRefs.current.detail = element;
        }}
        className={getModeButtonClassName(activeMode === "detail")}
        aria-label="Detail mode"
        aria-pressed={activeMode === "detail"}
        onClick={() => handleModeChange("detail")}
      >
        [3 detail]
      </button>
      <button
        type="button"
        ref={(element) => {
          modeButtonRefs.current.composition = element;
        }}
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
  const mobileViewerControls = (
    <div
      className="grid grid-cols-2 gap-2 rounded-sm border border-border bg-background/45 px-3 py-2 text-xs text-foreground/80 shadow-sm"
      aria-label="Artwork inspection controls"
    >
      <button
        type="button"
        className="text-action text-left"
        aria-label="Cycle analysis mode"
        onClick={handleCycleMode}
      >
        {`[mode: ${activeMode}]`}
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
      {!isMobileLayout ? (
        <div aria-level="1" role="heading" className="m-0 text-lg font-semibold">
          {workTitle}
        </div>
      ) : null}
      {work ? (
        <div className="mt-4 grid gap-4">
          <div
            className="work-viewer grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)] sm:items-start"
          >
            <figure
              ref={figureRef}
              className={`work-image-frame relative m-0 overflow-hidden border bg-secondary transition-colors ${
                !isMobileLayout && isDesktopViewerHovered ? "border-primary" : "border-border"
              }`}
              aria-label={work.imageUrl ? "Artwork viewer" : undefined}
              onMouseEnter={() => {
                if (!isMobileLayout) {
                  setIsDesktopViewerHovered(true);
                }
              }}
              onMouseLeave={() => {
                if (!isMobileLayout) {
                  setIsDesktopViewerHovered(false);
                }
              }}
            >
              {work.imageUrl ? (
                <>
                  {!isMobileLayout ? (
                    <figcaption className="absolute inset-x-0 top-0 z-10">
                      {desktopViewerControls}
                    </figcaption>
                  ) : null}
                  <div ref={imageStageRef} className="work-image-stage relative min-h-[320px] overflow-hidden">
                    <ProgressiveArtworkImage
                      key={work.imageUrl}
                      ref={imageRef}
                      className="work-image block h-auto w-full select-none"
                      src={work.imageUrl}
                      processingSrc={buildArtworkProxyUrl(work.imageUrl, { apiBaseUrl })}
                      alt={displayedTitle}
                      sequenceProfile="work"
                      onReconstructionStateChange={setImageRecoveryPhase}
                      draggable="false"
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      onTouchStart={isMobileLayout ? undefined : handleTouchStart}
                      onTouchMove={isMobileLayout ? undefined : handleTouchMove}
                      onTouchEnd={isMobileLayout ? undefined : handleTouchEnd}
                      onTouchCancel={isMobileLayout ? undefined : handleTouchEnd}
                      style={{
                        cursor: imageCursor,
                        filter: currentModePresentation.filter,
                        transform: imageTransform,
                        transformOrigin: "center center",
                        transition: imageTransition
                      }}
                    />
                    {isArtworkLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground pointer-events-none">
                        Loading image...
                      </div>
                    ) : null}
                  </div>
                  {isStudyOverlayVisible && !isMobileLayout ? (
                    <section
                      data-study-overlay-scroll
                      className="absolute inset-x-0 bottom-0 z-10 max-h-[55%] overflow-y-auto border border-border border-b-0 border-l-0 border-r-0 bg-background/90 p-0 text-sm shadow-sm backdrop-blur-sm"
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
            {work.imageUrl && isMobileLayout ? mobileViewerControls : null}
            {isMobileLayout ? (
              <div aria-level="1" role="heading" className="m-0 text-lg font-semibold">
                {workTitle}
              </div>
            ) : null}
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
                    {work.dimensions ? (
                      <div className="work-metadata-item grid gap-1">
                        <dt className="text-xs text-muted-foreground">
                          Dimensions
                        </dt>
                        <dd className="m-0">{work.dimensions}</dd>
                      </div>
                    ) : null}
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
                  {work.imageUrl ? (
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
                  ) : null}
                  {isAdminAuthenticated && hasStudyNote ? (
                    <div className="grid gap-1">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-primary"
                        aria-label={
                          aiRefreshStatus === "loading"
                            ? "Refreshing study note"
                            : "Refresh study note"
                        }
                        disabled={aiRefreshStatus === "loading"}
                        onClick={handleRefreshAiInfo}
                      >
                        <span>
                          {aiRefreshStatus === "loading"
                            ? "[refreshing study note]"
                            : "[refresh study note]"}
                        </span>
                      </button>
                      {aiRefreshStatus === "loading" ? (
                        <p className="m-0 text-xs text-muted-foreground">
                          Refreshing study note...
                        </p>
                      ) : null}
                      {aiRefreshError ? (
                        <p role="alert" className="m-0 text-xs text-destructive">
                          {aiRefreshError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
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
            className="fixed inset-x-3 top-20 z-50 mx-auto max-w-md border border-border bg-card px-4 py-4 text-sm text-card-foreground shadow-2xl"
          >
            <div className="grid gap-3">
              <p className="m-0">The ability to purchase prints from here is coming soon!</p>
              <p className="m-0 text-xs text-muted-foreground">
                When print purchasing is enabled, that money helps cover the ongoing costs of
                running ARTCTL.
              </p>
              <div className="grid gap-1.5 text-xs text-muted-foreground">
                <p className="m-0">
                  <span className="text-foreground">[server costs]</span> A portion goes toward
                  hosting and keeping the site online.
                </p>
                <p className="m-0">
                  <span className="text-foreground">["study it"]</span> A portion goes toward LLM
                  calls that power &quot;Study it&quot; so visitors can learn more from art.
                </p>
                <p className="m-0">
                  <span className="text-foreground">[print service]</span> A portion goes to the
                  actual print service for printing and shipping your order.
                </p>
                <p className="m-0">
                  <span className="text-foreground">[maintenance]</span> The rest supports the
                  software team maintaining ARTCTL over its lifetime.
                </p>
              </div>
              <p className="m-0 text-xs text-muted-foreground">
                Purchasing a print goes a long way toward supporting the project.
              </p>
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
            className="fixed inset-x-3 top-20 z-50 mx-auto max-w-md border border-border bg-card px-4 py-4 text-sm text-card-foreground shadow-2xl"
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
            className="fixed inset-x-0 bottom-0 z-50 max-h-[50vh] overflow-y-auto border-t border-border bg-background p-0 text-sm shadow-2xl"
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
