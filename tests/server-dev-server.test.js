import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import httpMocks from "node-mocks-http";
import { EventEmitter } from "node:events";
import { runCatalogImport } from "../server/catalog-import.js";
import { initializeCatalogSqlite } from "../server/catalog-sqlite.js";
import { createDevArtctlApp } from "../server/dev-server.js";
import { createTrackedTempDir } from "./temp-dir.js";

async function makeRequest(url, targetApp) {
  const request = httpMocks.createRequest({
    method: "GET",
    url
  });
  const response = httpMocks.createResponse({ eventEmitter: EventEmitter });

  await new Promise((resolve, reject) => {
    response.on("end", resolve);
    response.on("error", reject);
    targetApp.handle(request, response, reject);
  });

  return response;
}

describe("dev server startup", () => {
  test("createDevArtctlApp serves search results from CATALOG_DATABASE_PATH", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-dev-server-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const app = createDevArtctlApp({
      CATALOG_DATABASE_PATH: databasePath
    });
    const response = await makeRequest("/api/search?q=shipwreck", app);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      query: "shipwreck",
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
  });

  test(
    "createDevArtctlApp returns catalog readiness metadata for an initialized but empty CATALOG_DATABASE_PATH",
    async () => {
      const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-dev-server-"));
      const databasePath = path.join(tempDir, "catalog.sqlite");

      initializeCatalogSqlite(databasePath);

      const app = createDevArtctlApp({
        CATALOG_DATABASE_PATH: databasePath
      });
      const response = await makeRequest("/api/search?q=shipwreck", app);

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response._getData())).toEqual({
        error: "Catalog is not initialized.",
        scope: "catalog",
        code: "CATALOG_NOT_INITIALIZED"
      });
    }
  );

  test("createDevArtctlApp loads CATALOG_DATABASE_PATH from .env.local", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-dev-server-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const envFilePath = path.join(tempDir, ".env.local");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    writeFileSync(envFilePath, `CATALOG_DATABASE_PATH=${databasePath}\n`, "utf8");

    const app = createDevArtctlApp({
      ARTCTL_ENV_FILE_PATH: envFilePath
    });
    const response = await makeRequest("/api/search?q=shipwreck", app);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      query: "shipwreck",
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
  });
});
