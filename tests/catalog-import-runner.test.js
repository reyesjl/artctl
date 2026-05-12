import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runCatalogImport } from "../server/catalog-import.js";
import { createTrackedTempDir } from "./temp-dir.js";

describe("catalog import runner", () => {
  test("runCatalogImport returns a serializable success result for a valid CSV path", () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-import-runner-"));
    const csvPath = path.join(tempDir, "sample.csv");

    writeFileSync(
      csvPath,
      "Object ID,Department,Title,Is Public Domain\n" +
        "1,European Paintings,Work 1,True\n" +
        "2,Arms and Armor,Work 2,False\n",
      "utf8"
    );

    expect(runCatalogImport(csvPath)).toEqual({
      ok: true,
      csvPath,
      recordCount: 2,
      records: [
        expect.objectContaining({
          objectID: 1,
          title: "Work 1",
          departmentId: 2
        }),
        expect.objectContaining({
          objectID: 2,
          title: "Work 2",
          departmentId: 1
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
  });

  test("runCatalogImport returns a serializable failure result when the CSV file cannot be read", () => {
    expect(runCatalogImport("/definitely/missing/metobjects.csv")).toEqual({
      ok: false,
      csvPath: "/definitely/missing/metobjects.csv",
      recordCount: 0,
      error: "Unable to read catalog CSV file."
    });
  });
});
