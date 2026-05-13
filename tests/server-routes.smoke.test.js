import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import httpMocks from "node-mocks-http";
import { createArtctlApp } from "../server/app.js";
import { createUninitializedCatalog } from "../server/catalog.js";
import { runCatalogImport } from "../server/catalog-import.js";
import { getObjectHydrationState, initializeCatalogSqlite } from "../server/catalog-sqlite.js";
import { createMetApiClient } from "../server/met-api.js";
import { createTrackedTempDir } from "./temp-dir.js";

const app = createArtctlApp();

async function makeRequest(url, targetApp = app, { method = "GET", body = null } = {}) {
  const request = httpMocks.createRequest({
    method,
    url,
    body
  });
  const response = httpMocks.createResponse({ eventEmitter: EventEmitter });

  await new Promise((resolve, reject) => {
    response.on("end", resolve);
    response.on("error", reject);
    targetApp.handle(request, response, reject);
  });

  return response;
}

function createHeaders(contentType, setCookies = []) {
  return {
    get(name) {
      if (name.toLowerCase() === "content-type") {
        return contentType;
      }

      return null;
    },
    getSetCookie() {
      return setCookies;
    }
  };
}

function createJsonResponse(payload, { setCookies = [] } = {}) {
  return {
    ok: true,
    status: 200,
    headers: createHeaders("application/json", setCookies),
    async json() {
      return payload;
    }
  };
}

function createTextResponse(
  body,
  { status = 200, contentType = "text/plain", setCookies = [] } = {}
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: createHeaders(contentType, setCookies),
    async text() {
      return body;
    },
    async json() {
      return JSON.parse(body);
    }
  };
}

describe("SPA route refresh", () => {
  test.each(["/", "/search", "/works/42", "/help", "/theme"])(
    "GET %s returns the ARTCTL shell",
    async (url) => {
      const response = await makeRequest(url);

      expect(response.statusCode).toBe(200);
      expect(response._getData()).toContain('<div id="root"></div>');
    }
  );
});

