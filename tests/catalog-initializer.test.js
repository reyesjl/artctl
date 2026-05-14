import { describe, expect, test } from "vitest";
import { createRuntimeCatalog } from "../server/catalog.js";

describe("runtime catalog initializer", () => {
  test("createRuntimeCatalog returns an explicit uninitialized catalog when records are missing", () => {
    const catalog = createRuntimeCatalog();

    expect(catalog.isReady()).toBe(false);
    expect(catalog.getReadiness()).toEqual({
      error: "Catalog is not initialized.",
      scope: "catalog",
      code: "CATALOG_NOT_INITIALIZED"
    });
  });

  test("createRuntimeCatalog returns a ready in-memory catalog when records are provided", async () => {
    const catalog = createRuntimeCatalog({
      records: [
        {
          objectID: 436524,
          title: "Sunflowers",
          artistDisplayName: "Vincent van Gogh",
          culture: "",
          objectDate: "1887",
          department: "European Paintings",
          primaryImage: "",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg",
          isPublicDomain: true
        }
      ]
    });

    expect(catalog.isReady()).toBe(true);
    await expect(catalog.searchCollection({ query: "sunflowers" })).resolves.toEqual({
      query: "sunflowers",
      totalResults: 1,
      results: [
        {
          objectId: 436524,
          title: "Sunflowers",
          artist: "Vincent van Gogh",
          date: "1887",
          department: "European Paintings",
          imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg",
          isPublicDomain: true,
          hasImage: true
        }
      ]
    });
  });
});
