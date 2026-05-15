import { forwardRef, useEffect, useRef, useState } from "react";
import { useSettings } from "../settings-provider.jsx";

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];

const SEQUENCE_PROFILES = {
  gallery: {
    stageDurations: [100, 120, 120, 80],
    blockCells: 18,
    ditherCells: 36,
    diffusionCells: 56
  },
  work: {
    stageDurations: [220, 260, 280, 180],
    blockCells: 14,
    ditherCells: 40,
    diffusionCells: 72
  }
};

function clampChannel(value) {
  return Math.max(0, Math.min(255, value));
}

function getGrayscale(red, green, blue) {
  return Math.round((0.299 * red) + (0.587 * green) + (0.114 * blue));
}

function createProcessingCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function deriveRasterSize(width, height, cellsOnLongEdge) {
  const longestEdge = Math.max(width, height);
  const scale = cellsOnLongEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function buildBasePixels(image, targetWidth, targetHeight) {
  const canvas = createProcessingCanvas(targetWidth, targetHeight);
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas 2D context unavailable.");
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  return context.getImageData(0, 0, targetWidth, targetHeight);
}

function createOutputImageData(targetWidth, targetHeight) {
  const canvas = createProcessingCanvas(targetWidth, targetHeight);
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas 2D context unavailable.");
  }

  return context.getImageData(0, 0, targetWidth, targetHeight);
}

function buildBlockStage(image, targetWidth, targetHeight) {
  const imageData = buildBasePixels(image, targetWidth, targetHeight);
  const output = createOutputImageData(targetWidth, targetHeight);

  for (let index = 0; index < imageData.data.length; index += 4) {
    const grayscale = getGrayscale(
      imageData.data[index],
      imageData.data[index + 1],
      imageData.data[index + 2]
    );

    output.data[index] = grayscale;
    output.data[index + 1] = grayscale;
    output.data[index + 2] = grayscale;
    output.data[index + 3] = 255;
  }

  return output;
}

function buildBayerStage(image, targetWidth, targetHeight) {
  const imageData = buildBasePixels(image, targetWidth, targetHeight);
  const output = createOutputImageData(targetWidth, targetHeight);

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const index = ((y * targetWidth) + x) * 4;
      const grayscale = getGrayscale(
        imageData.data[index],
        imageData.data[index + 1],
        imageData.data[index + 2]
      );
      const threshold = ((BAYER_4X4[y % 4][x % 4] + 0.5) / 16) * 255;
      const value = grayscale >= threshold ? 255 : 0;

      output.data[index] = value;
      output.data[index + 1] = value;
      output.data[index + 2] = value;
      output.data[index + 3] = 255;
    }
  }

  return output;
}

function buildDiffusionStage(image, targetWidth, targetHeight) {
  const imageData = buildBasePixels(image, targetWidth, targetHeight);
  const output = createOutputImageData(targetWidth, targetHeight);
  const tones = [0, 85, 170, 255];
  const grayscale = new Float32Array(targetWidth * targetHeight);

  for (let index = 0; index < grayscale.length; index += 1) {
    const pixelIndex = index * 4;
    grayscale[index] = getGrayscale(
      imageData.data[pixelIndex],
      imageData.data[pixelIndex + 1],
      imageData.data[pixelIndex + 2]
    );
  }

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const index = (y * targetWidth) + x;
      const oldValue = grayscale[index];
      const nextTone = tones.reduce((closestTone, tone) => (
        Math.abs(tone - oldValue) < Math.abs(closestTone - oldValue) ? tone : closestTone
      ), tones[0]);
      const error = oldValue - nextTone;

      grayscale[index] = nextTone;

      if (x + 1 < targetWidth) {
        grayscale[index + 1] += error * (7 / 16);
      }
      if (y + 1 < targetHeight && x > 0) {
        grayscale[index + targetWidth - 1] += error * (3 / 16);
      }
      if (y + 1 < targetHeight) {
        grayscale[index + targetWidth] += error * (5 / 16);
      }
      if (y + 1 < targetHeight && x + 1 < targetWidth) {
        grayscale[index + targetWidth + 1] += error * (1 / 16);
      }
    }
  }

  for (let index = 0; index < grayscale.length; index += 1) {
    const pixelIndex = index * 4;
    const value = clampChannel(Math.round(grayscale[index]));

    output.data[pixelIndex] = value;
    output.data[pixelIndex + 1] = value;
    output.data[pixelIndex + 2] = value;
    output.data[pixelIndex + 3] = 255;
  }

  return output;
}

