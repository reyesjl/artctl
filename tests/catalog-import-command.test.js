import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createRuntimeCatalog } from "../server/catalog.js";
import { runCatalogImportCommand } from "../server/catalog-import-command.js";
import { createTrackedTempDir } from "./temp-dir.js";

function createWritableBuffer() {
  let output = "";

  return {
    write(chunk) {
      output += String(chunk);
    },
    toString() {
      return output;
    }
  };
}

function spawnNodeWithoutWarnings(commandPath, args, options = {}) {
  return spawnSync("node", [commandPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1",
      ...(options.env ?? {})
    }
  });
}

describe("catalog import command", () => {
  test("runCatalogImportCommand reads argv, writes the report, and sets exitCode", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-import-command-"));
    const csvPath = path.join(tempDir, "sample.csv");
    const missingEnvFilePath = path.join(tempDir, "missing.env.local");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const processLike = {
      argv: ["node", "server/catalog-import-command.js", csvPath],
      env: {
        ARTCTL_ENV_FILE_PATH: missingEnvFilePath
      },
      stdout,
      stderr,
      exitCode: undefined
    };

    writeFileSync(
      csvPath,
      "Object ID,Department,Title,Is Public Domain\n" +
        "1,European Paintings,Work 1,True\n",
      "utf8"
    );

    await runCatalogImportCommand(processLike);

    expect(processLike.exitCode).toBe(0);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      csvPath,
      recordCount: 1,
      records: [
        expect.objectContaining({
          objectID: 1,
          title: "Work 1"
        })
      ],
      summary: {
        totalRows: 1,
        importedRows: 1,
        skippedRows: 0,
        hasFailures: false,
        firstSkippedRowNumber: null,
        lastSkippedRowNumber: null,
        skippedByReason: {}
      },
      failures: []
    });
    expect(stderr.toString()).toBe("");
  });

  test("catalog-import-command.js runs as a real node entrypoint", () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-import-command-exec-"));
    const csvPath = path.join(tempDir, "sample.csv");
    const missingEnvFilePath = path.join(tempDir, "missing.env.local");
    const commandPath = path.resolve("server/catalog-import-command.js");

    writeFileSync(
      csvPath,
      "Object ID,Department,Title,Is Public Domain\n" +
        "1,European Paintings,Work 1,True\n",
      "utf8"
    );

    const result = spawnNodeWithoutWarnings(commandPath, [csvPath], {
      env: {
        ARTCTL_ENV_FILE_PATH: missingEnvFilePath
      }
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      csvPath,
      recordCount: 1,
      records: [
        expect.objectContaining({
          objectID: 1,
          title: "Work 1"
        })
      ],
      summary: {
        totalRows: 1,
        importedRows: 1,
        skippedRows: 0,
        hasFailures: false,
        firstSkippedRowNumber: null,
        lastSkippedRowNumber: null,
        skippedByReason: {}
      },
      failures: []
    });
    expect(result.stderr).toBe("");
  });

  test("catalog-import-command.js imports the checked-in real MetObjects subset fixture", () => {
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-import-command-exec-"));
    const missingEnvFilePath = path.join(tempDir, "missing.env.local");
    const commandPath = path.resolve("server/catalog-import-command.js");

    const result = spawnNodeWithoutWarnings(commandPath, [csvPath], {
      env: {
        ARTCTL_ENV_FILE_PATH: missingEnvFilePath
      }
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      csvPath,
      recordCount: 2,
      records: [
        expect.objectContaining({
          objectID: 4926,
          title: "Mantel",
          medium: "Wood, composition ornament"
        }),
        expect.objectContaining({
          objectID: 5046,
          title: 'The "Shipwreck Medal"',
          artistDisplayName: "Salathiel Ellis"
        })
      ],
      summary: {
        totalRows: 2,
        importedRows: 2,
        skippedRows: 0,
        hasFailures: false,
        firstSkippedRowNumber: null,
        lastSkippedRowNumber: null,
        skippedByReason: {}
      },
      failures: []
    });
    expect(result.stderr).toBe("");
  });

  test("runCatalogImportCommand forwards a SQLite database path from argv", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-import-command-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const processLike = {
      argv: ["node", "server/catalog-import-command.js", csvPath, databasePath],
      stdout,
      stderr,
      exitCode: undefined
    };

    await runCatalogImportCommand(processLike);

    expect(processLike.exitCode).toBe(0);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      csvPath,
      databasePath,
      recordCount: 2,
      summary: {
        totalRows: 2,
        importedRows: 2,
        skippedRows: 0,
        hasFailures: false,
        firstSkippedRowNumber: null,
        lastSkippedRowNumber: null,
        skippedByReason: {}
      },
      failures: []
    });
    expect(stderr.toString()).toBe("");

    const catalog = createRuntimeCatalog({ databasePath });

    await expect(catalog.getWork(4926)).resolves.toEqual({
      objectId: 4926,
      title: "Mantel",
      artist: "Unknown",
      date: "ca. 1800",
      context: "Mantel - Wood, composition ornament",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/4926"
    });
  });

  test("runCatalogImportCommand loads the SQLite database path from .env.local", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-import-command-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const envFilePath = path.join(tempDir, ".env.local");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const processLike = {
      argv: ["node", "server/catalog-import-command.js", csvPath],
      env: {
        ARTCTL_ENV_FILE_PATH: envFilePath
      },
      stdout,
      stderr,
      exitCode: undefined
    };

    writeFileSync(envFilePath, `CATALOG_DATABASE_PATH=${databasePath}\n`, "utf8");

    await runCatalogImportCommand(processLike);

    expect(processLike.exitCode).toBe(0);
    expect(existsSync(databasePath)).toBe(true);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      csvPath,
      databasePath,
      recordCount: 2,
      summary: {
        totalRows: 2,
        importedRows: 2,
        skippedRows: 0,
        hasFailures: false,
        firstSkippedRowNumber: null,
        lastSkippedRowNumber: null,
        skippedByReason: {}
      },
      failures: []
    });
    expect(stderr.toString()).toBe("");
  });

  test("catalog-import-command.js persists to SQLite when run as a real node entrypoint", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-import-command-exec-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const commandPath = path.resolve("server/catalog-import-command.js");

    const result = spawnNodeWithoutWarnings(commandPath, [csvPath, databasePath]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      csvPath,
      databasePath,
      recordCount: 2,
      summary: {
        totalRows: 2,
        importedRows: 2,
        skippedRows: 0,
        hasFailures: false,
        firstSkippedRowNumber: null,
        lastSkippedRowNumber: null,
        skippedByReason: {}
      },
      failures: []
    });
    expect(result.stderr).toBe("");

    const catalog = createRuntimeCatalog({ databasePath });

    await expect(catalog.getWork(5046)).resolves.toEqual({
      objectId: 5046,
      title: 'The "Shipwreck Medal"',
      artist: "Salathiel Ellis",
      date: "1845–57",
      context: "Medal - Bronze",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/5046"
    });
  });

  test("catalog-import-command.js writes a stable database-path failure report when run as a real node entrypoint", () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-import-command-exec-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "missing", "catalog.sqlite");
    const commandPath = path.resolve("server/catalog-import-command.js");

    const result = spawnNodeWithoutWarnings(commandPath, [csvPath, databasePath]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      csvPath,
      databasePath,
      recordCount: 0,
      error: "Unable to write catalog SQLite database."
    });
  });
});
