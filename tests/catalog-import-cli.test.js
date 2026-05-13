import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createRuntimeCatalog } from "../server/catalog.js";
import { runCatalogImportCli } from "../server/catalog-import-cli.js";
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

describe("catalog import cli", () => {
  test("runCatalogImportCli writes a success report to stdout and returns exit code 0", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-import-cli-"));
    const csvPath = path.join(tempDir, "sample.csv");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    writeFileSync(
      csvPath,
      "Object ID,Department,Title,Is Public Domain\n" +
        "1,European Paintings,Work 1,True\n",
      "utf8"
    );

    const exitCode = await runCatalogImportCli({ csvPath, stdout, stderr });

    expect(exitCode).toBe(0);
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

  test("runCatalogImportCli writes a failure report to stderr and returns exit code 1", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCatalogImportCli({
      csvPath: "/definitely/missing/metobjects.csv",
      stdout,
      stderr
    });

    expect(exitCode).toBe(1);
    expect(stdout.toString()).toBe("");
    expect(JSON.parse(stderr.toString())).toEqual({
      ok: false,
      csvPath: "/definitely/missing/metobjects.csv",
      recordCount: 0,
      error: "Unable to read catalog CSV file."
    });
  });

  test("runCatalogImportCli persists imported records when given a SQLite database path", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-import-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCatalogImportCli({ csvPath, databasePath, stdout, stderr });

    expect(exitCode).toBe(0);
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

    await expect(catalog.getWork(5046)).resolves.toEqual({
      objectId: 5046,
      title: 'The "Shipwreck Medal"',
      artist: "Salathiel Ellis",
      date: "1845–57",
      context: "Medal - Bronze",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/5046",
      isPublicDomain: true
    });
  });

  test("runCatalogImportCli writes a stable failure report when the SQLite database path cannot be created", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-import-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "missing", "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runCatalogImportCli({ csvPath, databasePath, stdout, stderr });

    expect(exitCode).toBe(1);
    expect(stdout.toString()).toBe("");
    expect(JSON.parse(stderr.toString())).toEqual({
      ok: false,
      csvPath,
      databasePath,
      recordCount: 0,
      error: "Unable to write catalog SQLite database."
    });
  });
});
