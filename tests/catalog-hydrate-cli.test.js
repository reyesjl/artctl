import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createRuntimeCatalog } from "../server/catalog.js";
import { runCatalogHydrationCli } from "../server/catalog-hydrate-cli.js";
import { runCatalogImport } from "../server/catalog-import.js";
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

describe("catalog hydrate cli", () => {
  test("runCatalogHydrationCli hydrates one pending object and persists its image fields", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      limit: 1,
      stdout,
      stderr,
      fetchImpl: async (url) => {
        expect(url).toBe("https://collectionapi.metmuseum.org/public/collection/v1/objects/4926");

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              objectID: 4926,
              primaryImage: "https://images.metmuseum.org/primary/4926.jpg",
              primaryImageSmall: "https://images.metmuseum.org/small/4926.jpg"
            };
          }
        };
      }
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 1,
      hydratedCount: 1,
      summary: {
        hydrated: 1,
        no_image: 0,
        retry: 0,
        failed: 0
      },
      results: [
        {
          objectId: 4926,
          hydrationStatus: "hydrated",
          dimensions: "",
          primaryImage: "https://images.metmuseum.org/primary/4926.jpg",
          primaryImageSmall: "https://images.metmuseum.org/small/4926.jpg"
        }
      ]
    });
    expect(stderr.toString()).toBe("");

    const catalog = createRuntimeCatalog({ databasePath });

    await expect(catalog.getWork(4926)).resolves.toEqual({
      objectId: 4926,
      title: "Mantel",
      artist: "Unknown",
      date: "ca. 1800",
      context: "Mantel - Wood, composition ornament",
      dimensions: "",
      hydrationStatus: "hydrated",
      imageUrl: "https://images.metmuseum.org/primary/4926.jpg",
      metUrl: "http://www.metmuseum.org/art/collection/search/4926",
      isPublicDomain: true
    });
  });

  test("runCatalogHydrationCli marks a pending object as no_image when the Met object has no primary images", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      limit: 1,
      stdout,
      stderr,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            objectID: 4926,
            primaryImage: "",
            primaryImageSmall: ""
          };
        }
      })
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 1,
      hydratedCount: 0,
      summary: {
        hydrated: 0,
        no_image: 1,
        retry: 0,
        failed: 0
      },
      results: [
        {
          objectId: 4926,
          hydrationStatus: "no_image",
          dimensions: "",
          primaryImage: "",
          primaryImageSmall: ""
        }
      ]
    });
    expect(stderr.toString()).toBe("");

    const catalog = createRuntimeCatalog({ databasePath });

    await expect(catalog.getWork(4926)).resolves.toEqual({
      objectId: 4926,
      title: "Mantel",
      artist: "Unknown",
      date: "ca. 1800",
      context: "Mantel - Wood, composition ornament",
      dimensions: "",
      hydrationStatus: "no_image",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/4926",
      isPublicDomain: true
    });
  });

  test("runCatalogHydrationCli hydrates an explicit objectId instead of the default pending order", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const requestedUrls = [];

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      objectIds: [5046],
      stdout,
      stderr,
      fetchImpl: async (url) => {
        requestedUrls.push(url);

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              objectID: 5046,
              primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
              primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
            };
          }
        };
      }
    });

    expect(exitCode).toBe(0);
    expect(requestedUrls).toEqual([
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/5046"
    ]);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 1,
      hydratedCount: 1,
      summary: {
        hydrated: 1,
        no_image: 0,
        retry: 0,
        failed: 0
      },
      results: [
        {
          objectId: 5046,
          hydrationStatus: "hydrated",
          dimensions: "",
          primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
          primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
        }
      ]
    });
    expect(stderr.toString()).toBe("");

    const catalog = createRuntimeCatalog({ databasePath });

    await expect(catalog.getWork(4926)).resolves.toEqual({
      objectId: 4926,
      title: "Mantel",
      artist: "Unknown",
      date: "ca. 1800",
      context: "Mantel - Wood, composition ornament",
      dimensions: `60 5/8 in. × 88 in. × 9 3/4 in. (154 × 223.5 × 24.8 cm)
9 3/4" Depth with harware
7 3/4" Depth without hardware`,
      hydrationStatus: "pending",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/4926",
      isPublicDomain: true
    });
    await expect(catalog.getWork(5046)).resolves.toEqual({
      objectId: 5046,
      title: 'The "Shipwreck Medal"',
      artist: "Salathiel Ellis",
      date: "1845–57",
      context: "Medal - Bronze",
      dimensions: "",
      hydrationStatus: "hydrated",
      imageUrl: "https://images.metmuseum.org/primary/5046.jpg",
      metUrl: "http://www.metmuseum.org/art/collection/search/5046",
      isPublicDomain: true
    });
  });

  test("runCatalogHydrationCli marks the current object retry and aborts the run on a 403 response", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const requestedUrls = [];

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      limit: 2,
      stdout,
      stderr,
      fetchImpl: async (url) => {
        requestedUrls.push(url);

        return {
          ok: false,
          status: 403,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {};
          }
        };
      }
    });

    expect(exitCode).toBe(1);
    expect(stdout.toString()).toBe("");
    expect(requestedUrls).toEqual([
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/4926"
    ]);
    expect(JSON.parse(stderr.toString())).toEqual({
      ok: false,
      databasePath,
      error: "Met API denied hydration for object 4926.",
      code: "MET_HYDRATION_ABORTED",
      abortedOnObjectId: 4926
    });

    const retryCatalog = createRuntimeCatalog({ databasePath });

    await expect(retryCatalog.getWork(4926)).resolves.toEqual({
      objectId: 4926,
      title: "Mantel",
      artist: "Unknown",
      date: "ca. 1800",
      context: "Mantel - Wood, composition ornament",
      dimensions: "",
      hydrationStatus: "retry",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/4926",
      isPublicDomain: true
    });
    await expect(retryCatalog.getWork(5046)).resolves.toEqual({
      objectId: 5046,
      title: 'The "Shipwreck Medal"',
      artist: "Salathiel Ellis",
      date: "1845–57",
      context: "Medal - Bronze",
      dimensions: "Diam. 2 5/8 in. (6.7 cm)",
      hydrationStatus: "pending",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/5046",
      isPublicDomain: true
    });
  });

  test("runCatalogHydrationCli marks the current object retry and aborts the run on a non-JSON challenge response", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const requestedUrls = [];

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      limit: 2,
      stdout,
      stderr,
      fetchImpl: async (url) => {
        requestedUrls.push(url);

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/html" }),
          async text() {
            return "<html>challenge</html>";
          }
        };
      }
    });

    expect(exitCode).toBe(1);
    expect(stdout.toString()).toBe("");
    expect(requestedUrls).toEqual([
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/4926"
    ]);
    expect(JSON.parse(stderr.toString())).toEqual({
      ok: false,
      databasePath,
      error: "Met API returned a non-JSON hydration response for object 4926.",
      code: "MET_HYDRATION_ABORTED",
      abortedOnObjectId: 4926
    });

    const retryCatalog = createRuntimeCatalog({ databasePath });

    await expect(retryCatalog.getWork(4926)).resolves.toEqual({
      objectId: 4926,
      title: "Mantel",
      artist: "Unknown",
      date: "ca. 1800",
      context: "Mantel - Wood, composition ornament",
      dimensions: "",
      hydrationStatus: "retry",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/4926",
      isPublicDomain: true
    });
    await expect(retryCatalog.getWork(5046)).resolves.toEqual({
      objectId: 5046,
      title: 'The "Shipwreck Medal"',
      artist: "Salathiel Ellis",
      date: "1845–57",
      context: "Medal - Bronze",
      dimensions: "Diam. 2 5/8 in. (6.7 cm)",
      hydrationStatus: "pending",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/5046",
      isPublicDomain: true
    });
  });

  test("runCatalogHydrationCli marks a 429 object as retry and continues hydrating later pending objects", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const requestedUrls = [];

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      limit: 2,
      stdout,
      stderr,
      fetchImpl: async (url) => {
        requestedUrls.push(url);

        if (url.endsWith("/4926")) {
          return {
            ok: false,
            status: 429,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return {};
            }
          };
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              objectID: 5046,
              primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
              primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
            };
          }
        };
      }
    });

    expect(exitCode).toBe(0);
    expect(requestedUrls).toEqual([
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/4926",
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/5046"
    ]);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 2,
      hydratedCount: 1,
      summary: {
        hydrated: 1,
        no_image: 0,
        retry: 1,
        failed: 0
      },
      results: [
        {
          objectId: 4926,
          hydrationStatus: "retry",
          primaryImage: "",
          primaryImageSmall: "",
          hydrationError: "http_429"
        },
        {
          objectId: 5046,
          hydrationStatus: "hydrated",
          dimensions: "",
          primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
          primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
        }
      ]
    });
    expect(stderr.toString()).toBe("");

    const catalog = createRuntimeCatalog({ databasePath });

    await expect(catalog.getWork(4926)).resolves.toEqual({
      objectId: 4926,
      title: "Mantel",
      artist: "Unknown",
      date: "ca. 1800",
      context: "Mantel - Wood, composition ornament",
      dimensions: "",
      hydrationStatus: "retry",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/4926",
      isPublicDomain: true
    });
    await expect(catalog.getWork(5046)).resolves.toEqual({
      objectId: 5046,
      title: 'The "Shipwreck Medal"',
      artist: "Salathiel Ellis",
      date: "1845–57",
      context: "Medal - Bronze",
      dimensions: "",
      hydrationStatus: "hydrated",
      imageUrl: "https://images.metmuseum.org/primary/5046.jpg",
      metUrl: "http://www.metmuseum.org/art/collection/search/5046",
      isPublicDomain: true
    });
  });

  test("runCatalogHydrationCli marks a timed out object as retry and continues hydrating later pending objects", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const requestedUrls = [];

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      limit: 2,
      stdout,
      stderr,
      fetchImpl: async (url) => {
        requestedUrls.push(url);

        if (url.endsWith("/4926")) {
          const error = new Error("Request timed out");
          error.name = "AbortError";
          throw error;
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              objectID: 5046,
              primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
              primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
            };
          }
        };
      }
    });

    expect(exitCode).toBe(0);
    expect(requestedUrls).toEqual([
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/4926",
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/5046"
    ]);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 2,
      hydratedCount: 1,
      summary: {
        hydrated: 1,
        no_image: 0,
        retry: 1,
        failed: 0
      },
      results: [
        {
          objectId: 4926,
          hydrationStatus: "retry",
          primaryImage: "",
          primaryImageSmall: "",
          hydrationError: "timeout"
        },
        {
          objectId: 5046,
          hydrationStatus: "hydrated",
          dimensions: "",
          primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
          primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
        }
      ]
    });
    expect(stderr.toString()).toBe("");

    const catalog = createRuntimeCatalog({ databasePath });

    await expect(catalog.getWork(4926)).resolves.toEqual({
      objectId: 4926,
      title: "Mantel",
      artist: "Unknown",
      date: "ca. 1800",
      context: "Mantel - Wood, composition ornament",
      dimensions: "",
      hydrationStatus: "retry",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/4926",
      isPublicDomain: true
    });
    await expect(catalog.getWork(5046)).resolves.toEqual({
      objectId: 5046,
      title: 'The "Shipwreck Medal"',
      artist: "Salathiel Ellis",
      date: "1845–57",
      context: "Medal - Bronze",
      dimensions: "",
      hydrationStatus: "hydrated",
      imageUrl: "https://images.metmuseum.org/primary/5046.jpg",
      metUrl: "http://www.metmuseum.org/art/collection/search/5046",
      isPublicDomain: true
    });
  });

  test("runCatalogHydrationCli marks a transport failure as retry and continues hydrating later pending objects", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const requestedUrls = [];

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      limit: 2,
      stdout,
      stderr,
      fetchImpl: async (url) => {
        requestedUrls.push(url);

        if (url.endsWith("/4926")) {
          throw new TypeError("fetch failed");
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              objectID: 5046,
              primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
              primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
            };
          }
        };
      }
    });

    expect(exitCode).toBe(0);
    expect(requestedUrls).toEqual([
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/4926",
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/5046"
    ]);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 2,
      hydratedCount: 1,
      summary: {
        hydrated: 1,
        no_image: 0,
        retry: 1,
        failed: 0
      },
      results: [
        {
          objectId: 4926,
          hydrationStatus: "retry",
          primaryImage: "",
          primaryImageSmall: "",
          hydrationError: "transport_error"
        },
        {
          objectId: 5046,
          hydrationStatus: "hydrated",
          dimensions: "",
          primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
          primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
        }
      ]
    });
    expect(stderr.toString()).toBe("");

    const catalog = createRuntimeCatalog({ databasePath });

    await expect(catalog.getWork(4926)).resolves.toEqual({
      objectId: 4926,
      title: "Mantel",
      artist: "Unknown",
      date: "ca. 1800",
      context: "Mantel - Wood, composition ornament",
      dimensions: "",
      hydrationStatus: "retry",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/4926",
      isPublicDomain: true
    });
    await expect(catalog.getWork(5046)).resolves.toEqual({
      objectId: 5046,
      title: 'The "Shipwreck Medal"',
      artist: "Salathiel Ellis",
      date: "1845–57",
      context: "Medal - Bronze",
      dimensions: "",
      hydrationStatus: "hydrated",
      imageUrl: "https://images.metmuseum.org/primary/5046.jpg",
      metUrl: "http://www.metmuseum.org/art/collection/search/5046",
      isPublicDomain: true
    });
  });

  test("runCatalogHydrationCli marks a 503 object as retry and continues hydrating later pending objects", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const requestedUrls = [];

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      limit: 2,
      stdout,
      stderr,
      fetchImpl: async (url) => {
        requestedUrls.push(url);

        if (url.endsWith("/4926")) {
          return {
            ok: false,
            status: 503,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return {};
            }
          };
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              objectID: 5046,
              primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
              primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
            };
          }
        };
      }
    });

    expect(exitCode).toBe(0);
    expect(requestedUrls).toEqual([
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/4926",
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/5046"
    ]);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 2,
      hydratedCount: 1,
      summary: {
        hydrated: 1,
        no_image: 0,
        retry: 1,
        failed: 0
      },
      results: [
        {
          objectId: 4926,
          hydrationStatus: "retry",
          primaryImage: "",
          primaryImageSmall: "",
          hydrationError: "http_503"
        },
        {
          objectId: 5046,
          hydrationStatus: "hydrated",
          dimensions: "",
          primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
          primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
        }
      ]
    });
    expect(stderr.toString()).toBe("");
  });

  test("runCatalogHydrationCli reports summary counts by hydration status", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      limit: 2,
      stdout,
      stderr,
      fetchImpl: async (url) => {
        if (url.endsWith("/4926")) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return {
                objectID: 4926,
                primaryImage: "",
                primaryImageSmall: ""
              };
            }
          };
        }

        return {
          ok: false,
          status: 429,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {};
          }
        };
      }
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 2,
      hydratedCount: 0,
      summary: {
        hydrated: 0,
        no_image: 1,
        retry: 1,
        failed: 0
      },
      results: [
        {
          objectId: 4926,
          hydrationStatus: "no_image",
          dimensions: "",
          primaryImage: "",
          primaryImageSmall: ""
        },
        {
          objectId: 5046,
          hydrationStatus: "retry",
          primaryImage: "",
          primaryImageSmall: "",
          hydrationError: "http_429"
        }
      ]
    });
    expect(stderr.toString()).toBe("");
  });

  test("runCatalogHydrationCli waits between requests when delayMs is configured", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const events = [];

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      limit: 2,
      objectIds: [4926, 5046],
      delayMs: 250,
      stdout,
      stderr,
      sleepImpl: async (delayMs) => {
        events.push(`sleep:${delayMs}`);
      },
      fetchImpl: async (url) => {
        events.push(`fetch:${url.split("/").at(-1)}`);

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              objectID: Number.parseInt(url.split("/").at(-1), 10),
              primaryImage: "",
              primaryImageSmall: ""
            };
          }
        };
      }
    });

    expect(exitCode).toBe(0);
    expect(events).toEqual(["fetch:4926", "sleep:250", "fetch:5046"]);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 2,
      hydratedCount: 0,
      summary: {
        hydrated: 0,
        no_image: 2,
        retry: 0,
        failed: 0
      },
      results: [
        {
          objectId: 4926,
          hydrationStatus: "no_image",
          dimensions: "",
          primaryImage: "",
          primaryImageSmall: ""
        },
        {
          objectId: 5046,
          hydrationStatus: "no_image",
          dimensions: "",
          primaryImage: "",
          primaryImageSmall: ""
        }
      ]
    });
    expect(stderr.toString()).toBe("");
  });

  test("runCatalogHydrationCli logs per-object progress to stderr without corrupting stdout json", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      limit: 2,
      objectIds: [4926, 5046],
      stdout,
      stderr,
      logProgress: true,
      fetchImpl: async (url) => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return {
            objectID: Number.parseInt(url.split("/").at(-1), 10),
            primaryImage: "",
            primaryImageSmall: ""
          };
        }
      })
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 2,
      hydratedCount: 0,
      summary: {
        hydrated: 0,
        no_image: 2,
        retry: 0,
        failed: 0
      },
      results: [
        {
          objectId: 4926,
          hydrationStatus: "no_image",
          dimensions: "",
          primaryImage: "",
          primaryImageSmall: ""
        },
        {
          objectId: 5046,
          hydrationStatus: "no_image",
          dimensions: "",
          primaryImage: "",
          primaryImageSmall: ""
        }
      ]
    });
    expect(stderr.toString()).toBe(
      [
        "Hydrating 1/2 object 4926",
        "Hydrated 1/2 object 4926 -> no_image",
        "Hydrating 2/2 object 5046",
        "Hydrated 2/2 object 5046 -> no_image"
      ].join("\n") + "\n"
    );
  });

  test("runCatalogHydrationCli adds jitterMs to the configured delay between requests", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const events = [];

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      limit: 2,
      objectIds: [4926, 5046],
      delayMs: 1000,
      jitterMs: 250,
      stdout,
      stderr,
      randomImpl: () => 0.5,
      sleepImpl: async (delayMs) => {
        events.push(`sleep:${delayMs}`);
      },
      fetchImpl: async (url) => {
        events.push(`fetch:${url.split("/").at(-1)}`);

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              objectID: Number.parseInt(url.split("/").at(-1), 10),
              primaryImage: "",
              primaryImageSmall: ""
            };
          }
        };
      }
    });

    expect(exitCode).toBe(0);
    expect(events).toEqual(["fetch:4926", "sleep:1125", "fetch:5046"]);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 2,
      hydratedCount: 0,
      summary: {
        hydrated: 0,
        no_image: 2,
        retry: 0,
        failed: 0
      },
      results: [
        {
          objectId: 4926,
          hydrationStatus: "no_image",
          dimensions: "",
          primaryImage: "",
          primaryImageSmall: ""
        },
        {
          objectId: 5046,
          hydrationStatus: "no_image",
          dimensions: "",
          primaryImage: "",
          primaryImageSmall: ""
        }
      ]
    });
    expect(stderr.toString()).toBe("");
  });

  test("runCatalogHydrationCli marks a missing Met object as failed and continues hydrating later pending objects", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-cli-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const requestedUrls = [];

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const exitCode = await runCatalogHydrationCli({
      databasePath,
      limit: 2,
      objectIds: [4926, 5046],
      stdout,
      stderr,
      fetchImpl: async (url) => {
        requestedUrls.push(url);

        if (url.endsWith("/4926")) {
          return {
            ok: false,
            status: 404,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return { message: "ObjectID not found" };
            }
          };
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              objectID: 5046,
              primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
              primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
            };
          }
        };
      }
    });

    expect(exitCode).toBe(0);
    expect(requestedUrls).toEqual([
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/4926",
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/5046"
    ]);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 2,
      hydratedCount: 1,
      summary: {
        hydrated: 1,
        no_image: 0,
        retry: 0,
        failed: 1
      },
      results: [
        {
          objectId: 4926,
          hydrationStatus: "failed",
          primaryImage: "",
          primaryImageSmall: "",
          hydrationError: "http_404"
        },
        {
          objectId: 5046,
          hydrationStatus: "hydrated",
          dimensions: "",
          primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
          primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
        }
      ]
    });
    expect(stderr.toString()).toBe("");

    const catalog = createRuntimeCatalog({ databasePath });

    await expect(catalog.getWork(4926)).resolves.toEqual({
      objectId: 4926,
      title: "Mantel",
      artist: "Unknown",
      date: "ca. 1800",
      context: "Mantel - Wood, composition ornament",
      dimensions: "",
      hydrationStatus: "failed",
      imageUrl: "",
      metUrl: "http://www.metmuseum.org/art/collection/search/4926",
      isPublicDomain: true
    });
    await expect(catalog.getWork(5046)).resolves.toEqual({
      objectId: 5046,
      title: 'The "Shipwreck Medal"',
      artist: "Salathiel Ellis",
      date: "1845–57",
      context: "Medal - Bronze",
      dimensions: "",
      hydrationStatus: "hydrated",
      imageUrl: "https://images.metmuseum.org/primary/5046.jpg",
      metUrl: "http://www.metmuseum.org/art/collection/search/5046",
      isPublicDomain: true
    });
  });
});
