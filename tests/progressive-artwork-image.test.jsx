import { beforeEach, expect, test, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProgressiveArtworkImage } from "../src/components/ProgressiveArtworkImage.jsx";

function installMatchMedia({ reducedMotion = false } = {}) {
  window.matchMedia = (query) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? reducedMotion : false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    }
  });
}

function installCanvasMock() {
  const context = {
    clearRect() {},
    drawImage() {},
    getImageData(width = 1, height = 1) {
      return {
        data: new Uint8ClampedArray(width * height * 4).fill(128),
        width,
        height
      };
    },
    putImageData() {},
    save() {},
    restore() {},
    setTransform() {},
    imageSmoothingEnabled: true
  };

  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => context)
  });
}

function installImageGeometry() {
  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
    configurable: true,
    get() {
      return 1200;
    }
  });
  Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
    configurable: true,
    get() {
      return 900;
    }
  });
}

function installProcessingImageMock() {
  const instances = [];

  class MockProcessingImage {
    constructor() {
      instances.push(this);
      this._src = "";
      this.crossOrigin = null;
      this.onload = null;
      this.onerror = null;
      this.naturalWidth = 1200;
      this.naturalHeight = 900;
    }

    set src(value) {
      this._src = value;
      queueMicrotask(() => {
        this.onload?.(new Event("load"));
      });
    }

    get src() {
      return this._src;
    }
  }

  window.Image = MockProcessingImage;
  return instances;
}

beforeEach(() => {
  cleanup();
  vi.useFakeTimers();
  installMatchMedia();
  installCanvasMock();
  installImageGeometry();
  installProcessingImageMock();
});

test("keeps the clean image hidden while waiting for the reconstruction source", async () => {
  class SlowProcessingImage {
    constructor() {
      this._src = "";
      this.crossOrigin = null;
      this.onload = null;
      this.onerror = null;
      this.naturalWidth = 1200;
      this.naturalHeight = 900;
    }

    set src(value) {
      this._src = value;
    }

    get src() {
      return this._src;
    }
  }

  window.Image = SlowProcessingImage;

  render(
    <ProgressiveArtworkImage
      src="https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg"
      processingSrc="/api/image-proxy?url=slow-artwork"
      alt="The Great Wave off Kanagawa"
      className="block w-full"
      sequenceProfile="gallery"
    />
  );

  const image = screen.getByRole("img", { name: "The Great Wave off Kanagawa" });

  await act(async () => {
    fireEvent.load(image);
  });

  expect(screen.getByLabelText("The Great Wave off Kanagawa reconstruction")).toHaveAttribute(
    "aria-busy",
    "true"
  );
  expect(image).toHaveStyle({
    opacity: "0"
  });
});

test("replays reconstruction when the browser has already completed the visible image load", async () => {
  Object.defineProperty(HTMLImageElement.prototype, "complete", {
    configurable: true,
    get() {
      return true;
    }
  });

  render(
    <ProgressiveArtworkImage
      src="https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg"
      processingSrc="/api/image-proxy?url=cached-artwork"
      alt="The Great Wave off Kanagawa"
      className="block w-full"
      sequenceProfile="gallery"
    />
  );

  await act(async () => {
    await Promise.resolve();
  });

  expect(screen.getByLabelText("The Great Wave off Kanagawa reconstruction")).toHaveAttribute(
    "aria-busy",
    "true"
  );
});

test("reconstructs an artwork image through staged recovery before revealing the clean image", async () => {
  render(
    <ProgressiveArtworkImage
      src="https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg"
      processingSrc="/api/image-proxy?url=https%3A%2F%2Fimages.metmuseum.org%2FCRDImages%2Fas%2Foriginal%2FDP130155.jpg"
      alt="The Great Wave off Kanagawa"
      className="block w-full"
      sequenceProfile="gallery"
    />
  );

  const image = screen.getByRole("img", { name: "The Great Wave off Kanagawa" });
  expect(image).not.toHaveAttribute("crossorigin");
  await act(async () => {
    fireEvent.load(image);
    await Promise.resolve();
  });
  expect(screen.getByLabelText("The Great Wave off Kanagawa reconstruction")).toHaveAttribute(
    "aria-busy",
    "true"
  );
  expect(screen.getByTestId("progressive-artwork-canvas")).toBeInTheDocument();
  expect(image).toHaveStyle({
    opacity: "0"
  });

  await act(async () => {
    vi.advanceTimersByTime(420);
  });

  expect(screen.getByLabelText("The Great Wave off Kanagawa reconstruction")).toHaveAttribute(
    "aria-busy",
    "false"
  );
  expect(screen.getByTestId("progressive-artwork-canvas")).toHaveClass("hidden");
  expect(image).toHaveStyle({
    opacity: "1",
    filter: "none"
  });
});

