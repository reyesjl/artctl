import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanupTrackedTempDirs } from "./tests/temp-dir.js";

afterEach(() => {
  cleanupTrackedTempDirs();
});
