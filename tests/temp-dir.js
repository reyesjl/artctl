import { mkdtempSync, rmSync } from "node:fs";

const trackedTempDirs = new Set();

export function createTrackedTempDir(templatePath) {
  const tempDir = mkdtempSync(templatePath);
  trackedTempDirs.add(tempDir);
  return tempDir;
}

export function cleanupTrackedTempDirs() {
  for (const tempDir of trackedTempDirs) {
    rmSync(tempDir, { recursive: true, force: true });
  }

  trackedTempDirs.clear();
}