describe("configured SQLite catalog runtime", () => {
  test("GET /api/search serves local catalog results from a configured SQLite database path", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const searchApp = createArtctlApp({ catalogDatabasePath: databasePath });
    const response = await makeRequest("/api/search?q=shipwreck", searchApp);

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

  test("GET /api/gallery serves SQLite-backed gallery work cards from a configured database path", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const galleryApp = createArtctlApp({ catalogDatabasePath: databasePath });
    const response = await makeRequest("/api/gallery", galleryApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      results: [],
      emptyState: {
        title: "Gallery coming soon",
        message: "Curated groups have not been configured yet."
      }
    });
  });

  test("GET /api/gallery serves only SQLite works that actually have hydrated images", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const csvPath = path.join(tempDir, "gallery-hydrated.csv");

    writeFileSync(
      csvPath,
      "Object ID,Department,Title,Artist Display Name,Object Date,Object Name,Medium,Is Public Domain,Primary Image Small\n" +
        "1,European Paintings,No Image Work,Artist One,1900,Painting,Oil on canvas,True,\n" +
        "2,European Paintings,Hydrated Work 2,Artist Two,1901,Painting,Oil on canvas,True,https://images.metmuseum.org/small/2.jpg\n" +
        "3,European Paintings,Hydrated Work 3,Artist Three,1902,Painting,Oil on canvas,True,https://images.metmuseum.org/small/3.jpg\n",
      "utf8"
    );

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const galleryApp = createArtctlApp({ catalogDatabasePath: databasePath });
    expect(
      (await makeRequest("/api/admin/gallery", galleryApp, { method: "POST", body: { objectId: 2 } }))
        .statusCode
    ).toBe(201);
    expect(
      (await makeRequest("/api/admin/gallery", galleryApp, { method: "POST", body: { objectId: 3 } }))
        .statusCode
    ).toBe(201);
    const response = await makeRequest("/api/gallery", galleryApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      results: [
        {
          objectId: 2,
          title: "Hydrated Work 2",
          artist: "Artist Two",
          imageUrl: "https://images.metmuseum.org/small/2.jpg"
        },
        {
          objectId: 3,
          title: "Hydrated Work 3",
          artist: "Artist Three",
          imageUrl: "https://images.metmuseum.org/small/3.jpg"
        }
      ]
    });
  });

  test("PATCH /api/admin/curated-groups/:slug/feature switches the homepage gallery to that curated group", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const csvPath = path.join(tempDir, "gallery-featured-group.csv");

    writeFileSync(
      csvPath,
      "Object ID,Department,Title,Artist Display Name,Object Date,Object Name,Medium,Is Public Domain,Primary Image Small\n" +
        "1,European Paintings,Homepage Work,Artist One,1900,Painting,Oil on canvas,True,https://images.metmuseum.org/small/1.jpg\n" +
        "2,European Paintings,Featured Work 2,Artist Two,1901,Painting,Oil on canvas,True,https://images.metmuseum.org/small/2.jpg\n" +
        "3,European Paintings,Featured Work 3,Artist Three,1902,Painting,Oil on canvas,True,https://images.metmuseum.org/small/3.jpg\n",
      "utf8"
    );

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const adminApp = createArtctlApp({ catalogDatabasePath: databasePath });
    expect(
      (
        await makeRequest("/api/admin/curated-groups", adminApp, {
          method: "POST",
          body: { slug: "featured-landscapes", name: "Featured Landscapes" }
        })
      ).statusCode
    ).toBe(201);
    expect(
      (await makeRequest("/api/admin/gallery", adminApp, { method: "POST", body: { objectId: 1 } }))
        .statusCode
    ).toBe(201);
    expect(
      (
        await makeRequest("/api/admin/gallery", adminApp, {
          method: "POST",
          body: { objectId: 2, groupSlug: "featured-landscapes" }
        })
      ).statusCode
    ).toBe(201);
    expect(
      (
        await makeRequest("/api/admin/gallery", adminApp, {
          method: "POST",
          body: { objectId: 3, groupSlug: "featured-landscapes" }
        })
      ).statusCode
    ).toBe(201);

    const featureResponse = await makeRequest(
      "/api/admin/curated-groups/featured-landscapes/feature",
      adminApp,
      { method: "PATCH" }
    );

    expect(featureResponse.statusCode).toBe(200);
    expect(JSON.parse(featureResponse._getData())).toEqual({
      ok: true,
      group: {
        slug: "featured-landscapes",
        name: "Featured Landscapes",
        objectCount: 2,
        isHomepageFeatured: true
      }
    });

    const galleryResponse = await makeRequest("/api/gallery", adminApp);
    expect(JSON.parse(galleryResponse._getData())).toEqual({
      results: [
        {
          objectId: 2,
          title: "Featured Work 2",
          artist: "Artist Two",
          imageUrl: "https://images.metmuseum.org/small/2.jpg"
        },
        {
          objectId: 3,
          title: "Featured Work 3",
          artist: "Artist Three",
          imageUrl: "https://images.metmuseum.org/small/3.jpg"
        }
      ]
    });
  });

  test("GET /api/admin/gallery lists curated gallery entries from a configured SQLite database path", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const adminApp = createArtctlApp({ catalogDatabasePath: databasePath });
    const response = await makeRequest("/api/admin/gallery", adminApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      results: []
    });
  });

  test("GET /api/admin/curated-groups lists the default homepage editorial group", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const adminApp = createArtctlApp({ catalogDatabasePath: databasePath });
    const response = await makeRequest("/api/admin/curated-groups", adminApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      results: [
        {
          slug: "homepage",
          name: "Homepage Gallery",
          objectCount: 0,
          isHomepageFeatured: true
        }
      ]
    });
  });

  test("GET /api/admin/curated-groups recreates missing curated group tables for a legacy SQLite catalog", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const database = new DatabaseSync(databasePath);
    database.exec("DROP TABLE curated_group_objects");
    database.exec("DROP TABLE curated_groups");
    database.close();

    const adminApp = createArtctlApp({ catalogDatabasePath: databasePath });
    const response = await makeRequest("/api/admin/curated-groups", adminApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      results: [
        {
          slug: "homepage",
          name: "Homepage Gallery",
          objectCount: 0,
          isHomepageFeatured: true
        }
      ]
    });
  });

  test("POST /api/admin/curated-groups creates a new editorial group", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const adminApp = createArtctlApp({ catalogDatabasePath: databasePath });
    const response = await makeRequest("/api/admin/curated-groups", adminApp, {
      method: "POST",
      body: { name: "Featured Landscapes" }
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response._getData())).toEqual({
      ok: true,
      group: {
        slug: "featured-landscapes",
        name: "Featured Landscapes",
        objectCount: 0,
        isHomepageFeatured: false
      }
    });

    const listResponse = await makeRequest("/api/admin/curated-groups", adminApp);

    expect(JSON.parse(listResponse._getData())).toEqual({
      results: [
        {
          slug: "featured-landscapes",
          name: "Featured Landscapes",
          objectCount: 0,
          isHomepageFeatured: false
        },
        {
          slug: "homepage",
          name: "Homepage Gallery",
          objectCount: 0,
          isHomepageFeatured: true
        }
      ]
    });
  });

  test("POST /api/admin/curated-groups rejects a duplicate group name", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const adminApp = createArtctlApp({ catalogDatabasePath: databasePath });

    expect(
      (
        await makeRequest("/api/admin/curated-groups", adminApp, {
          method: "POST",
          body: { name: "Featured Landscapes" }
        })
      ).statusCode
    ).toBe(201);

    const response = await makeRequest("/api/admin/curated-groups", adminApp, {
      method: "POST",
      body: { name: "Featured Landscapes" }
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response._getData())).toEqual({
      error: "Curated group name already exists."
    });
  });

  test("PATCH /api/admin/curated-groups/:slug renames an editorial group and derives a new slug", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const adminApp = createArtctlApp({ catalogDatabasePath: databasePath });

    expect(
      (
        await makeRequest("/api/admin/curated-groups", adminApp, {
          method: "POST",
          body: { name: "Featured Landscapes" }
        })
      ).statusCode
    ).toBe(201);

    const response = await makeRequest("/api/admin/curated-groups/featured-landscapes", adminApp, {
      method: "PATCH",
      body: { name: "Evening Paintings" }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      ok: true,
      group: {
        slug: "evening-paintings",
        name: "Evening Paintings",
        objectCount: 0,
        isHomepageFeatured: false
      }
    });
  });

  test("DELETE /api/admin/curated-groups/:slug removes an editorial group", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const adminApp = createArtctlApp({ catalogDatabasePath: databasePath });

    expect(
      (
        await makeRequest("/api/admin/curated-groups", adminApp, {
          method: "POST",
          body: { name: "Featured Landscapes" }
        })
      ).statusCode
    ).toBe(201);

    const response = await makeRequest("/api/admin/curated-groups/featured-landscapes", adminApp, {
      method: "DELETE"
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      ok: true
    });

    const listResponse = await makeRequest("/api/admin/curated-groups", adminApp);

    expect(JSON.parse(listResponse._getData())).toEqual({
      results: [
        {
          slug: "homepage",
          name: "Homepage Gallery",
          objectCount: 0,
          isHomepageFeatured: true
        }
      ]
    });
  });

  test("POST /api/admin/gallery can add an object to a selected curated group", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const adminApp = createArtctlApp({ catalogDatabasePath: databasePath });

    expect(
      (
        await makeRequest("/api/admin/curated-groups", adminApp, {
          method: "POST",
          body: { slug: "featured-landscapes", name: "Featured Landscapes" }
        })
      ).statusCode
    ).toBe(201);

    const response = await makeRequest("/api/admin/gallery", adminApp, {
      method: "POST",
      body: { objectId: 4926, groupSlug: "featured-landscapes" }
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response._getData())).toEqual({
      ok: true,
      item: {
        objectId: 4926,
        position: 1,
        title: "Mantel",
        artist: "Unknown",
        imageUrl: "",
        hydrationStatus: "pending"
      }
    });

    const featuredResponse = await makeRequest(
      "/api/admin/gallery?groupSlug=featured-landscapes",
      adminApp
    );
    expect(JSON.parse(featuredResponse._getData())).toEqual({
      results: [
        {
          objectId: 4926,
          position: 1,
          title: "Mantel",
          artist: "Unknown",
          imageUrl: "",
          hydrationStatus: "pending"
        }
      ]
    });

    const homepageResponse = await makeRequest("/api/admin/gallery", adminApp);
    expect(JSON.parse(homepageResponse._getData())).toEqual({
      results: []
    });
  });

  test("POST /api/admin/gallery appends a local object to the curated gallery list", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const csvPath = path.join(tempDir, "admin-gallery.csv");

    writeFileSync(
      csvPath,
      "Object ID,Department,Title,Artist Display Name,Object Date,Object Name,Medium,Is Public Domain\n" +
        Array.from({ length: 25 }, (_, index) => {
          const objectId = index + 1;
          return `${objectId},European Paintings,Curated Work ${objectId},Artist ${objectId},1900,Painting,Oil on canvas,True`;
        }).join("\n") +
        "\n",
      "utf8"
    );

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const adminApp = createArtctlApp({ catalogDatabasePath: databasePath });
    const response = await makeRequest("/api/admin/gallery", adminApp, {
      method: "POST",
      body: { objectId: 25 }
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response._getData())).toEqual({
      ok: true,
      item: {
        objectId: 25,
        position: 1,
        title: "Curated Work 25",
        artist: "Artist 25",
        imageUrl: "",
        hydrationStatus: "pending"
      }
    });

    const listResponse = await makeRequest("/api/admin/gallery", adminApp);

    expect(JSON.parse(listResponse._getData()).results.at(-1)).toEqual({
      objectId: 25,
      position: 1,
      title: "Curated Work 25",
      artist: "Artist 25",
      imageUrl: "",
      hydrationStatus: "pending"
    });
  });

  test("DELETE /api/admin/gallery/:objectId removes a curated item and compacts later positions", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const adminApp = createArtctlApp({ catalogDatabasePath: databasePath });
    expect(
      (await makeRequest("/api/admin/gallery", adminApp, { method: "POST", body: { objectId: 4926 } }))
        .statusCode
    ).toBe(201);
    expect(
      (await makeRequest("/api/admin/gallery", adminApp, { method: "POST", body: { objectId: 5046 } }))
        .statusCode
    ).toBe(201);
    const response = await makeRequest("/api/admin/gallery/4926", adminApp, {
      method: "DELETE"
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      ok: true
    });

    const listResponse = await makeRequest("/api/admin/gallery", adminApp);

    expect(JSON.parse(listResponse._getData())).toEqual({
      results: [
        {
          objectId: 5046,
          position: 1,
          title: 'The "Shipwreck Medal"',
          artist: "Salathiel Ellis",
          imageUrl: "",
          hydrationStatus: "pending"
        }
      ]
    });
  });

  test("PATCH /api/admin/gallery/reorder moves a curated item before the drop target", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const adminApp = createArtctlApp({ catalogDatabasePath: databasePath });
    expect(
      (await makeRequest("/api/admin/gallery", adminApp, { method: "POST", body: { objectId: 4926 } }))
        .statusCode
    ).toBe(201);
    expect(
      (await makeRequest("/api/admin/gallery", adminApp, { method: "POST", body: { objectId: 5046 } }))
        .statusCode
    ).toBe(201);
    const response = await makeRequest("/api/admin/gallery/reorder", adminApp, {
      method: "PATCH",
      body: {
        objectId: 5046,
        targetObjectId: 4926
      }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      ok: true,
      results: [
        {
          objectId: 5046,
          position: 1,
          title: 'The "Shipwreck Medal"',
          artist: "Salathiel Ellis",
          imageUrl: "",
          hydrationStatus: "pending"
        },
        {
          objectId: 4926,
          position: 2,
          title: "Mantel",
          artist: "Unknown",
          imageUrl: "",
          hydrationStatus: "pending"
        }
      ]
    });

    const listResponse = await makeRequest("/api/admin/gallery", adminApp);

    expect(JSON.parse(listResponse._getData())).toEqual({
      results: [
        {
          objectId: 5046,
          position: 1,
          title: 'The "Shipwreck Medal"',
          artist: "Salathiel Ellis",
          imageUrl: "",
          hydrationStatus: "pending"
        },
        {
          objectId: 4926,
          position: 2,
          title: "Mantel",
          artist: "Unknown",
          imageUrl: "",
          hydrationStatus: "pending"
        }
      ]
    });
  });

  test("POST /api/admin/gallery/:objectId/hydrate hydrates a curated item and returns its updated card", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const adminApp = createArtctlApp({
      catalogDatabasePath: databasePath,
      hydrationFetchImpl: vi.fn(async (url) => {
        expect(String(url)).toBe(
          "https://collectionapi.metmuseum.org/public/collection/v1/objects/5046"
        );

        return createJsonResponse({
          primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
          primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
        });
      })
    });
    expect(
      (await makeRequest("/api/admin/gallery", adminApp, { method: "POST", body: { objectId: 4926 } }))
        .statusCode
    ).toBe(201);
    expect(
      (await makeRequest("/api/admin/gallery", adminApp, { method: "POST", body: { objectId: 5046 } }))
        .statusCode
    ).toBe(201);
    const response = await makeRequest("/api/admin/gallery/5046/hydrate", adminApp, {
      method: "POST"
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      ok: true,
      item: {
        objectId: 5046,
        position: 2,
        title: 'The "Shipwreck Medal"',
        artist: "Salathiel Ellis",
        imageUrl: "https://images.metmuseum.org/small/5046.jpg",
        hydrationStatus: "hydrated"
      }
    });

    const listResponse = await makeRequest("/api/admin/gallery", adminApp);

    expect(JSON.parse(listResponse._getData()).results[1]).toEqual({
      objectId: 5046,
      position: 2,
      title: 'The "Shipwreck Medal"',
      artist: "Salathiel Ellis",
      imageUrl: "https://images.metmuseum.org/small/5046.jpg",
      hydrationStatus: "hydrated"
    });
  });

  test("GET /api/gallery serves hydrated curated entries in curated order", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const csvPath = path.join(tempDir, "gallery-curated-order.csv");

    writeFileSync(
      csvPath,
      "Object ID,Department,Title,Artist Display Name,Object Date,Object Name,Medium,Is Public Domain\n" +
        "1,European Paintings,Curated Work 1,Artist 1,1900,Painting,Oil on canvas,True\n" +
        "2,European Paintings,Curated Work 2,Artist 2,1901,Painting,Oil on canvas,True\n" +
        "3,European Paintings,Curated Work 3,Artist 3,1902,Painting,Oil on canvas,True\n",
      "utf8"
    );

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const galleryApp = createArtctlApp({
      catalogDatabasePath: databasePath,
      hydrationFetchImpl: vi.fn(async (url) => {
        const objectId = Number.parseInt(String(url).split("/").at(-1) ?? "", 10);

        return createJsonResponse({
          primaryImage: `https://images.metmuseum.org/primary/${objectId}.jpg`,
          primaryImageSmall: `https://images.metmuseum.org/small/${objectId}.jpg`
        });
      })
    });
    expect(
      (await makeRequest("/api/admin/gallery", galleryApp, { method: "POST", body: { objectId: 1 } }))
        .statusCode
    ).toBe(201);
    expect(
      (await makeRequest("/api/admin/gallery", galleryApp, { method: "POST", body: { objectId: 2 } }))
        .statusCode
    ).toBe(201);
    expect(
      (await makeRequest("/api/admin/gallery", galleryApp, { method: "POST", body: { objectId: 3 } }))
        .statusCode
    ).toBe(201);

    expect(
      (await makeRequest("/api/admin/gallery/2/hydrate", galleryApp, { method: "POST" })).statusCode
    ).toBe(200);
    expect(
      (await makeRequest("/api/admin/gallery/3/hydrate", galleryApp, { method: "POST" })).statusCode
    ).toBe(200);
    expect(
      (
        await makeRequest("/api/admin/gallery/reorder", galleryApp, {
          method: "PATCH",
          body: { objectId: 3, targetObjectId: 2 }
        })
      ).statusCode
    ).toBe(200);

    const response = await makeRequest("/api/gallery", galleryApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      results: [
        {
          objectId: 3,
          title: "Curated Work 3",
          artist: "Artist 3",
          imageUrl: "https://images.metmuseum.org/small/3.jpg"
        },
        {
          objectId: 2,
          title: "Curated Work 2",
          artist: "Artist 2",
          imageUrl: "https://images.metmuseum.org/small/2.jpg"
        }
      ]
    });
  });

  test("GET /api/search returns catalog readiness metadata for an initialized but empty SQLite database", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-sqlite-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");

    initializeCatalogSqlite(databasePath);

    const searchApp = createArtctlApp({ catalogDatabasePath: databasePath });
    const response = await makeRequest("/api/search?q=shipwreck", searchApp);

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response._getData())).toEqual({
      error: "Catalog is not initialized.",
      scope: "catalog",
      code: "CATALOG_NOT_INITIALIZED"
    });
  });
});

