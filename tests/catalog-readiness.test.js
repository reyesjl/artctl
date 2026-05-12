import { describe, expect, test } from "vitest";
import { createUninitializedCatalog } from "../server/catalog.js";

describe("catalog readiness", () => {
  test("createUninitializedCatalog reports explicit not-initialized readiness metadata", () => {
    const catalog = createUninitializedCatalog();

    expect(catalog.isReady()).toBe(false);
    expect(catalog.getReadiness()).toEqual({
      error: "Catalog is not initialized.",
      scope: "catalog",
      code: "CATALOG_NOT_INITIALIZED"
    });
  });
});
