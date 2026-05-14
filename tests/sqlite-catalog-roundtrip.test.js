import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createRuntimeCatalog } from "../server/catalog.js";
import { runCatalogImport } from "../server/catalog-import.js";
import { createTrackedTempDir } from "./temp-dir.js";

function buildSyntheticCatalogCsv(rowCount) {
  const header = [
    "Object ID",
    "Department",
    "Title",
    "Artist Display Name",
    "Object Date",
    "Object Name",
    "Medium",
    "Is Public Domain"
  ].join(",");
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const objectId = index + 1;
    return [
      objectId,
      `Department ${String((index % 5) + 1)}`,
      `Synthetic Work ${objectId}`,
      `Artist ${objectId}`,
      `19${String(index % 100).padStart(2, "0")}`,
      "Painting",
      "Oil on canvas",
      "True"
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

describe("sqlite catalog round trip", () => {
  test("runCatalogImport persists a real subset into SQLite and createRuntimeCatalog reads it back", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-sqlite-catalog-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(runCatalogImport({ csvPath, databasePath })).toEqual({
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

    const catalog = createRuntimeCatalog({ databasePath });

    expect(catalog.isReady()).toBe(true);
    await expect(catalog.searchCollection({ query: "mantel" })).resolves.toEqual({
      query: "mantel",
      results: [
        {
          objectId: 4926,
          title: "Mantel",
          artist: "Unknown",
          date: "ca. 1800",
          department: "The American Wing",
          imageUrl: "",
          isPublicDomain: true,
          hasImage: false
        }
      ]
    });
    await expect(catalog.searchCollection({ query: "medal shipwreck" })).resolves.toEqual({
      query: "medal shipwreck",
      results: [
        {
          objectId: 5046,
          title: 'The "Shipwreck Medal"',
          artist: "Salathiel Ellis",
          date: "1845–57",
          department: "The American Wing",
          imageUrl: "",
          isPublicDomain: true,
          hasImage: false
        }
      ]
    });
    await expect(catalog.getWork(5046)).resolves.toEqual({
      objectId: 5046,
      title: 'The "Shipwreck Medal"',
      artist: "Salathiel Ellis",
      date: "1845–57",
      context: "Medal - Bronze",
      dimensions: "Diam. 2 5/8 in. (6.7 cm)",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/5046",
      isPublicDomain: true
    });
    await expect(catalog.getDepartments()).resolves.toEqual({
      departments: [{ departmentId: 1, displayName: "The American Wing" }]
    });
  });

  test("runCatalogImport rebuilds the SQLite catalog when importing into the same database twice", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-sqlite-catalog-"));
    const firstCsvPath = path.join(tempDir, "first.csv");
    const secondCsvPath = path.join(tempDir, "second.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");

    writeFileSync(
      firstCsvPath,
      "Object ID,Department,Title,Artist Display Name,Object Date,Object Name,Medium,Is Public Domain\n" +
        "1,European Paintings,Old Work,Artist One,1900,Painting,Oil on canvas,True\n" +
        "2,European Paintings,Stable Work,Artist Two,1901,Painting,Oil on canvas,True\n",
      "utf8"
    );
    writeFileSync(
      secondCsvPath,
      "Object ID,Department,Title,Artist Display Name,Object Date,Object Name,Medium,Is Public Domain\n" +
        "2,European Paintings,Updated Work,Artist Two,1902,Painting,Oil on canvas,True\n" +
        "3,Drawings and Prints,New Work,Artist Three,1903,Print,Ink on paper,False\n",
      "utf8"
    );

    expect(runCatalogImport({ csvPath: firstCsvPath, databasePath }).ok).toBe(true);
    expect(runCatalogImport({ csvPath: secondCsvPath, databasePath })).toEqual({
      ok: true,
      csvPath: secondCsvPath,
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

    const catalog = createRuntimeCatalog({ databasePath });

    await expect(catalog.searchCollection({ query: "work" })).resolves.toEqual({
      query: "work",
      results: [
        {
          objectId: 2,
          title: "Updated Work",
          artist: "Artist Two",
          date: "1902",
          department: "European Paintings",
          imageUrl: "",
          isPublicDomain: true,
          hasImage: false
        },
        {
          objectId: 3,
          title: "New Work",
          artist: "Artist Three",
          date: "1903",
          department: "Drawings and Prints",
          imageUrl: "",
          isPublicDomain: false,
          hasImage: false
        }
      ]
    });
    await expect(catalog.getGalleryPage()).resolves.toEqual({
      results: [],
      emptyState: {
        title: "Gallery coming soon",
        message: "Curated groups have not been configured yet."
      }
    });
    await expect(catalog.getWork(1)).resolves.toBeNull();
  });

  test("runCatalogImport persists 1000 rows and limits the SQLite gallery to the first 24 work cards", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-sqlite-catalog-"));
    const csvPath = path.join(tempDir, "synthetic-1000.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");

    writeFileSync(csvPath, buildSyntheticCatalogCsv(1000), "utf8");

    expect(runCatalogImport({ csvPath, databasePath })).toEqual({
      ok: true,
      csvPath,
      databasePath,
      recordCount: 1000,
      summary: {
        totalRows: 1000,
        importedRows: 1000,
        skippedRows: 0,
        hasFailures: false,
        firstSkippedRowNumber: null,
        lastSkippedRowNumber: null,
        skippedByReason: {}
      },
      failures: []
    });

    const catalog = createRuntimeCatalog({ databasePath });

    expect(catalog.isReady()).toBe(true);
    await expect(catalog.searchCollection({ query: "synthetic work 1000" })).resolves.toEqual({
      query: "synthetic work 1000",
      results: [
        {
          objectId: 1000,
          title: "Synthetic Work 1000",
          artist: "Artist 1000",
          date: "1999",
          department: "Department 5",
          imageUrl: "",
          isPublicDomain: true,
          hasImage: false
        }
      ]
    });
    await expect(catalog.getGalleryPage()).resolves.toEqual({
      results: [],
      emptyState: {
        title: "Gallery coming soon",
        message: "Curated groups have not been configured yet."
      }
    });
  });

  test("getGalleryPage returns hydrated curated entries from the first 24 curated slots", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-sqlite-catalog-"));
    const csvPath = path.join(tempDir, "hydrated-gallery.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");

    writeFileSync(
      csvPath,
      "Object ID,Department,Title,Artist Display Name,Object Date,Object Name,Medium,Is Public Domain,Primary Image Small\n" +
        "1,European Paintings,No Image Work,Artist One,1900,Painting,Oil on canvas,True,\n" +
        "2,European Paintings,Hydrated Work 2,Artist Two,1901,Painting,Oil on canvas,True,https://images.metmuseum.org/small/2.jpg\n" +
        "3,European Paintings,Hydrated Work 3,Artist Three,1902,Painting,Oil on canvas,True,https://images.metmuseum.org/small/3.jpg\n" +
        Array.from({ length: 30 }, (_, index) => {
          const objectId = index + 4;
          return `${objectId},European Paintings,Hydrated Work ${objectId},Artist ${objectId},190${index},Painting,Oil on canvas,True,https://images.metmuseum.org/small/${objectId}.jpg`;
        }).join("\n") +
        "\n",
      "utf8"
    );

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const catalog = createRuntimeCatalog({ databasePath });
    for (const objectId of Array.from({ length: 24 }, (_, index) => index + 1)) {
      await catalog.addAdminGalleryItem(objectId);
    }

    await expect(catalog.getGalleryPage()).resolves.toEqual({
      results: Array.from({ length: 23 }, (_, index) => {
        const objectId = index + 2;
        return {
          objectId,
          title: `Hydrated Work ${objectId}`,
          artist: objectId === 2 ? "Artist Two" : objectId === 3 ? "Artist Three" : `Artist ${objectId}`,
          imageUrl: `https://images.metmuseum.org/small/${objectId}.jpg`
        };
      })
    });
  });
});