describe("work detail API", () => {
  test("GET /api/works/:objectId returns 503 when the local catalog is not initialized", async () => {
    const catalog = {
      isReady() {
        return false;
      }
    };
    const detailApp = createArtctlApp({ catalog });

    const response = await makeRequest("/api/works/436121", detailApp);

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response._getData())).toEqual({
      error: "Catalog is not initialized.",
      scope: "catalog",
      code: "CATALOG_NOT_INITIALIZED"
    });
  });

  test("GET /api/works/:objectId returns a work from the local catalog when initialized", async () => {
    const catalog = {
      isReady() {
        return true;
      },
      async getWork(objectId) {
        expect(objectId).toBe(436121);

        return {
          objectId: 436121,
          title: "The Great Wave off Kanagawa",
          artist: "Japanese",
          date: "ca. 1830-32",
          context: "Print - Polychrome woodblock print; ink and color on paper",
          imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
          metUrl: "https://www.metmuseum.org/art/collection/search/45434"
        };
      }
    };
    const detailApp = createArtctlApp({ catalog });

    const response = await makeRequest("/api/works/436121", detailApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      objectId: 436121,
      title: "The Great Wave off Kanagawa",
      artist: "Japanese",
      date: "ca. 1830-32",
      context: "Print - Polychrome woodblock print; ink and color on paper",
      imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
      metUrl: "https://www.metmuseum.org/art/collection/search/45434"
    });
  });

  test("GET /api/works/:objectId returns 404 when the local catalog does not contain the work", async () => {
    const catalog = {
      isReady() {
        return true;
      },
      async getWork() {
        return null;
      }
    };
    const detailApp = createArtctlApp({ catalog });

    const response = await makeRequest("/api/works/999999", detailApp);

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response._getData())).toEqual({
      error: "Work not found."
    });
  });

  test("GET /api/works/:objectId returns a normalized ARTCTL work shape", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.endsWith("/objects/436121")) {
          return createJsonResponse({
            objectID: 436121,
            title: "The Great Wave off Kanagawa",
            artistDisplayName: "",
            culture: "Japanese",
            objectDate: "ca. 1830-32",
            objectName: "Print",
            medium: "Polychrome woodblock print; ink and color on paper",
            primaryImage: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg",
            objectURL: "https://www.metmuseum.org/art/collection/search/45434"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const detailApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/works/436121", detailApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      objectId: 436121,
      title: "The Great Wave off Kanagawa",
      artist: "Japanese",
      date: "ca. 1830-32",
      context: "Print - Polychrome woodblock print; ink and color on paper",
      imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
      metUrl: "https://www.metmuseum.org/art/collection/search/45434"
    });
  });

  test("GET /api/works/:objectId falls back to primaryImageSmall when needed", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.endsWith("/objects/437984")) {
          return createJsonResponse({
            objectID: 437984,
            title: "Study of a Horse",
            artistDisplayName: "Théodore Géricault",
            culture: "",
            objectDate: "1820",
            objectName: "Drawing",
            medium: "Graphite on paper",
            primaryImage: "",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/dp/web-large/DT1567.jpg",
            objectURL: "https://www.metmuseum.org/art/collection/search/437984"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const detailApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/works/437984", detailApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData()).imageUrl).toBe(
      "https://images.metmuseum.org/CRDImages/dp/web-large/DT1567.jpg"
    );
  });

  test("GET /api/works/:objectId returns metadata even when the Met API has no image fields", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.endsWith("/objects/486055")) {
          return createJsonResponse({
            objectID: 486055,
            title: "Galisteo Creek",
            artistDisplayName: "Gustave Baumann",
            culture: "",
            objectDate: "1920",
            objectName: "Color woodcut",
            medium: "Ink and color on paper",
            primaryImage: "",
            primaryImageSmall: "",
            objectURL: "https://www.metmuseum.org/art/collection/search/486055"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const detailApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/works/486055", detailApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      objectId: 486055,
      title: "Galisteo Creek",
      artist: "Gustave Baumann",
      date: "1920",
      context: "Color woodcut - Ink and color on paper",
      imageUrl: "",
      metUrl: "https://www.metmuseum.org/art/collection/search/486055"
    });
  });

  test("GET /api/works/:objectId hydrates a pending local catalog work on demand and persists the updated detail", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-detail-hydration-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const hydrationRequests = [];

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const detailApp = createArtctlApp({
      catalogDatabasePath: databasePath,
      hydrationFetchImpl: async (resource) => {
        hydrationRequests.push(String(resource));

        return createJsonResponse({
          objectID: 5046,
          primaryImage: "https://images.metmuseum.org/CRDImages/aw/original/DT5046.jpg",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/aw/web-large/DT5046.jpg"
        });
      }
    });

    const firstResponse = await makeRequest("/api/works/5046", detailApp);
    const secondResponse = await makeRequest("/api/works/5046", detailApp);

    expect(firstResponse.statusCode).toBe(200);
    expect(JSON.parse(firstResponse._getData())).toEqual({
      objectId: 5046,
      title: 'The "Shipwreck Medal"',
      artist: "Salathiel Ellis",
      date: "1845–57",
      context: "Medal - Bronze",
      imageUrl: "https://images.metmuseum.org/CRDImages/aw/original/DT5046.jpg",
      metUrl: "http://www.metmuseum.org/art/collection/search/5046"
    });
    expect(secondResponse.statusCode).toBe(200);
    expect(JSON.parse(secondResponse._getData()).imageUrl).toBe(
      "https://images.metmuseum.org/CRDImages/aw/original/DT5046.jpg"
    );
    expect(hydrationRequests).toEqual([
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/5046"
    ]);
    expect(getObjectHydrationState({ databasePath, objectId: 5046 })).toMatchObject({
      hydrationStatus: "hydrated",
      hydrationError: "",
      primaryImage: "https://images.metmuseum.org/CRDImages/aw/original/DT5046.jpg",
      primaryImageSmall: "https://images.metmuseum.org/CRDImages/aw/web-large/DT5046.jpg"
    });
  });

  test("GET /api/works/:objectId records a no_image hydration outcome and still returns local metadata", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-detail-hydration-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const hydrationRequests = [];

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const detailApp = createArtctlApp({
      catalogDatabasePath: databasePath,
      hydrationFetchImpl: async (resource) => {
        hydrationRequests.push(String(resource));

        return createJsonResponse({
          objectID: 5046,
          primaryImage: "",
          primaryImageSmall: ""
        });
      }
    });

    const firstResponse = await makeRequest("/api/works/5046", detailApp);
    const secondResponse = await makeRequest("/api/works/5046", detailApp);

    expect(firstResponse.statusCode).toBe(200);
    expect(JSON.parse(firstResponse._getData()).imageUrl).toBe("");
    expect(secondResponse.statusCode).toBe(200);
    expect(JSON.parse(secondResponse._getData()).imageUrl).toBe("");
    expect(hydrationRequests).toEqual([
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/5046"
    ]);
    expect(getObjectHydrationState({ databasePath, objectId: 5046 })).toMatchObject({
      hydrationStatus: "no_image",
      hydrationError: "",
      primaryImage: "",
      primaryImageSmall: ""
    });
  });

  test("GET /api/works/:objectId records a failed hydration outcome and still returns local metadata", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-detail-hydration-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const hydrationRequests = [];

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const detailApp = createArtctlApp({
      catalogDatabasePath: databasePath,
      hydrationFetchImpl: async (resource) => {
        hydrationRequests.push(String(resource));

        return createTextResponse("not found", { status: 404 });
      }
    });

    const firstResponse = await makeRequest("/api/works/5046", detailApp);
    const secondResponse = await makeRequest("/api/works/5046", detailApp);

    expect(firstResponse.statusCode).toBe(200);
    expect(JSON.parse(firstResponse._getData()).imageUrl).toBe("");
    expect(secondResponse.statusCode).toBe(200);
    expect(JSON.parse(secondResponse._getData()).imageUrl).toBe("");
    expect(hydrationRequests).toEqual([
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/5046"
    ]);
    expect(getObjectHydrationState({ databasePath, objectId: 5046 })).toMatchObject({
      hydrationStatus: "failed",
      hydrationError: "http_404",
      primaryImage: "",
      primaryImageSmall: ""
    });
  });

  test("GET /api/works/:objectId records a retry hydration outcome and still returns local metadata", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-detail-hydration-"));
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const hydrationRequests = [];

    expect(
      runCatalogImport({
        csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
        databasePath
      }).ok
    ).toBe(true);

    const detailApp = createArtctlApp({
      catalogDatabasePath: databasePath,
      hydrationFetchImpl: async (resource) => {
        hydrationRequests.push(String(resource));

        return createTextResponse("<html>challenge</html>", {
          status: 403,
          contentType: "text/html"
        });
      }
    });

    const firstResponse = await makeRequest("/api/works/5046", detailApp);
    const secondResponse = await makeRequest("/api/works/5046", detailApp);

    expect(firstResponse.statusCode).toBe(200);
    expect(JSON.parse(firstResponse._getData()).imageUrl).toBe("");
    expect(secondResponse.statusCode).toBe(200);
    expect(JSON.parse(secondResponse._getData()).imageUrl).toBe("");
    expect(hydrationRequests).toEqual([
      "https://collectionapi.metmuseum.org/public/collection/v1/objects/5046"
    ]);
    expect(getObjectHydrationState({ databasePath, objectId: 5046 })).toMatchObject({
      hydrationStatus: "retry",
      hydrationError: "http_403",
      primaryImage: "",
      primaryImageSmall: ""
    });
  });

  test("GET /api/works/:objectId retries once after an upstream cookie challenge", async () => {
    const challengeCookies = [
      "visid_incap_1662004=test-visitor; Path=/; Domain=.metmuseum.org",
      "incap_ses_1813_1662004=test-session; Path=/; Domain=.metmuseum.org"
    ];
    const requests = [];
    const metClient = createMetApiClient({
      async fetchImpl(resource, init = {}) {
        const url = String(resource);
        requests.push({ url, cookie: init.headers?.cookie ?? "" });

        if (url.endsWith("/objects/436121") && requests.length === 1) {
          return createTextResponse("<html>blocked</html>", {
            status: 403,
            contentType: "text/html",
            setCookies: challengeCookies
          });
        }

        if (url.endsWith("/objects/436121")) {
          return createJsonResponse({
            objectID: 436121,
            title: "The Great Wave off Kanagawa",
            artistDisplayName: "",
            culture: "Japanese",
            objectDate: "ca. 1830-32",
            objectName: "Print",
            medium: "Polychrome woodblock print; ink and color on paper",
            primaryImage: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg",
            objectURL: "https://www.metmuseum.org/art/collection/search/45434"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const detailApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/works/436121", detailApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData()).objectId).toBe(436121);
    expect(requests).toEqual([
      {
        url: "https://collectionapi.metmuseum.org/public/collection/v1/objects/436121",
        cookie: ""
      },
      {
        url: "https://collectionapi.metmuseum.org/public/collection/v1/objects/436121",
        cookie: "visid_incap_1662004=test-visitor; incap_ses_1813_1662004=test-session"
      }
    ]);
  });
});

describe("search API", () => {
  test("GET /api/search returns 503 when the local catalog is not initialized", async () => {
    const catalog = createUninitializedCatalog();
    const searchApp = createArtctlApp({ catalog });

    const response = await makeRequest("/api/search?q=sunflowers", searchApp);

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response._getData())).toEqual({
      error: "Catalog is not initialized.",
      scope: "catalog",
      code: "CATALOG_NOT_INITIALIZED"
    });
  });

  test("GET /api/search uses explicit readiness metadata from the catalog", async () => {
    const catalog = createUninitializedCatalog({
      error: "Catalog import required.",
      scope: "catalog",
      code: "CATALOG_IMPORT_REQUIRED"
    });
    const searchApp = createArtctlApp({ catalog });

    const response = await makeRequest("/api/search?q=sunflowers", searchApp);

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response._getData())).toEqual({
      error: "Catalog import required.",
      scope: "catalog",
      code: "CATALOG_IMPORT_REQUIRED"
    });
  });

  test("GET /api/search returns results from the local catalog when initialized", async () => {
    const catalog = {
      isReady() {
        return true;
      },
      async searchCollection(searchState) {
        expect(searchState).toEqual({
          query: "sunflowers",
          departmentId: null,
          medium: "",
          page: 1
        });

        return {
          query: "sunflowers",
          results: [
            {
              objectId: 436524,
              title: "Sunflowers",
              artist: "Vincent van Gogh",
              date: "1887",
              imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DP130155.jpg",
              isPublicDomain: true,
              hasImage: true
            }
          ]
        };
      }
    };
    const searchApp = createArtctlApp({ catalog });

    const response = await makeRequest("/api/search?q=sunflowers", searchApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      query: "sunflowers",
      results: [
        {
          objectId: 436524,
          title: "Sunflowers",
          artist: "Vincent van Gogh",
          date: "1887",
          imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DP130155.jpg",
          isPublicDomain: true,
          hasImage: true
        }
      ]
    });
  });

  test("GET /api/search still rejects an empty query before consulting the local catalog", async () => {
    const catalog = {
      isReady() {
        return true;
      },
      searchCollection: vi.fn()
    };
    const searchApp = createArtctlApp({ catalog });

    const response = await makeRequest("/api/search?q=%20%20%20", searchApp);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response._getData())).toEqual({
      error: "Query is required."
    });
    expect(catalog.searchCollection).not.toHaveBeenCalled();
  });

  test("GET /api/search returns catalog readiness metadata without live Met fetches through the default app path", async () => {
    const originalFetch = global.fetch;
    const fetchSpy = vi.fn(async (resource) => {
      throw new Error(`Unexpected Met API request: ${String(resource)}`);
    });
    global.fetch = fetchSpy;

    try {
      const searchApp = createArtctlApp();

      const response = await makeRequest("/api/search?q=sunflowers", searchApp);

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response._getData())).toEqual({
        error: "Catalog is not initialized.",
        scope: "catalog",
        code: "CATALOG_NOT_INITIALIZED"
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("GET /api/search returns catalog readiness metadata through the default app path", async () => {
    const searchApp = createArtctlApp();

    const response = await makeRequest("/api/search?q=sunflowers", searchApp);

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response._getData())).toEqual({
      error: "Catalog is not initialized.",
      scope: "catalog",
      code: "CATALOG_NOT_INITIALIZED"
    });
  });

  test("GET /api/search/departments returns Met department options", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.endsWith("/departments")) {
          return createJsonResponse({
            departments: [
              { departmentId: 11, displayName: "European Paintings" },
              { departmentId: 6, displayName: "Arms and Armor" }
            ]
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const searchApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/search/departments", searchApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      departments: [
        { departmentId: 11, displayName: "European Paintings" },
        { departmentId: 6, displayName: "Arms and Armor" }
      ]
    });
  });

  test("GET /api/search/departments returns department options from the local catalog when initialized", async () => {
    const catalog = {
      isReady() {
        return true;
      },
      async getDepartments() {
        return {
          departments: [
            { departmentId: 1, displayName: "Asian Art" },
            { departmentId: 2, displayName: "Drawings and Prints" }
          ]
        };
      }
    };
    const searchApp = createArtctlApp({ catalog });

    const response = await makeRequest("/api/search/departments", searchApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      departments: [
        { departmentId: 1, displayName: "Asian Art" },
        { departmentId: 2, displayName: "Drawings and Prints" }
      ]
    });
  });

  test("GET /api/search/departments returns 503 when the local catalog is not initialized", async () => {
    const catalog = {
      isReady() {
        return false;
      }
    };
    const searchApp = createArtctlApp({ catalog });

    const response = await makeRequest("/api/search/departments", searchApp);

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response._getData())).toEqual({
      error: "Catalog is not initialized.",
      scope: "catalog",
      code: "CATALOG_NOT_INITIALIZED"
    });
  });

  test("GET /api/search returns a JSON error when the Met upstream responds with HTML", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.includes("/search?")) {
          return createTextResponse("<html>blocked</html>", {
            status: 403,
            contentType: "text/html"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const searchApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/search?q=sunflowers", searchApp);

    expect(response.statusCode).toBe(502);
    const payload = JSON.parse(response._getData());
    expect(payload).toMatchObject({
      error: "Met API returned a non-JSON search response.",
      backoff: true,
      scope: "met"
    });
    expect(payload.retryAfterMs).toBeGreaterThan(0);
  });

  test("GET /api/search stops re-hitting the challenged Met search endpoint during recovery", async () => {
    const searchRequests = [];
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.includes("/search?")) {
          searchRequests.push(url);
          return createTextResponse("<html>blocked</html>", {
            status: 403,
            contentType: "text/html"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const searchApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const firstResponse = await makeRequest("/api/search?q=sunflowers", searchApp);
    const secondResponse = await makeRequest("/api/search?q=iris", searchApp);
    const thirdResponse = await makeRequest("/api/search?q=monet", searchApp);

    expect(firstResponse.statusCode).toBe(502);
    expect(secondResponse.statusCode).toBe(502);
    expect(thirdResponse.statusCode).toBe(502);
    expect(JSON.parse(secondResponse._getData())).toMatchObject({
      error: "Met API returned a non-JSON search response.",
      backoff: true,
      scope: "met"
    });
    expect(JSON.parse(thirdResponse._getData())).toMatchObject({
      error: "Met API returned a non-JSON search response.",
      backoff: true,
      scope: "met"
    });
    expect(searchRequests).toHaveLength(1);
  });

  test("GET /api/search keeps a deterministic error during recovery and retries after cooldown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-09T00:00:00.000Z"));

    try {
      const searchRequests = [];
      const metClient = createMetApiClient({
        searchChallengeCooldownMs: 1000,
        async fetchImpl(resource) {
          const url = String(resource);

          if (url.includes("/search?")) {
            searchRequests.push(url);

            if (searchRequests.length === 1) {
              return createTextResponse("<html>blocked</html>", {
                status: 403,
                contentType: "text/html"
              });
            }

            return createJsonResponse({
              total: 1,
              objectIDs: [436524]
            });
          }

          if (url.endsWith("/objects/436524")) {
            return createJsonResponse({
              objectID: 436524,
              title: "Sunflowers",
              artistDisplayName: "Vincent van Gogh",
              culture: "",
              objectDate: "1887",
              primaryImage: "",
              primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DP130155.jpg"
            });
          }

          throw new Error(`Unexpected Met API request: ${url}`);
        }
      });
      const searchApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

      const firstResponse = await makeRequest("/api/search?q=sunflowers", searchApp);

      vi.setSystemTime(new Date("2026-05-09T00:00:00.500Z"));
      const cooldownResponse = await makeRequest("/api/search?q=iris", searchApp);

      vi.setSystemTime(new Date("2026-05-09T00:00:01.001Z"));
      const recoveredResponse = await makeRequest("/api/search?q=iris", searchApp);

      expect(firstResponse.statusCode).toBe(502);
      expect(JSON.parse(firstResponse._getData())).toEqual({
        error: "Met API returned a non-JSON search response.",
        backoff: true,
        scope: "met",
        retryAfterMs: 1000
      });
      expect(cooldownResponse.statusCode).toBe(502);
      expect(JSON.parse(cooldownResponse._getData())).toEqual({
        error: "Met API returned a non-JSON search response.",
        backoff: true,
        scope: "met",
        retryAfterMs: 500
      });
      expect(recoveredResponse.statusCode).toBe(200);
      expect(JSON.parse(recoveredResponse._getData())).toEqual({
        query: "iris",
        results: [
          {
            objectId: 436524,
            title: "Sunflowers",
            artist: "Vincent van Gogh",
            date: "1887",
            imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DP130155.jpg",
            isPublicDomain: false,
            hasImage: true
          }
        ]
      });
      expect(searchRequests).toEqual([
        "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=sunflowers",
        "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=iris"
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("GET /api/search reuses cached results for the same query", async () => {
    const requests = [];
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);
        requests.push(url);

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 1,
            objectIDs: [436524]
          });
        }

        if (url.endsWith("/objects/436524")) {
          return createJsonResponse({
            objectID: 436524,
            title: "Sunflowers",
            artistDisplayName: "Vincent van Gogh",
            culture: "",
            objectDate: "1887",
            primaryImage: "",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DP130155.jpg"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const searchApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const firstResponse = await makeRequest("/api/search?q=van%20gogh", searchApp);
    const secondResponse = await makeRequest("/api/search?q=van%20gogh", searchApp);

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(JSON.parse(secondResponse._getData())).toEqual({
      query: "van gogh",
      results: [
        {
          objectId: 436524,
          title: "Sunflowers",
          artist: "Vincent van Gogh",
          date: "1887",
          imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DP130155.jpg",
          isPublicDomain: false,
          hasImage: true
        }
      ]
    });
    expect(requests).toHaveLength(2);
  });

  test("GET /api/search filters results by the curated medium value", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 2,
            objectIDs: [436524, 486055]
          });
        }

        if (url.endsWith("/objects/436524")) {
          return createJsonResponse({
            objectID: 436524,
            title: "Sunflowers",
            artistDisplayName: "Vincent van Gogh",
            culture: "",
            objectDate: "1887",
            medium: "Oil on canvas",
            primaryImage: "",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg"
          });
        }

        if (url.endsWith("/objects/486055")) {
          return createJsonResponse({
            objectID: 486055,
            title: "Under the Wave off Kanagawa",
            artistDisplayName: "Katsushika Hokusai",
            culture: "",
            objectDate: "1830-32",
            medium: "Polychrome woodblock print; ink and color on paper",
            primaryImage: "",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const searchApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/search?q=wave&medium=wood", searchApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      query: "wave",
      results: [
        {
          objectId: 486055,
          title: "Under the Wave off Kanagawa",
          artist: "Katsushika Hokusai",
          date: "1830-32",
          imageUrl: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg",
          isPublicDomain: false,
          hasImage: true
        }
      ]
    });
  });

  test("GET /api/search backfills invalid hydrated objects to keep a full page", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 15,
            objectIDs: Array.from({ length: 15 }, (_, index) => index + 1)
          });
        }

        const objectId = Number(url.split("/").at(-1));

        if ([2, 5, 11].includes(objectId)) {
          return createJsonResponse({
            objectID: objectId,
            title: "",
            artistDisplayName: `Artist ${objectId}`,
            culture: "",
            objectDate: "1900",
            primaryImage: "",
            primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
          });
        }

        return createJsonResponse({
          objectID: objectId,
          title: `Work ${objectId}`,
          artistDisplayName: `Artist ${objectId}`,
          culture: "",
          objectDate: "1900",
          primaryImage: "",
          primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
        });
      }
    });
    const searchApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/search?q=works&page=1", searchApp);
    const payload = JSON.parse(response._getData());

    expect(response.statusCode).toBe(200);
    expect(payload.results).toHaveLength(12);
    expect(payload.results.map((result) => result.objectId)).toEqual([
      1, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15
    ]);
  });

  test("GET /api/search returns explicit public-domain and image-availability flags", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 2,
            objectIDs: [436524, 486055]
          });
        }

        if (url.endsWith("/objects/436524")) {
          return createJsonResponse({
            objectID: 436524,
            title: "Sunflowers",
            artistDisplayName: "Vincent van Gogh",
            culture: "",
            objectDate: "1887",
            isPublicDomain: true,
            primaryImage: "https://images.metmuseum.org/CRDImages/ep/original/DT1567.jpg",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg"
          });
        }

        if (url.endsWith("/objects/486055")) {
          return createJsonResponse({
            objectID: 486055,
            title: "Galisteo Creek",
            artistDisplayName: "Susan Rothenberg",
            culture: "",
            objectDate: "1992",
            isPublicDomain: false,
            primaryImage: "",
            primaryImageSmall: ""
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const searchApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/search?q=van%20gogh", searchApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      query: "van gogh",
      results: [
        {
          objectId: 436524,
          title: "Sunflowers",
          artist: "Vincent van Gogh",
          date: "1887",
          imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg",
          isPublicDomain: true,
          hasImage: true
        },
        {
          objectId: 486055,
          title: "Galisteo Creek",
          artist: "Susan Rothenberg",
          date: "1992",
          imageUrl: "",
          isPublicDomain: false,
          hasImage: false
        }
      ]
    });
  });
});