function renderStageToCanvas(canvas, image, stageKind, profile) {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context unavailable.");
  }

  const naturalWidth = image.naturalWidth || 1;
  const naturalHeight = image.naturalHeight || 1;
  const cellsOnLongEdge =
    stageKind === "blocks"
      ? profile.blockCells
      : stageKind === "bayer"
        ? profile.ditherCells
        : profile.diffusionCells;
  const rasterSize = deriveRasterSize(naturalWidth, naturalHeight, cellsOnLongEdge);
  const stageImageData =
    stageKind === "blocks"
      ? buildBlockStage(image, rasterSize.width, rasterSize.height)
      : stageKind === "bayer"
        ? buildBayerStage(image, rasterSize.width, rasterSize.height)
        : buildDiffusionStage(image, rasterSize.width, rasterSize.height);
  const bufferCanvas = createProcessingCanvas(rasterSize.width, rasterSize.height);
  const bufferContext = bufferCanvas.getContext("2d");

  if (!bufferContext) {
    throw new Error("Canvas 2D context unavailable.");
  }

  bufferContext.putImageData(stageImageData, 0, 0);

  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  context.clearRect(0, 0, naturalWidth, naturalHeight);
  context.imageSmoothingEnabled = false;
  context.drawImage(bufferCanvas, 0, 0, naturalWidth, naturalHeight);
}

function createIntersectionController(element, onVisible) {
  if (typeof window === "undefined" || typeof window.IntersectionObserver !== "function" || !element) {
    onVisible();
    return () => {};
  }

  const observer = new window.IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      onVisible();
    }
  }, {
    rootMargin: "120px 0px"
  });

  observer.observe(element);

  return () => {
    observer.disconnect();
  };
}