test("skips the reconstruction sequence when reduced motion is enabled", async () => {
  installMatchMedia({ reducedMotion: true });

  render(
    <ProgressiveArtworkImage
      src="https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg"
      processingSrc="/api/image-proxy?url=https%3A%2F%2Fimages.metmuseum.org%2FCRDImages%2Fas%2Foriginal%2FDP130155.jpg"
      alt="The Great Wave off Kanagawa"
      className="block w-full"
      sequenceProfile="work"
    />
  );

  const image = screen.getByRole("img", { name: "The Great Wave off Kanagawa" });
  await act(async () => {
    fireEvent.load(image);
  });
  expect(screen.getByLabelText("The Great Wave off Kanagawa reconstruction")).toHaveAttribute(
    "aria-busy",
    "false"
  );
  expect(screen.getByTestId("progressive-artwork-canvas")).toHaveClass("hidden");
  expect(image).toHaveStyle({
    opacity: "1",
    filter: "none"
  });
});

test("fails open to the clean artwork when canvas processing is unavailable", async () => {
  class FailingProcessingImage {
    constructor() {
      this._src = "";
      this.crossOrigin = null;
      this.onload = null;
      this.onerror = null;
    }

    set src(value) {
      this._src = value;
      queueMicrotask(() => {
        this.onerror?.(new Event("error"));
      });
    }

    get src() {
      return this._src;
    }
  }

  window.Image = FailingProcessingImage;

  render(
    <ProgressiveArtworkImage
      src="https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg"
      processingSrc="/api/image-proxy?url=https%3A%2F%2Fimages.metmuseum.org%2FCRDImages%2Fas%2Foriginal%2FDP130155.jpg"
      alt="The Great Wave off Kanagawa"
      className="block w-full"
      sequenceProfile="gallery"
    />
  );

  const image = screen.getByRole("img", { name: "The Great Wave off Kanagawa" });
  await act(async () => {
    fireEvent.load(image);
    await Promise.resolve();
  });
  expect(screen.getByLabelText("The Great Wave off Kanagawa reconstruction")).toHaveAttribute(
    "aria-busy",
    "false"
  );
  expect(screen.getByTestId("progressive-artwork-canvas")).toHaveClass("hidden");
  expect(image).toHaveStyle({
    opacity: "1"
  });
});

test("keeps the same canvas surface mounted while switching into reconstruction", async () => {
  render(
    <ProgressiveArtworkImage
      src="https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg"
      processingSrc="/api/image-proxy?url=https%3A%2F%2Fimages.metmuseum.org%2FCRDImages%2Fas%2Foriginal%2FDP130155.jpg"
      alt="The Great Wave off Kanagawa"
      className="block w-full"
      sequenceProfile="gallery"
    />
  );

  const image = screen.getByRole("img", { name: "The Great Wave off Kanagawa" });
  const canvasBeforeLoad = screen.getByTestId("progressive-artwork-canvas");

  await act(async () => {
    fireEvent.load(image);
    await Promise.resolve();
  });

  expect(screen.getByTestId("progressive-artwork-canvas")).toBe(canvasBeforeLoad);
});

test("loads the reconstruction source through the provided processing URL", async () => {
  const processingImages = installProcessingImageMock();

  render(
    <ProgressiveArtworkImage
      src="https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg"
      processingSrc="/api/image-proxy?url=encoded-artwork"
      alt="The Great Wave off Kanagawa"
      className="block w-full"
      sequenceProfile="gallery"
    />
  );

  const image = screen.getByRole("img", { name: "The Great Wave off Kanagawa" });

  await act(async () => {
    fireEvent.load(image);
    await Promise.resolve();
  });

  expect(processingImages).toHaveLength(1);
  expect(processingImages[0].crossOrigin).toBe("anonymous");
  expect(processingImages[0].src).toBe("/api/image-proxy?url=encoded-artwork");
});