describe("gallery API", () => {
  test("GET /api/gallery returns 503 when the local catalog is not initialized", async () => {
    const catalog = {
      isReady() {
        return false;
      }
    };
    const galleryApp = createArtctlApp({ catalog });

    const response = await makeRequest("/api/gallery", galleryApp);

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response._getData())).toEqual({
      error: "Catalog is not initialized.",
      scope: "catalog",
      code: "CATALOG_NOT_INITIALIZED"
    });
  });

  test("GET /api/gallery returns results from the local catalog when initialized", async () => {
    const catalog = {
      isReady() {
        return true;
      },
      async getGalleryPage() {
        return {
          results: [
            {
              artist: "Vincent van Gogh",
              artistSlug: "vincent-van-gogh",
              imageUrl: "https://images.example.test/gallery/van-gogh.jpg",
              workCount: 12
            }
          ]
        };
      }
    };
    const galleryApp = createArtctlApp({ catalog });

    const response = await makeRequest("/api/gallery", galleryApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      results: [
        {
          artist: "Vincent van Gogh",
          artistSlug: "vincent-van-gogh",
          imageUrl: "https://images.example.test/gallery/van-gogh.jpg",
          workCount: 12
        }
      ]
    });
  });

  test("Met-backed routes share cooldown metadata after a detected Met challenge", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-09T00:00:00.000Z"));

    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    try {
      const requests = [];
      const metClient = createMetApiClient({
        searchChallengeCooldownMs: 1000,
        async fetchImpl(resource) {
          const url = String(resource);
          requests.push(url);

          if (url.includes("/search?")) {
            return createTextResponse("<html>blocked</html>", {
              status: 403,
              contentType: "text/html"
            });
          }

          if (url.endsWith("/objects/436121")) {
            return createJsonResponse({
              objectID: 436121,
              title: "The Great Wave off Kanagawa",
              artistDisplayName: "",
              culture: "Japanese",
              objectDate: "ca. 1830-32",
              objectName: "Print",
              medium: "Polychrome woodblock print; ink and color on paper",
              primaryImage: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
              primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg",
              objectURL: "https://www.metmuseum.org/art/collection/search/45434"
            });
          }

          throw new Error(`Unexpected Met API request: ${url}`);
        }
      });
      const metApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

      const galleryResponse = await makeRequest("/api/gallery", metApp);
      vi.setSystemTime(new Date("2026-05-09T00:00:00.500Z"));
      const searchResponse = await makeRequest("/api/search?q=wave", metApp);
      const workResponse = await makeRequest("/api/works/436121", metApp);

      expect(galleryResponse.statusCode).toBe(502);
      expect(JSON.parse(galleryResponse._getData())).toEqual({
        error: "The Met gallery is temporarily unavailable. Please try again.",
        backoff: true,
        scope: "met",
        retryAfterMs: 1000
      });
      expect(searchResponse.statusCode).toBe(502);
      expect(JSON.parse(searchResponse._getData())).toEqual({
        error: "Met API returned a non-JSON search response.",
        backoff: true,
        scope: "met",
        retryAfterMs: 500
      });
      expect(workResponse.statusCode).toBe(502);
      expect(JSON.parse(workResponse._getData())).toEqual({
        error: "Met API returned a non-JSON work response.",
        backoff: true,
        scope: "met",
        retryAfterMs: 500
      });
      expect(requests).toEqual([
        "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&q=*"
      ]);
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        "[met-api] cooldown started",
        expect.objectContaining({
          scope: "met",
          retryAfterMs: 1000
        })
      );
    } finally {
      consoleInfoSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  test("Met-backed routes resume normal responses after the cooldown window expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-09T00:00:00.000Z"));

    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    try {
      const requests = [];
      const metClient = createMetApiClient({
        searchChallengeCooldownMs: 1000,
        async fetchImpl(resource) {
          const url = String(resource);
          requests.push(url);

          if (url.includes("/search?")) {
            return createTextResponse("<html>blocked</html>", {
              status: 403,
              contentType: "text/html"
            });
          }

          if (url.endsWith("/objects/436121")) {
            return createJsonResponse({
              objectID: 436121,
              title: "The Great Wave off Kanagawa",
              artistDisplayName: "",
              culture: "Japanese",
              objectDate: "ca. 1830-32",
              objectName: "Print",
              medium: "Polychrome woodblock print; ink and color on paper",
              primaryImage: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
              primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg",
              objectURL: "https://www.metmuseum.org/art/collection/search/45434"
            });
          }

          throw new Error(`Unexpected Met API request: ${url}`);
        }
      });
      const metApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

      const galleryResponse = await makeRequest("/api/gallery", metApp);

      vi.setSystemTime(new Date("2026-05-09T00:00:00.500Z"));
      const blockedWorkResponse = await makeRequest("/api/works/436121", metApp);

      vi.setSystemTime(new Date("2026-05-09T00:00:01.001Z"));
      const recoveredWorkResponse = await makeRequest("/api/works/436121", metApp);

      expect(galleryResponse.statusCode).toBe(502);
      expect(blockedWorkResponse.statusCode).toBe(502);
      expect(JSON.parse(blockedWorkResponse._getData())).toEqual({
        error: "Met API returned a non-JSON work response.",
        backoff: true,
        scope: "met",
        retryAfterMs: 500
      });
      expect(recoveredWorkResponse.statusCode).toBe(200);
      expect(JSON.parse(recoveredWorkResponse._getData())).toEqual({
        objectId: 436121,
        title: "The Great Wave off Kanagawa",
        artist: "Japanese",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434"
      });
      expect(requests).toEqual([
        "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&q=*",
        "https://collectionapi.metmuseum.org/public/collection/v1/objects/436121"
      ]);
      expect(consoleInfoSpy).toHaveBeenCalledWith("[met-api] cooldown cleared", {
        scope: "met"
      });
    } finally {
      consoleInfoSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  test("GET /api/gallery uses highlight search to build a deterministic gallery batch", async () => {
    const requests = [];
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);
        requests.push(url);

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 4,
            objectIDs: [500, 475, 498, 490]
          });
        }

        const objectId = Number(url.split("/").at(-1));

        return createJsonResponse({
          objectID: objectId,
          title: `Work ${objectId}`,
          artistDisplayName: `Artist ${objectId}`,
          culture: "",
          isHighlight: true,
          isPublicDomain: true,
          primaryImage: "",
          primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
        });
      }
    });
    const galleryApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/gallery", galleryApp);
    const searchRequest = new URL(requests[0]);

    expect(response.statusCode).toBe(200);
    expect(searchRequest.pathname).toBe("/public/collection/v1/search");
    expect(searchRequest.searchParams.get("isHighlight")).toBe("true");
    expect(searchRequest.searchParams.get("hasImages")).toBe("true");
    expect(searchRequest.searchParams.get("q")).toBe("*");
    expect(JSON.parse(response._getData()).results).toHaveLength(4);
    expect(JSON.parse(response._getData()).results[0]).toEqual({
      objectId: 475,
      title: "Work 475",
      artist: "Artist 475",
      imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/475.jpg"
    });
    expect(JSON.parse(response._getData()).results.at(-1).objectId).toBe(500);
  });

  test("GET /api/gallery serves curated local gallery results without live Met fetches", async () => {
    const fetchSpy = vi.fn(async (resource) => {
      throw new Error(`Unexpected Met API request: ${String(resource)}`);
    });
    const metClient = createMetApiClient({
      fetchImpl: fetchSpy,
      curatedGalleryRecords: [
        {
          objectID: 436121,
          title: "The Great Wave off Kanagawa",
          artistDisplayName: "",
          culture: "Japanese",
          isPublicDomain: true,
          primaryImage: "",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"
        }
      ]
    });
    const galleryApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/gallery", galleryApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      results: [
        {
          artist: "Japanese",
          artistSlug: "japanese",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/436121/preview",
          workCount: 1
        }
      ]
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("GET /api/gallery returns catalog readiness metadata through the default app path", async () => {
    const originalFetch = global.fetch;
    const fetchSpy = vi.fn(async (resource) => {
      throw new Error(`Unexpected Met API request: ${String(resource)}`);
    });
    global.fetch = fetchSpy;

    try {
      const galleryApp = createArtctlApp();

      const response = await makeRequest("/api/gallery", galleryApp);

      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response._getData())).toEqual({
        error: "Catalog is not initialized.",
        scope: "catalog",
        code: "CATALOG_NOT_INITIALIZED"
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("GET /api/gallery skips invalid curated local records while preserving valid results", async () => {
    const fetchSpy = vi.fn(async (resource) => {
      throw new Error(`Unexpected Met API request: ${String(resource)}`);
    });
    const metClient = createMetApiClient({
      fetchImpl: fetchSpy,
      curatedGalleryRecords: [
        {
          objectID: 436121,
          title: "The Great Wave off Kanagawa",
          artistDisplayName: "",
          culture: "Japanese",
          isPublicDomain: true,
          primaryImage: "",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"
        },
        {
          objectID: 999001,
          title: "",
          artistDisplayName: "Unknown",
          culture: "",
          isPublicDomain: true,
          primaryImage: "",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/test/web-large/999001.jpg"
        },
        {
          objectID: 999002,
          title: "Hidden Work",
          artistDisplayName: "Unknown",
          culture: "",
          isPublicDomain: false,
          primaryImage: "",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/test/web-large/999002.jpg"
        },
        {
          objectID: 999003,
          title: "No Image Work",
          artistDisplayName: "Unknown",
          culture: "",
          isPublicDomain: true,
          primaryImage: "",
          primaryImageSmall: ""
        }
      ]
    });
    const galleryApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/gallery", galleryApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      results: [
        {
          artist: "Japanese",
          artistSlug: "japanese",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/436121/preview",
          workCount: 1
        }
      ]
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("GET /api/gallery limits curated local results to 12 deterministic artist summaries", async () => {
    const fetchSpy = vi.fn(async (resource) => {
      throw new Error(`Unexpected Met API request: ${String(resource)}`);
    });
    const curatedGalleryRecords = Array.from({ length: 26 }, (_, index) => {
      const objectId = 700000 + index;

      return {
        objectID: objectId,
        title: `Curated Work ${objectId}`,
        artistDisplayName: `Artist ${objectId}`,
        culture: "",
        isPublicDomain: true,
        primaryImage: "",
        primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
      };
    });
    const metClient = createMetApiClient({
      fetchImpl: fetchSpy,
      curatedGalleryRecords
    });
    const galleryApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/gallery", galleryApp);
    const payload = JSON.parse(response._getData());

    expect(response.statusCode).toBe(200);
    expect(payload.results).toHaveLength(12);
    expect(payload.results[0]).toEqual({
      artist: "Artist 700000",
      artistSlug: "artist-700000",
      imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/700000/preview",
      workCount: 1
    });
    expect(payload.results.at(-1)).toEqual({
      artist: "Artist 700011",
      artistSlug: "artist-700011",
      imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/700011/preview",
      workCount: 1
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("GET /api/artists/:artistSlug returns the curated 50-work gallery for that artist", async () => {
    const originalFetch = global.fetch;
    const fetchSpy = vi.fn(async (resource) => {
      throw new Error(`Unexpected Met API request: ${String(resource)}`);
    });
    global.fetch = fetchSpy;

    try {
      const galleryApp = createArtctlApp();

      const response = await makeRequest("/api/artists/vincent-van-gogh", galleryApp);
      const payload = JSON.parse(response._getData());

      expect(response.statusCode).toBe(200);
      expect(payload.results).toHaveLength(50);
      expect(payload.results[0]).toEqual({
        objectId: 436524,
        title: "Sunflowers",
        artist: "Vincent van Gogh",
        imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DP-41223-001.jpg"
      });
      expect(payload.results.at(-1)).toEqual({
        objectId: 500049,
        title: "Curated Van Gogh Work 50",
        artist: "Vincent van Gogh",
        imageUrl: "https://images.metmuseum.org/CRDImages/seed/web-large/vincent-van-gogh-500049.jpg"
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("GET /api/gallery skips individual object fetch failures while building the first batch", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 26,
            objectIDs: Array.from({ length: 26 }, (_, index) => 500 - index)
          });
        }

        const objectId = Number(url.split("/").at(-1));

        if (objectId === 490) {
          throw new Error("socket hang up");
        }

        return createJsonResponse({
          objectID: objectId,
          title: `Work ${objectId}`,
          artistDisplayName: `Artist ${objectId}`,
          culture: "",
          isHighlight: true,
          isPublicDomain: true,
          primaryImage: "",
          primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
        });
      }
    });
    const galleryApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/gallery", galleryApp);
    const results = JSON.parse(response._getData()).results;

    expect(response.statusCode).toBe(200);
    expect(results).toHaveLength(24);
    expect(results.some((work) => work.objectId === 490)).toBe(false);
    expect(results.at(-1).objectId).toBe(499);
  });

  test("GET /api/gallery reuses challenge cookies across the upstream fanout", async () => {
    const challengeCookies = [
      "visid_incap_1662004=test-visitor; Path=/; Domain=.metmuseum.org",
      "incap_ses_1813_1662004=test-session; Path=/; Domain=.metmuseum.org"
    ];
    const requests = [];
    const metClient = createMetApiClient({
      async fetchImpl(resource, init = {}) {
        const url = String(resource);
        requests.push({ url, cookie: init.headers?.cookie ?? "" });

        if (url.includes("/search?") && requests.length === 1) {
          return createTextResponse("<html>blocked</html>", {
            status: 403,
            contentType: "text/html",
            setCookies: challengeCookies
          });
        }

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 24,
            objectIDs: Array.from({ length: 24 }, (_, index) => index + 1)
          });
        }

        const objectId = Number(url.split("/").at(-1));

        return createJsonResponse({
          objectID: objectId,
          title: `Work ${objectId}`,
          artistDisplayName: `Artist ${objectId}`,
          culture: "",
          isHighlight: true,
          isPublicDomain: true,
          primaryImage: "",
          primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
        });
      }
    });
    const galleryApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const response = await makeRequest("/api/gallery", galleryApp);
    const objectRequestCookies = requests
      .filter(({ url }) => /\/objects\/\d+$/.test(url))
      .map(({ cookie }) => cookie);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData()).results).toHaveLength(24);
    expect(requests.slice(0, 2)).toEqual([
      {
        url: "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&q=*",
        cookie: ""
      },
      {
        url: "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&q=*",
        cookie: "visid_incap_1662004=test-visitor; incap_ses_1813_1662004=test-session"
      }
    ]);
    expect(objectRequestCookies.every(Boolean)).toBe(true);
  });

  test("GET /api/gallery serves the last cached gallery page when a later upstream request times out", async () => {
    const stableGalleryIds = [475, 490, 498];
    let galleryFetches = 0;
    const metClient = createMetApiClient({
      cacheTtlMs: 0,
      requestTimeoutMs: 5,
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.includes("/search?")) {
          galleryFetches += 1;

          if (galleryFetches === 1) {
            return createJsonResponse({
              total: stableGalleryIds.length,
              objectIDs: stableGalleryIds
            });
          }

          return new Promise(() => {});
        }

        const objectId = Number(url.split("/").at(-1));

        return createJsonResponse({
          objectID: objectId,
          title: `Work ${objectId}`,
          artistDisplayName: `Artist ${objectId}`,
          culture: "",
          isHighlight: true,
          isPublicDomain: true,
          primaryImage: "",
          primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
        });
      }
    });
    const galleryApp = createArtctlApp({ metClient, allowLegacyMetRuntime: true });

    const firstResponse = await makeRequest("/api/gallery", galleryApp);
    const secondResponse = await makeRequest("/api/gallery", galleryApp);

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(JSON.parse(secondResponse._getData())).toEqual(JSON.parse(firstResponse._getData()));
    expect(galleryFetches).toBe(3);
  });
});