export const ProgressiveArtworkImage = forwardRef(function ProgressiveArtworkImage({
  src,
  processingSrc = "",
  alt,
  className = "",
  style,
  sequenceProfile = "gallery",
  startWhenVisible = false,
  onReconstructionStateChange,
  onLoad,
  onError,
  ...imgProps
}, forwardedRef) {
  const profile = SEQUENCE_PROFILES[sequenceProfile] ?? SEQUENCE_PROFILES.gallery;
  const { ditherEnabled } = useSettings();
  const [phase, setPhase] = useState("idle");
  const [isSourceReady, setIsSourceReady] = useState(false);
  const [processingImage, setProcessingImage] = useState(null);
  const [processingStatus, setProcessingStatus] = useState("idle");
  const [isVisible, setIsVisible] = useState(!startWhenVisible);
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const timerIdsRef = useRef([]);
  const isReconstructionEnabled = Boolean(processingSrc) && ditherEnabled;

  useEffect(() => {
    onReconstructionStateChange?.(phase);
  }, [onReconstructionStateChange, phase]);

  useEffect(() => {
    setPhase("idle");
    setIsSourceReady(false);
    setProcessingImage(null);
    setProcessingStatus("idle");
    setIsVisible(!startWhenVisible);
    timerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timerIdsRef.current = [];
  }, [src, startWhenVisible]);

  useEffect(() => {
    if (!startWhenVisible) {
      return undefined;
    }

    return createIntersectionController(wrapperRef.current, () => {
      setIsVisible(true);
    });
  }, [startWhenVisible, src]);

  useEffect(() => {
    const image = imageRef.current;

    if (!src || !image || isSourceReady) {
      return;
    }

    if (image.complete && image.naturalWidth > 0) {
      setIsSourceReady(true);
    }
  }, [isSourceReady, src]);

  useEffect(() => {
    if (!processingSrc || !isSourceReady || !ditherEnabled) {
      return undefined;
    }

    const nextProcessingImage = new window.Image();
    let cancelled = false;

    setProcessingStatus("loading");
    nextProcessingImage.crossOrigin = "anonymous";
    nextProcessingImage.onload = () => {
      if (cancelled) {
        return;
      }

      setProcessingImage(nextProcessingImage);
      setProcessingStatus("ready");
    };
    nextProcessingImage.onerror = () => {
      if (cancelled) {
        return;
      }

      setProcessingImage(null);
      setProcessingStatus("failed");
      setPhase("complete");
    };
    nextProcessingImage.src = processingSrc;

    return () => {
      cancelled = true;
      nextProcessingImage.onload = null;
      nextProcessingImage.onerror = null;
    };
  }, [ditherEnabled, isSourceReady, processingSrc]);

  useEffect(() => {
    if (!src || !isSourceReady || !isVisible) {
      return undefined;
    }

    if (!ditherEnabled) {
      setPhase("complete");
      return undefined;
    }

    if (processingStatus === "failed") {
      setPhase("complete");
      return undefined;
    }

    if (processingStatus !== "ready" || !processingImage) {
      return undefined;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      setPhase("complete");
      return undefined;
    }

    try {
      renderStageToCanvas(canvas, processingImage, "blocks", profile);
      setPhase("stage-1");
    } catch {
      setPhase("complete");
      return undefined;
    }

    const stageDefinitions = [
      {
        duration: profile.stageDurations[0],
        nextPhase: "stage-2",
        render() {
          renderStageToCanvas(canvas, processingImage, "bayer", profile);
        }
      },
      {
        duration: profile.stageDurations[1],
        nextPhase: "stage-3",
        render() {
          renderStageToCanvas(canvas, processingImage, "diffusion", profile);
        }
      },
      {
        duration: profile.stageDurations[2],
        nextPhase: "stage-4"
      },
      {
        duration: profile.stageDurations[3],
        nextPhase: "complete"
      }
    ];

    let elapsed = 0;

    stageDefinitions.forEach((stageDefinition) => {
      elapsed += stageDefinition.duration;
      const timerId = window.setTimeout(() => {
        try {
          stageDefinition.render?.();
          setPhase(stageDefinition.nextPhase);
        } catch {
          setPhase("complete");
        }
      }, elapsed);

      timerIdsRef.current.push(timerId);
    });

    return () => {
      timerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId));
      timerIdsRef.current = [];
    };
  }, [ditherEnabled, isSourceReady, isVisible, processingImage, processingStatus, profile, src]);

  const isCanvasVisible = phase === "stage-1" || phase === "stage-2" || phase === "stage-3";
  const isPreparingReconstruction = isReconstructionEnabled && phase === "idle";
  const imageOpacity = phase === "stage-4" || phase === "complete" || !isReconstructionEnabled ? 1 : 0;
  const stageFilter = phase === "stage-4"
    ? "saturate(0.55) contrast(0.93) brightness(1.04)"
    : "none";
  const composedFilter = [style?.filter, stageFilter]
    .filter((value) => value && value !== "none")
    .join(" ") || "none";

  return (
    <div
      ref={wrapperRef}
      aria-busy={isCanvasVisible || phase === "stage-4" || isPreparingReconstruction ? "true" : "false"}
      aria-label={`${alt} reconstruction`}
      className="relative block"
    >
      <img
        {...imgProps}
        ref={(element) => {
          imageRef.current = element;

          if (typeof forwardedRef === "function") {
            forwardedRef(element);
          } else if (forwardedRef) {
            forwardedRef.current = element;
          }
        }}
        src={src}
        alt={alt}
        className={className}
        style={{
          ...style,
          opacity: imageOpacity,
          filter: composedFilter
        }}
        onLoad={(event) => {
          setIsSourceReady(true);
          onLoad?.(event);
        }}
        onError={(event) => {
          setPhase("complete");
          onError?.(event);
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={isCanvasVisible ? `${className} absolute inset-0 h-full w-full` : "hidden"}
        data-testid="progressive-artwork-canvas"
        style={{
          imageRendering: "pixelated",
          pointerEvents: "none"
        }}
      />
    </div>
  );
});
