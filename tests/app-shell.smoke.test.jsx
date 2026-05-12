import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import httpMocks from "node-mocks-http";
import { App } from "../src/App.jsx";
import { createArtctlApp } from "../server/app.js";
import { createRuntimeCatalog } from "../server/catalog.js";
import { runCatalogImport } from "../server/catalog-import.js";
import { THEMES } from "../src/themes.js";
import { createTrackedTempDir } from "./temp-dir.js";

const defaultMetClient = {
  async getDepartments() {
    return { departments: [] };
  },

  async getGalleryPage() {
    return { results: [] };
  },

  async searchCollection(query) {
    return { query, results: [] };
  },

  async getWork() {
    return null;
  }
};

function createFetchImpl({
  requestLog = [],
  metClient,
  catalogDatabasePath = null,
  hydrationFetchImpl
} = {}) {
  const apiApp = metClient
    ? createArtctlApp({ metClient, allowLegacyMetRuntime: true })
    : createArtctlApp({ catalogDatabasePath, hydrationFetchImpl });

  return async function fetchImpl(resource, init = {}) {
    const url = new URL(resource, "http://artctl.test");
    const method = init.method ?? "GET";
    requestLog.push(
      method === "GET" ? `${url.pathname}${url.search}` : `${method} ${url.pathname}${url.search}`
    );

    const request = httpMocks.createRequest({
      method,
      url: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body: init.body ? JSON.parse(init.body) : undefined
    });
    const response = httpMocks.createResponse({ eventEmitter: EventEmitter });

    await new Promise((resolve, reject) => {
      response.on("end", resolve);
      response.on("error", reject);
      apiApp.handle(request, response, reject);
    });

    return {
      ok: response.statusCode >= 200 && response.statusCode < 300,
      status: response.statusCode,
      async json() {
        return JSON.parse(response._getData());
      }
    };
  };
}

async function seedAdminGallery(fetchImpl, objectIds) {
  for (const objectId of objectIds) {
    const response = await fetchImpl("http://artctl.test/api/admin/gallery", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ objectId })
    });

    if (!response.ok) {
      throw new Error(`Unable to seed admin gallery for object ${objectId}.`);
    }
  }
}

const fetchImpl = createFetchImpl();
const storage = new Map();

function installLocalStorage() {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
      clear() {
        storage.clear();
      }
    }
  });
}

beforeEach(() => {
  cleanup();
  installLocalStorage();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

test("homepage loads the persistent app shell from the Express backend", async () => {
  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByText("ARTCTL", { selector: ".brand" })).toBeInTheDocument();
  expect(screen.queryByText("[ARTCTL]")).not.toBeInTheDocument();
  expect(screen.queryByText("Met collection terminal viewer")).not.toBeInTheDocument();
  expect(window.localStorage.getItem("artctl-theme")).toBe("dark-green");
  expect(document.documentElement.style.getPropertyValue("--background")).toBe("220 20% 4%");
  expect(screen.getByRole("link", { name: "[gallery]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[search]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[help]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[themes]" })).toBeInTheDocument();
});

test("homepage uses a wider route frame than standard pages", async () => {
  window.history.pushState({}, "", "/");

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("heading", { name: "Gallery" })).toBeInTheDocument();
  const galleryMain = screen.getByRole("main");
  expect(galleryMain.className).toContain("max-w-7xl");

  cleanup();
  window.history.pushState({}, "", "/search");

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("heading", { name: "Search" })).toBeInTheDocument();
  const searchMain = screen.getByRole("main");
  expect(searchMain.className).toContain("max-w-[896px]");
});

test("work route uses the wider route frame", async () => {
  window.history.pushState({}, "", "/works/42");

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("heading", { name: "Work 42" })).toBeInTheDocument();
  expect(screen.getByRole("main").className).toContain("max-w-7xl");
});

test.each([
  { route: "/", heading: "Gallery" },
  { route: "/search", heading: "Search" },
  { route: "/works/42", heading: "Work 42" },
  { route: "/admin", heading: "Admin" },
  { route: "/admin/curated-groups", heading: "Curated Groups" },
  { route: "/admin/curated-groups/new", heading: "Create Curated Group" },
  { route: "/admin/curated-groups/homepage", heading: "Homepage Gallery" },
  { route: "/help", heading: "Help" },
  { route: "/themes", heading: "Themes" }
])("route $route renders its skeleton inside the shared shell", async ({ route, heading }) => {
  window.history.pushState({}, "", route);

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByText("ARTCTL", { selector: ".brand" })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[gallery]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[search]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[help]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[themes]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[admin]" })).toBeInTheDocument();
});

test("legacy /admin/gallery route no longer opens the curated group editor", async () => {
  window.history.pushState({}, "", "/admin/gallery");

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByText("ARTCTL", { selector: ".brand" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Admin Gallery" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Homepage Gallery" })).not.toBeInTheDocument();
  expect(screen.queryByRole("main")).not.toBeInTheDocument();
});

test("curated groups route renders a selectable text list of groups", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  window.history.pushState({}, "", "/admin/curated-groups");

  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />
  );

  expect(await screen.findByRole("heading", { name: "Curated Groups" })).toBeInTheDocument();
  expect(requests).toContain("/api/admin/curated-groups");
  expect(await screen.findByRole("link", { name: "Homepage Gallery" })).toHaveAttribute(
    "href",
    "/admin/curated-groups/homepage"
  );
  expect(screen.getByRole("link", { name: "Create Group" })).toHaveAttribute(
    "href",
    "/admin/curated-groups/new"
  );
  expect(screen.getByRole("main").className).toContain("max-w-[896px]");
});

test("create curated group route can create a new editorial group", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  window.history.pushState({}, "", "/admin/curated-groups/new");

  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />
  );

  expect(await screen.findByRole("heading", { name: "Create Curated Group" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Group Slug"), {
    target: { value: "featured-landscapes" }
  });
  fireEvent.change(screen.getByLabelText("Group Name"), {
    target: { value: "Featured Landscapes" }
  });
  fireEvent.submit(screen.getByRole("button", { name: "Create Group" }).closest("form"));

  expect(await screen.findByRole("link", { name: "Featured Landscapes" })).toHaveAttribute(
    "href",
    "/admin/curated-groups/featured-landscapes"
  );
  expect(requests).toContain("POST /api/admin/curated-groups");
});

test("curated groups route can feature a group on the homepage", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const csvPath = path.join(tempDir, "featured-homepage-gallery.csv");
  const requests = [];

  writeFileSync(
    csvPath,
    "Object ID,Department,Title,Artist Display Name,Object Date,Object Name,Medium,Is Public Domain,Primary Image Small\n" +
      "1,European Paintings,Homepage Work,Artist One,1900,Painting,Oil on canvas,True,https://images.metmuseum.org/small/1.jpg\n" +
      "2,European Paintings,Featured Work 2,Artist Two,1901,Painting,Oil on canvas,True,https://images.metmuseum.org/small/2.jpg\n",
    "utf8"
  );

  expect(
    runCatalogImport({
      csvPath,
      databasePath
    }).ok
  ).toBe(true);
  const catalog = createRuntimeCatalog({ databasePath });
  const adminFetch = createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath });

  expect(
    await catalog.createAdminCuratedGroup({
      slug: "featured-landscapes",
      name: "Featured Landscapes"
    })
  ).toMatchObject({
    slug: "featured-landscapes",
    name: "Featured Landscapes"
  });
  expect(await catalog.addAdminGalleryItem(1)).toMatchObject({ objectId: 1 });
  expect(await catalog.addAdminGalleryItem(2, { groupSlug: "featured-landscapes" })).toMatchObject({
    objectId: 2
  });

  window.history.pushState({}, "", "/admin/curated-groups");
  render(<App fetchImpl={adminFetch} />);

  expect(await screen.findByRole("heading", { name: "Curated Groups" })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Feature Featured Landscapes" }));

  await waitFor(() => {
    expect(requests).toContain("PATCH /api/admin/curated-groups/featured-landscapes/feature");
  });

  cleanup();
  window.history.pushState({}, "", "/");
  render(<App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />);

  expect(await screen.findByRole("heading", { name: "Gallery" })).toBeInTheDocument();
  expect(await screen.findByText("Featured Work 2")).toBeInTheDocument();
  expect(screen.queryByText("Homepage Work")).not.toBeInTheDocument();
});

test("group detail route does not render group creation controls", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  window.history.pushState({}, "", "/admin/curated-groups/homepage");

  render(<App fetchImpl={createFetchImpl({ catalogDatabasePath: databasePath })} />);

  expect(await screen.findByRole("heading", { name: "Homepage Gallery" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Group Slug")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Group Name")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create Group" })).not.toBeInTheDocument();
});

test("curated groups route can open a selected group at its slug route", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);
  const adminFetch = createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath });

  window.history.pushState({}, "", "/admin/curated-groups");

  render(<App fetchImpl={adminFetch} />);

  expect(await screen.findByRole("heading", { name: "Curated Groups" })).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "Homepage Gallery" })).toHaveAttribute(
    "href",
    "/admin/curated-groups/homepage"
  );

  fireEvent.click(screen.getByRole("link", { name: "Homepage Gallery" }));

  expect(await screen.findByRole("heading", { name: "Homepage Gallery" })).toBeInTheDocument();
  await waitFor(() => {
    expect(requests).toContain("/api/admin/gallery");
  });
  expect(window.location.pathname).toBe("/admin/curated-groups/homepage");
});

test("admin landing route lets me choose curated groups management", async () => {
  const requests = [];

  window.history.pushState({}, "", "/admin");

  render(<App fetchImpl={createFetchImpl({ requestLog: requests })} />);

  expect(await screen.findByRole("heading", { name: "Admin" })).toBeInTheDocument();
  expect(
    screen.getByRole("link", {
      name: "Curated Groups Manage editorial groups and homepage curation."
    })
  ).toHaveAttribute(
    "href",
    "/admin/curated-groups"
  );
  expect(screen.getByText("Manage editorial groups and homepage curation.")).toBeInTheDocument();
  expect(requests).toEqual(["/api/app-shell"]);
});

test("admin gallery route can add a local object id into the curated gallery list", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const csvPath = path.join(tempDir, "admin-gallery.csv");
  const requests = [];

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

  window.history.pushState({}, "", "/admin/curated-groups/homepage");

  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />
  );

  expect(await screen.findByRole("heading", { name: "Homepage Gallery" })).toBeInTheDocument();
  expect(screen.queryByText("Curated Work 25")).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Object ID"), {
    target: { value: "25" }
  });
  fireEvent.submit(screen.getByRole("button", { name: "Add to Gallery" }).closest("form"));

  expect(await screen.findByText("Curated Work 25")).toBeInTheDocument();
  expect(screen.getByText("1 · 25 · pending")).toBeInTheDocument();
  expect(requests).toContain("POST /api/admin/gallery");
});

test("group detail route can add multiple object ids from a comma-separated list", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const csvPath = path.join(tempDir, "admin-gallery-batch.csv");
  const requests = [];

  writeFileSync(
    csvPath,
    "Object ID,Department,Title,Artist Display Name,Object Date,Object Name,Medium,Is Public Domain\n" +
      Array.from({ length: 27 }, (_, index) => {
        const objectId = index + 1;
        return `${objectId},European Paintings,Curated Work ${objectId},Artist ${objectId},1900,Painting,Oil on canvas,True`;
      }).join("\n") +
      "\n",
    "utf8"
  );

  expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

  window.history.pushState({}, "", "/admin/curated-groups/homepage");

  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />
  );

  expect(await screen.findByRole("heading", { name: "Homepage Gallery" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Object ID"), {
    target: { value: "25, 26,27" }
  });
  fireEvent.submit(screen.getByRole("button", { name: "Add to Gallery" }).closest("form"));

  expect(await screen.findByText("Curated Work 25")).toBeInTheDocument();
  expect(await screen.findByText("Curated Work 26")).toBeInTheDocument();
  expect(await screen.findByText("Curated Work 27")).toBeInTheDocument();
  expect(screen.getByText("1 · 25 · pending")).toBeInTheDocument();
  expect(screen.getByText("2 · 26 · pending")).toBeInTheDocument();
  expect(screen.getByText("3 · 27 · pending")).toBeInTheDocument();
  expect(requests.filter((request) => request === "POST /api/admin/gallery")).toHaveLength(3);
});

test("admin gallery route can remove a curated item and reflow the remaining positions", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);
  await seedAdminGallery(createFetchImpl({ catalogDatabasePath: databasePath }), [4926, 5046]);

  window.history.pushState({}, "", "/admin/curated-groups/homepage");

  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />
  );

  expect(await screen.findByRole("heading", { name: "Homepage Gallery" })).toBeInTheDocument();
  expect(await screen.findByText("Mantel")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove Mantel" }));

  await waitFor(() => {
    expect(screen.queryByText("Mantel")).not.toBeInTheDocument();
  });
  expect(screen.getByText('The "Shipwreck Medal"')).toBeInTheDocument();
  expect(screen.getByText("1 · 5046 · pending")).toBeInTheDocument();
  expect(requests).toContain("DELETE /api/admin/gallery/4926");
});

test("admin gallery route can drag a curated item onto another card and update the displayed order", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);
  await seedAdminGallery(createFetchImpl({ catalogDatabasePath: databasePath }), [4926, 5046]);

  window.history.pushState({}, "", "/admin/curated-groups/homepage");

  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />
  );

  expect(await screen.findByRole("heading", { name: "Homepage Gallery" })).toBeInTheDocument();
  expect(await screen.findByText('The "Shipwreck Medal"')).toBeInTheDocument();
  const cards = screen.getAllByRole("listitem");
  const draggedCard = cards.find((card) => card.textContent.includes('The "Shipwreck Medal"'));
  const targetCard = cards.find((card) => card.textContent.includes("Mantel"));

  fireEvent.dragStart(draggedCard);
  fireEvent.dragOver(targetCard);
  fireEvent.drop(targetCard);

  await waitFor(() => {
    const reorderedCards = screen.getAllByRole("listitem");
    expect(reorderedCards[0]).toHaveTextContent('The "Shipwreck Medal"');
    expect(reorderedCards[1]).toHaveTextContent("Mantel");
  });
  expect(screen.getByText("1 · 5046 · pending")).toBeInTheDocument();
  expect(screen.getByText("2 · 4926 · pending")).toBeInTheDocument();
  expect(requests).toContain("PATCH /api/admin/gallery/reorder");
});

test("admin gallery route shows explicit drag-reorder affordances on curated cards", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);
  await seedAdminGallery(createFetchImpl({ catalogDatabasePath: databasePath }), [4926, 5046]);

  window.history.pushState({}, "", "/admin/curated-groups/homepage");

  render(<App fetchImpl={createFetchImpl({ catalogDatabasePath: databasePath })} />);

  expect(await screen.findByRole("heading", { name: "Homepage Gallery" })).toBeInTheDocument();
  expect(await screen.findByText('The "Shipwreck Medal"')).toBeInTheDocument();
  expect(
    screen.getByText("Drag a card onto another card to reorder the curated gallery.")
  ).toBeInTheDocument();
  expect(screen.getAllByText("Drag to reorder")).toHaveLength(2);
});

test("admin gallery route highlights the current drop target while dragging", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);
  await seedAdminGallery(createFetchImpl({ catalogDatabasePath: databasePath }), [4926, 5046]);
  await seedAdminGallery(createFetchImpl({ catalogDatabasePath: databasePath }), [4926, 5046]);

  window.history.pushState({}, "", "/admin/curated-groups/homepage");

  render(<App fetchImpl={createFetchImpl({ catalogDatabasePath: databasePath })} />);

  expect(await screen.findByRole("heading", { name: "Homepage Gallery" })).toBeInTheDocument();
  expect(await screen.findByText('The "Shipwreck Medal"')).toBeInTheDocument();
  const cards = screen.getAllByRole("listitem");
  const draggedCard = cards.find((card) => card.textContent.includes('The "Shipwreck Medal"'));
  const targetCard = cards.find((card) => card.textContent.includes("Mantel"));

  fireEvent.dragStart(draggedCard);
  fireEvent.dragOver(targetCard);

  expect(targetCard).toHaveTextContent("Drop here");
  expect(targetCard.className).toContain("admin-gallery-drop-target");
});

test("admin gallery route can manually hydrate a curated item and update its card", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];
  const hydrationFetchImpl = async (url) => ({
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      }
    },
    async json() {
      expect(String(url)).toBe(
        "https://collectionapi.metmuseum.org/public/collection/v1/objects/5046"
      );

      return {
        primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
        primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
      };
    }
  });

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);
  await seedAdminGallery(
    createFetchImpl({ catalogDatabasePath: databasePath, hydrationFetchImpl }),
    [4926, 5046]
  );

  window.history.pushState({}, "", "/admin/curated-groups/homepage");

  render(
    <App
      fetchImpl={createFetchImpl({
        requestLog: requests,
        catalogDatabasePath: databasePath,
        hydrationFetchImpl
      })}
    />
  );

  expect(await screen.findByRole("heading", { name: "Homepage Gallery" })).toBeInTheDocument();
  expect(await screen.findByText('The "Shipwreck Medal"')).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: 'Hydrate The "Shipwreck Medal"' }));

  await waitFor(() => {
    expect(screen.getByText("2 · 5046 · hydrated")).toBeInTheDocument();
  });
  expect(screen.getByRole("img", { name: 'The "Shipwreck Medal"' })).toHaveAttribute(
    "src",
    "https://images.metmuseum.org/small/5046.jpg"
  );
  expect(requests).toContain("POST /api/admin/gallery/5046/hydrate");
});

test("homepage uses hydrated curated entries from the admin-managed gallery list", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  const hydrateFetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      }
    },
    async json() {
      return {
        primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
        primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
      };
    }
  });
  const adminFetch = createFetchImpl({
    requestLog: requests,
    catalogDatabasePath: databasePath,
    hydrationFetchImpl: hydrateFetchImpl
  });
  await seedAdminGallery(adminFetch, [4926, 5046]);

  window.history.pushState({}, "", "/admin/curated-groups/homepage");
  render(<App fetchImpl={adminFetch} />);

  expect(await screen.findByRole("heading", { name: "Homepage Gallery" })).toBeInTheDocument();
  expect(await screen.findByText('The "Shipwreck Medal"')).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: 'Hydrate The "Shipwreck Medal"' }));
  await waitFor(() => {
    expect(screen.getByText("2 · 5046 · hydrated")).toBeInTheDocument();
  });

  cleanup();
  window.history.pushState({}, "", "/");

  render(
    <App
      fetchImpl={createFetchImpl({
        requestLog: requests,
        catalogDatabasePath: databasePath,
        hydrationFetchImpl: hydrateFetchImpl
      })}
    />
  );

  expect(await screen.findByRole("heading", { name: "Gallery" })).toBeInTheDocument();
  expect(await screen.findByText('The "Shipwreck Medal"')).toBeInTheDocument();
  expect(screen.getByText('The "Shipwreck Medal"').closest("a")).toHaveAttribute("href", "/works/5046");
  expect(screen.queryByRole("link", { name: "Mantel" })).not.toBeInTheDocument();
});

test("search route keeps its content on the shared shell background", async () => {
  window.history.pushState({}, "", "/search");

  render(<App fetchImpl={fetchImpl} />);

  const heading = await screen.findByRole("heading", { name: "Search" });
  const routeFrame = heading.closest("section");

  expect(routeFrame).not.toBeNull();
  expect(routeFrame).toContainElement(screen.getByLabelText("Query"));
  expect(routeFrame).not.toHaveClass("bg-card");
  expect(routeFrame).not.toHaveClass("border-border");
  expect(screen.getByRole("link", { name: "[search]" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByText("v0.1.0")).toBeInTheDocument();
});

test("current route marks only the active nav link", async () => {
  window.history.pushState({}, "", "/search");

  render(<App fetchImpl={fetchImpl} />);

  const galleryLink = await screen.findByRole("link", { name: "[gallery]" });
  const searchLink = screen.getByRole("link", { name: "[search]" });

  expect(searchLink).toHaveClass("bg-primary/10");
  expect(searchLink).toHaveClass("text-primary");
  expect(galleryLink).toHaveClass("text-muted-foreground");
});

test("homepage renders highlighted Met works from Express as gallery links", async () => {
  const requests = [];
  const metClient = {
    async getGalleryPage() {
      return {
        results: [
          {
            objectId: 436121,
            title: "The Great Wave off Kanagawa",
            artist: "Japanese",
            imageUrl: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"
          },
          {
            objectId: 436524,
            title: "Sunflowers",
            artist: "Vincent van Gogh",
            imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg"
          }
        ]
      };
    }
  };

  render(<App fetchImpl={createFetchImpl({ requestLog: requests, metClient })} />);

  expect(await screen.findByRole("heading", { name: "Gallery" })).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: /The Great Wave off Kanagawa/i })).toHaveAttribute(
    "href",
    "/works/436121"
  );
  expect(screen.getByRole("link", { name: /Sunflowers/i })).toHaveAttribute(
    "href",
    "/works/436524"
  );
  expect(requests).toContain("/api/gallery");
  expect(screen.queryByRole("button", { name: "Shuffle" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Load More" })).not.toBeInTheDocument();
});

test("homepage shows catalog readiness messaging through the default Express app path", async () => {
  const requests = [];

  render(<App fetchImpl={createFetchImpl({ requestLog: requests })} />);

  expect(await screen.findByRole("heading", { name: "Gallery" })).toBeInTheDocument();
  expect(await screen.findByText("Catalog is not initialized.")).toBeInTheDocument();
  expect(requests).toContain("/api/gallery");
});

test("search route renders results from a configured SQLite catalog path through the default Express app path", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  window.history.pushState({}, "", "/search?q=shipwreck");

  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />
  );

  expect(await screen.findByRole("heading", { name: "Search" })).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: 'The "Shipwreck Medal"' })).toHaveAttribute(
    "href",
    "/works/5046"
  );
  expect(screen.getByText("Salathiel Ellis · 1845–57 · The American Wing")).toBeInTheDocument();
  expect(requests).toContain("/api/search/departments");
  expect(requests).toContain("/api/search?q=shipwreck");
});

test("search route supports multi-token SQLite FTS queries through the default Express app path", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  window.history.pushState({}, "", "/search?q=medal%20shipwreck");

  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />
  );

  expect(await screen.findByRole("heading", { name: "Search" })).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: 'The "Shipwreck Medal"' })).toHaveAttribute(
    "href",
    "/works/5046"
  );
  expect(screen.getByText("Salathiel Ellis · 1845–57 · The American Wing")).toBeInTheDocument();
  expect(requests).toContain("/api/search?q=medal+shipwreck");
});

test("search route applies the department filter on top of SQLite FTS results through the default Express app path", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  window.history.pushState({}, "", "/search?q=medal&departmentId=1");

  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />
  );

  expect(await screen.findByRole("heading", { name: "Search" })).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: 'The "Shipwreck Medal"' })).toHaveAttribute(
    "href",
    "/works/5046"
  );
  expect(screen.getByLabelText("Department")).toHaveValue("1");
  expect(screen.getByText("Salathiel Ellis · 1845–57 · The American Wing")).toBeInTheDocument();
  expect(requests).toContain("/api/search/departments");
  expect(requests).toContain("/api/search?q=medal&departmentId=1");
});

test("search route supports quoted phrase SQLite FTS queries through the default Express app path", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  window.history.pushState({}, "", "/search?q=%22shipwreck%20medal%22");

  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />
  );

  expect(await screen.findByRole("heading", { name: "Search" })).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: 'The "Shipwreck Medal"' })).toHaveAttribute(
    "href",
    "/works/5046"
  );
  expect(screen.getByDisplayValue('"shipwreck medal"')).toBeInTheDocument();
  expect(requests).toContain("/api/search?q=%22shipwreck+medal%22");
});

test("search route keeps quoted phrase SQLite FTS queries empty when the phrase does not exist", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  window.history.pushState({}, "", "/search?q=%22medal%20mantel%22");

  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />
  );

  expect(await screen.findByRole("heading", { name: "Search" })).toBeInTheDocument();
  expect(screen.getByDisplayValue('"medal mantel"')).toBeInTheDocument();
  await waitFor(() => {
    expect(requests).toContain("/api/search?q=%22medal+mantel%22");
  });
  expect(screen.queryByRole("link", { name: 'The "Shipwreck Medal"' })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Mantel" })).not.toBeInTheDocument();
  expect(screen.queryByText("Salathiel Ellis · 1845–57 · The American Wing")).not.toBeInTheDocument();
});

test("work route renders details from a configured SQLite catalog path through the default Express app path", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  window.history.pushState({}, "", "/works/5046");

  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />
  );

  expect(await screen.findByRole("heading", { name: 'The "Shipwreck Medal"' })).toBeInTheDocument();
  expect(screen.getByText("Salathiel Ellis")).toBeInTheDocument();
  expect(screen.getByText("1845–57")).toBeInTheDocument();
  expect(screen.getByText("Medal - Bronze")).toBeInTheDocument();
  expect(screen.getByText("Image unavailable through the Met API.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View on the Met" })).toHaveAttribute(
    "href",
    "http://www.metmuseum.org/art/collection/search/5046"
  );
  expect(requests).toContain("/api/works/5046");
});

test("homepage shows the empty gallery state from a configured SQLite catalog path when no curated images exist", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />
  );

  expect(await screen.findByRole("heading", { name: "Gallery" })).toBeInTheDocument();
  expect(await screen.findByText("Gallery coming soon")).toBeInTheDocument();
  expect(screen.getByText("Curated groups have not been configured yet.")).toBeInTheDocument();
  expect(screen.queryByText("Catalog is not initialized.")).not.toBeInTheDocument();
  expect(requests).toContain("/api/gallery");
});

test("homepage uses persisted Met image URLs for SQLite gallery cards", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const csvPath = path.join(tempDir, "with-images.csv");
  const databasePath = path.join(tempDir, "catalog.sqlite");

  writeFileSync(
    csvPath,
    "Object ID,Department,Title,Artist Display Name,Object Date,Object Name,Medium,Is Public Domain,Primary Image Small,Primary Image\n" +
      "1,European Paintings,Image Work,Artist One,1900,Painting,Oil on canvas,True,https://images.metmuseum.org/CRDImages/test/web-large/1.jpg,https://images.metmuseum.org/CRDImages/test/original/1.jpg\n",
    "utf8"
  );

  expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);
  await seedAdminGallery(createFetchImpl({ catalogDatabasePath: databasePath }), [1]);

  render(<App fetchImpl={createFetchImpl({ catalogDatabasePath: databasePath })} />);

  expect(await screen.findByRole("img", { name: "Image Work" })).toHaveAttribute(
    "src",
    "https://images.metmuseum.org/CRDImages/test/web-large/1.jpg"
  );
});

test("homepage renders gallery cards as themed surfaces while preserving links and copy", async () => {
  const metClient = {
    async getGalleryPage() {
      return {
        results: [
          {
            objectId: 436524,
            title: "Sunflowers",
            artist: "Vincent van Gogh",
            imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg"
          }
        ]
      };
    }
  };

  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const cardLink = await screen.findByRole("link", { name: /Sunflowers/i });
  const card = cardLink.closest("li");
  const title = screen.getByText("Sunflowers");
  const meta = screen.getByText("Vincent van Gogh");

  expect(card).not.toBeNull();
  expect(card).toHaveClass("bg-card");
  expect(card).toHaveClass("border-border");
  expect(cardLink).toHaveAttribute("href", "/works/436524");
  expect(title).toHaveClass("text-foreground");
  expect(meta).toHaveClass("text-muted-foreground");
});

test("homepage renders the gallery list as a grid while preserving multiple cards", async () => {
  const metClient = {
    async getGalleryPage() {
      return {
        results: [
          {
            objectId: 436121,
            title: "The Great Wave off Kanagawa",
            artist: "Japanese",
            imageUrl: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"
          },
          {
            objectId: 436524,
            title: "Sunflowers",
            artist: "Vincent van Gogh",
            imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg"
          }
        ]
      };
    }
  };

  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const firstLink = await screen.findByRole("link", { name: /The Great Wave off Kanagawa/i });
  const secondLink = screen.getByRole("link", { name: /Sunflowers/i });
  const grid = firstLink.closest("ul");

  expect(grid).not.toBeNull();
  expect(grid).toHaveClass("grid");
  expect(grid).toHaveClass("gap-4");
  expect(grid).toHaveClass("p-0");
  expect(grid).toHaveClass("list-none");
  expect(firstLink).toHaveAttribute("href", "/works/436121");
  expect(secondLink).toHaveAttribute("href", "/works/436524");
});

test("homepage preserves gallery image and placeholder treatment inside themed media frames", async () => {
  const metClient = {
    async getGalleryPage() {
      return {
        results: [
          {
            objectId: 436121,
            title: "The Great Wave off Kanagawa",
            artist: "Japanese",
            imageUrl: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"
          },
          {
            objectId: 486055,
            title: "Galisteo Creek",
            artist: "Susan Rothenberg",
            imageUrl: ""
          }
        ]
      };
    }
  };

  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const image = await screen.findByRole("img", { name: "The Great Wave off Kanagawa" });
  const imageFrame = image.closest("figure");
  const placeholder = screen.getByText((_, element) =>
    Boolean(element?.classList.contains("gallery-card-image-placeholder"))
  );

  expect(imageFrame).not.toBeNull();
  expect(imageFrame).toHaveClass("bg-secondary");
  expect(image).toHaveAttribute(
    "src",
    "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"
  );
  expect(image).toHaveClass("block");
  expect(image).toHaveClass("w-full");
  expect(placeholder).toHaveClass("bg-muted");
});

test("homepage falls back to a placeholder when an artist card image fails to load", async () => {
  const metClient = {
    async getGalleryPage() {
      return {
        results: [
          {
            artist: "Vincent van Gogh",
            artistSlug: "vincent-van-gogh",
            imageUrl: "https://images.metmuseum.org/CRDImages/broken/web-large/van-gogh.jpg",
            workCount: 50
          }
        ]
      };
    }
  };

  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const image = await screen.findByRole("img", { name: "Vincent van Gogh" });
  fireEvent.error(image);

  expect(screen.getByRole("link", { name: /Vincent van Gogh 50 works/i })).toHaveAttribute(
    "href",
    "/artists/vincent-van-gogh"
  );
  expect(screen.getByText("Vincent van Gogh")).toBeInTheDocument();
  expect(screen.getByText("50 works")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Vincent van Gogh" })).not.toBeInTheDocument();
  expect(
    screen.getByText((_, element) =>
      Boolean(element?.classList.contains("gallery-card-image-placeholder"))
    )
  ).toHaveClass("bg-muted");
});

test("homepage shows a friendly message when Express cannot load the Met gallery", async () => {
  const metClient = {
    async getGalleryPage() {
      throw new Error("Met API returned a non-JSON gallery response.");
    }
  };

  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(
    await screen.findByText("The Met gallery is temporarily unavailable. Please try again.")
  ).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Sunflowers/i })).not.toBeInTheDocument();
});

test("homepage renders an explicit gallery empty state from Express", async () => {
  const metClient = {
    async getGalleryPage() {
      return {
        results: [],
        emptyState: {
          title: "Gallery coming soon",
          message: "Curated groups have not been configured yet."
        }
      };
    }
  };

  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(await screen.findByText("Gallery coming soon")).toBeInTheDocument();
  expect(screen.getByText("Curated groups have not been configured yet.")).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

test("search route shows an empty state before any query is submitted", async () => {
  const requests = [];
  window.history.pushState({}, "", "/search");

  render(<App fetchImpl={createFetchImpl({ requestLog: requests })} />);

  expect(await screen.findByRole("heading", { name: "Search" })).toBeInTheDocument();
  expect(screen.getByText("Enter a search to find works.")).toBeInTheDocument();
  await waitFor(() => {
    expect(requests).toEqual(["/api/app-shell", "/api/search/departments"]);
  });
});

test("search route loads Department filter options from Express", async () => {
  const metClient = {
    async getDepartments() {
      return {
        departments: [
          { departmentId: 11, displayName: "European Paintings" },
          { departmentId: 6, displayName: "Arms and Armor" }
        ]
      };
    },

    async searchCollection(searchState) {
      return { query: searchState.query, results: [] };
    }
  };

  window.history.pushState({}, "", "/search");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(await screen.findByLabelText("Department")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "All departments" })).toBeInTheDocument();
  expect(await screen.findByRole("option", { name: "European Paintings" })).toHaveValue("11");
  expect(await screen.findByRole("option", { name: "Arms and Armor" })).toHaveValue("6");
});

test("search route renders themed controls while preserving current submission behavior", async () => {
  const metClient = {
    async getDepartments() {
      return {
        departments: [{ departmentId: 11, displayName: "European Paintings" }]
      };
    },

    async searchCollection(searchState) {
      return {
        query: searchState.query,
        results: [
          {
            objectId: 436121,
            title: "Landscape Study",
            artist: "Artist",
            date: "1900"
          }
        ]
      };
    }
  };

  window.history.pushState({}, "", "/search");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const queryInput = await screen.findByLabelText("Query");
  const departmentSelect = await screen.findByLabelText("Department");
  const mediumSelect = screen.getByLabelText("Medium");
  const searchButton = screen.getByRole("button", { name: "[search]" });

  expect(queryInput).toHaveClass("bg-secondary");
  expect(queryInput).toHaveClass("border-input");
  expect(queryInput).toHaveClass("text-foreground");
  expect(departmentSelect).toHaveClass("bg-secondary");
  expect(departmentSelect).toHaveClass("border-input");
  expect(mediumSelect).toHaveClass("bg-secondary");
  expect(mediumSelect).toHaveClass("border-input");
  expect(searchButton).toHaveClass("bg-secondary");
  expect(searchButton).toHaveClass("border-input");
  expect(searchButton).toHaveClass("text-foreground");

  fireEvent.change(queryInput, {
    target: { value: "landscape" }
  });
  fireEvent.change(departmentSelect, {
    target: { value: "11" }
  });
  fireEvent.change(mediumSelect, {
    target: { value: "wood" }
  });
  fireEvent.click(searchButton);

  expect(await screen.findByRole("link", { name: "Landscape Study" })).toHaveAttribute(
    "href",
    "/works/436121"
  );
  expect(window.location.search).toBe("?q=landscape&departmentId=11&medium=wood");
});

test("submitting search with Department and Medium filters preserves the search state", async () => {
  let receivedSearchState = null;
  const metClient = {
    async getDepartments() {
      return {
        departments: [{ departmentId: 11, displayName: "European Paintings" }]
      };
    },

    async searchCollection(searchState) {
      receivedSearchState = searchState;

      return {
        query: searchState.query,
        results: [
          {
            objectId: 436121,
            title: "Landscape Study",
            artist: "Artist",
            date: "1900"
          }
        ]
      };
    }
  };

  window.history.pushState({}, "", "/search");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const queryInput = await screen.findByLabelText("Query");
  fireEvent.change(queryInput, {
    target: { value: "landscape" }
  });
  await waitFor(() => {
    expect(queryInput).toHaveValue("landscape");
  });
  const departmentInput = await screen.findByLabelText("Department");
  fireEvent.change(departmentInput, {
    target: { value: "11" }
  });
  await waitFor(() => {
    expect(departmentInput).toHaveValue("11");
  });
  const mediumInput = screen.getByLabelText("Medium");
  fireEvent.change(mediumInput, {
    target: { value: "wood" }
  });
  await waitFor(() => {
    expect(mediumInput).toHaveValue("wood");
  });
  fireEvent.click(screen.getByRole("button", { name: "[search]" }));

  expect(await screen.findByRole("link", { name: "Landscape Study" })).toHaveAttribute(
    "href",
    "/works/436121"
  );
  expect(window.location.search).toBe("?q=landscape&departmentId=11&medium=wood");
  expect(receivedSearchState).toEqual({
    query: "landscape",
    departmentId: 11,
    medium: "wood",
    page: 1
  });
});

test("search results support explicit next-page navigation", async () => {
  const metClient = {
    async getDepartments() {
      return { departments: [] };
    },

    async searchCollection(searchState) {
      if (searchState.page === 2) {
        return {
          query: searchState.query,
          results: [
            {
              objectId: 13,
              title: "Work 13",
              artist: "Artist 13",
              date: "1900"
            }
          ]
        };
      }

      return {
        query: searchState.query,
        results: Array.from({ length: 12 }, (_, index) => ({
          objectId: index + 1,
          title: `Work ${index + 1}`,
          artist: `Artist ${index + 1}`,
          date: "1900"
        }))
      };
    }
  };

  window.history.pushState({}, "", "/search?q=landscape");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(await screen.findByRole("link", { name: "Work 1" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));

  expect(await screen.findByRole("link", { name: "Work 13" })).toHaveAttribute(
    "href",
    "/works/13"
  );
  expect(window.location.search).toBe("?q=landscape&page=2");
});

test("search pagination renders as a themed control surface while preserving page navigation", async () => {
  const metClient = {
    async getDepartments() {
      return { departments: [] };
    },

    async searchCollection(searchState) {
      if (searchState.page === 2) {
        return {
          query: searchState.query,
          results: [
            {
              objectId: 13,
              title: "Work 13",
              artist: "Artist 13",
              date: "1900"
            }
          ]
        };
      }

      return {
        query: searchState.query,
        results: Array.from({ length: 12 }, (_, index) => ({
          objectId: index + 1,
          title: `Work ${index + 1}`,
          artist: `Artist ${index + 1}`,
          date: "1900"
        }))
      };
    }
  };

  window.history.pushState({}, "", "/search?q=landscape");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const nextButton = await screen.findByRole("button", { name: "Next page" });
  const pageLabel = screen.getByText("Page 1");

  expect(nextButton).toHaveClass("bg-secondary");
  expect(nextButton).toHaveClass("border-input");
  expect(nextButton).toHaveClass("text-foreground");
  expect(pageLabel).toHaveClass("text-muted-foreground");

  fireEvent.click(nextButton);

  expect(await screen.findByRole("link", { name: "Work 13" })).toHaveAttribute("href", "/works/13");
  expect(window.location.search).toBe("?q=landscape&page=2");
});

test("submitting a valid query fetches search results through Express and renders work links", async () => {
  const requests = [];
  const metClient = {
    async searchCollection(query) {
      return {
        query,
        results: [
          {
            objectId: 436524,
            title: "Sunflowers",
            artist: "Vincent van Gogh",
            date: "1887"
          }
        ]
      };
    }
  };

  window.history.pushState({}, "", "/search");
  render(<App fetchImpl={createFetchImpl({ requestLog: requests, metClient })} />);

  const searchInput = await screen.findByLabelText("Query");
  fireEvent.change(searchInput, {
    target: { value: "sunflowers" }
  });
  await waitFor(() => {
    expect(searchInput).toHaveValue("sunflowers");
  });
  fireEvent.click(screen.getByRole("button", { name: "[search]" }));

  expect(await screen.findByRole("link", { name: "Sunflowers" })).toHaveAttribute(
    "href",
    "/works/436524"
  );
  expect(window.location.search).toBe("?q=sunflowers");
  expect(requests).toContain("/api/search?q=sunflowers");
});

test("submitting a whitespace-only query keeps the search route in its empty state", async () => {
  const requests = [];

  window.history.pushState({}, "", "/search");
  render(<App fetchImpl={createFetchImpl({ requestLog: requests })} />);

  fireEvent.change(await screen.findByLabelText("Query"), {
    target: { value: "   " }
  });
  fireEvent.click(screen.getByRole("button", { name: "[search]" }));

  expect(screen.getByText("Enter a search to find works.")).toBeInTheDocument();
  expect(window.location.search).toBe("");
  expect(requests).toEqual(["/api/app-shell", "/api/search/departments"]);
});

test("loading a populated search URL restores the same search state end to end", async () => {
  const requests = [];
  let receivedSearchState = null;
  const metClient = {
    async searchCollection(searchState) {
      receivedSearchState = searchState;

      return {
        query: searchState.query,
        results: [
          {
            objectId: 437329,
            title: "The Harvesters",
            artist: "Pieter Bruegel the Elder",
            date: "1565"
          }
        ]
      };
    }
  };

  window.history.pushState(
    {},
    "",
    "/search?q=harvesters&departmentId=11&medium=paintings&page=2"
  );
  render(<App fetchImpl={createFetchImpl({ requestLog: requests, metClient })} />);

  expect(await screen.findByDisplayValue("harvesters")).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "The Harvesters" })).toHaveAttribute(
    "href",
    "/works/437329"
  );
  expect(requests).toContain("/api/search?q=harvesters&departmentId=11&medium=paintings&page=2");
  expect(receivedSearchState).toEqual({
    query: "harvesters",
    departmentId: 11,
    medium: "paintings",
    page: 2
  });
});

test("search results show inline availability markers for rights and image status", async () => {
  const metClient = {
    async searchCollection(query) {
      return {
        query,
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
          },
          {
            objectId: 486055,
            title: "Galisteo Creek",
            artist: "Susan Rothenberg",
            date: "1992",
            department: "Modern and Contemporary Art",
            imageUrl: "",
            isPublicDomain: false,
            hasImage: false
          }
        ]
      };
    }
  };

  window.history.pushState({}, "", "/search?q=van%20gogh");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(await screen.findByRole("link", { name: "Sunflowers" })).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "Galisteo Creek" })).toBeInTheDocument();
  expect(screen.getByText(/Vincent van Gogh .* European Paintings/i)).toBeInTheDocument();
  expect(screen.getByText(/Susan Rothenberg .* Modern and Contemporary Art/i)).toBeInTheDocument();
  expect(screen.getByText("Rights Restricted")).toBeInTheDocument();
  expect(screen.getByText("No Image Available")).toBeInTheDocument();
});

test("search results render as a themed list while preserving result-link behavior", async () => {
  const metClient = {
    async searchCollection(query) {
      return {
        query,
        results: [
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
      };
    }
  };

  window.history.pushState({}, "", "/search?q=rothenberg");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const resultLink = await screen.findByRole("link", { name: "Galisteo Creek" });
  const resultsList = resultLink.closest("ul");
  const resultRow = resultLink.closest("li");
  const restrictedFlag = screen.getByText("Rights Restricted");
  const noImageFlag = screen.getByText("No Image Available");

  expect(resultsList).not.toBeNull();
  expect(resultRow).not.toBeNull();
  expect(resultsList).toHaveClass("border-t");
  expect(resultsList).toHaveClass("border-border");
  expect(resultRow).toHaveClass("border-b");
  expect(resultRow).toHaveClass("border-border");
  expect(resultLink).toHaveAttribute("href", "/works/486055");
  expect(resultLink).toHaveClass("text-primary");
  expect(restrictedFlag).toHaveClass("text-muted-foreground");
  expect(noImageFlag).toHaveClass("text-muted-foreground");
});

test("search route shows an error message when Express cannot load Met results", async () => {
  const metClient = {
    async searchCollection() {
      throw new Error("Met API returned a non-JSON search response.");
    }
  };

  window.history.pushState({}, "", "/search?q=sunflowers");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(await screen.findByDisplayValue("sunflowers")).toBeInTheDocument();
  expect(
    await screen.findByText("Met API returned a non-JSON search response.")
  ).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Sunflowers" })).not.toBeInTheDocument();
});

test("direct entry to a work route loads detail through Express and renders the work title", async () => {
  const requests = [];
  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "The Great Wave off Kanagawa",
        artist: "Japanese",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434"
      };
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(<App fetchImpl={createFetchImpl({ requestLog: requests, metClient })} />);

  expect(
    await screen.findByRole("heading", { name: "The Great Wave off Kanagawa" })
  ).toBeInTheDocument();
  expect(requests).toContain("/api/works/436121");
});

test("work viewer renders the preferred image and compact metadata with a Met link", async () => {
  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "The Great Wave off Kanagawa",
        artist: "Japanese",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434"
      };
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(
    await screen.findByRole("img", { name: "The Great Wave off Kanagawa" })
  ).toHaveAttribute("src", "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg");
  expect(screen.getByText("Japanese")).toBeInTheDocument();
  expect(screen.getByText("ca. 1830-32")).toBeInTheDocument();
  expect(
    screen.getByText("Print - Polychrome woodblock print; ink and color on paper")
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View on the Met" })).toHaveAttribute(
    "href",
    "https://www.metmuseum.org/art/collection/search/45434"
  );
});

test("work viewer renders a themed layout and metadata panel while preserving work details", async () => {
  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "The Great Wave off Kanagawa",
        artist: "Japanese",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434"
      };
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const image = await screen.findByRole("img", { name: "The Great Wave off Kanagawa" });
  const viewer = image.closest("div");
  const metadata = screen.getByLabelText("Work metadata");

  expect(viewer).not.toBeNull();
  expect(viewer).toHaveClass("grid");
  expect(viewer).toHaveClass("gap-4");
  expect(metadata).toHaveClass("border-t");
  expect(metadata).toHaveClass("border-border");
  expect(screen.getByText("Artist")).toHaveClass("text-muted-foreground");
  expect(screen.getByRole("link", { name: "View on the Met" })).toHaveClass("text-primary");
  expect(screen.getByText("Japanese")).toBeInTheDocument();
  expect(screen.getByText("ca. 1830-32")).toBeInTheDocument();
});

test("work viewer preserves image framing inside a themed media surface", async () => {
  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "The Great Wave off Kanagawa",
        artist: "Japanese",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434"
      };
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const image = await screen.findByRole("img", { name: "The Great Wave off Kanagawa" });
  const frame = image.closest("figure");

  expect(frame).not.toBeNull();
  expect(frame).toHaveClass("border-border");
  expect(frame).toHaveClass("bg-secondary");
  expect(image).toHaveClass("block");
  expect(image).toHaveClass("w-full");
});

test("work viewer shows a themed unavailable-image state while preserving metadata", async () => {
  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "Galisteo Creek",
        artist: "Gustave Baumann",
        date: "1920",
        context: "Color woodcut - Ink and color on paper",
        imageUrl: "",
        metUrl: "https://www.metmuseum.org/art/collection/search/486055"
      };
    }
  };

  window.history.pushState({}, "", "/works/486055");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const unavailable = await screen.findByText("Image unavailable through the Met API.");

  expect(unavailable).toHaveClass("text-muted-foreground");
  expect(unavailable).toHaveClass("text-center");
  expect(screen.queryByRole("img", { name: "Galisteo Creek" })).not.toBeInTheDocument();
  expect(screen.getByText("Gustave Baumann")).toBeInTheDocument();
});

test("work viewer shows metadata when the Met API has no image for the object", async () => {
  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "Galisteo Creek",
        artist: "Gustave Baumann",
        date: "1920",
        context: "Color woodcut - Ink and color on paper",
        imageUrl: "",
        metUrl: "https://www.metmuseum.org/art/collection/search/486055"
      };
    }
  };

  window.history.pushState({}, "", "/works/486055");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(await screen.findByRole("heading", { name: "Galisteo Creek" })).toBeInTheDocument();
  expect(screen.getByText("Image unavailable through the Met API.")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Galisteo Creek" })).not.toBeInTheDocument();
  expect(screen.getByText("Gustave Baumann")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View on the Met" })).toHaveAttribute(
    "href",
    "https://www.metmuseum.org/art/collection/search/486055"
  );
});

test("work viewer renders an empty state when Express cannot load the object", async () => {
  const metClient = {
    async getWork() {
      return null;
    }
  };
  window.history.pushState({}, "", "/works/999999");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);
  expect(await screen.findByRole("heading", { name: "Work 999999" })).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

test("help route presents the current ARTCTL product copy", async () => {
  window.history.pushState({}, "", "/help");

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("heading", { name: "Help" })).toBeInTheDocument();
  expect(screen.getByText("ARTCTL", { selector: ".help-page-manual" })).toBeInTheDocument();
  expect(screen.getByText("Public-domain artwork explorer")).toBeInTheDocument();
  expect(screen.getByText("── Gallery ──")).toBeInTheDocument();
  expect(
    screen.getByText(/browse highlighted public-domain artworks in a quiet, minimal interface/i)
  ).toBeInTheDocument();
  expect(screen.getByText(/sunflowers · armor · monet · ukiyo-e · cats/i)).toBeInTheDocument();
  expect(screen.getByText("── Search ──")).toBeInTheDocument();
  expect(
    screen.getByText(/search across artists, titles, cultures, materials, periods/i)
  ).toBeInTheDocument();
  expect(screen.getByText("── Help ──")).toBeInTheDocument();
  expect(
    screen.getByText(/artctl is designed as a lightweight artwork browser inspired by terminal systems/i)
  ).toBeInTheDocument();
  expect(screen.getByText("── Themes ──")).toBeInTheDocument();
  expect(
    screen.getByText(/your selected theme persists across gallery, search, help, and artwork views/i)
  ).toBeInTheDocument();
  expect(screen.getByText("── Collection Source ──")).toBeInTheDocument();
  expect(
    screen.getByText(/the current collection source is the metropolitan museum open access api/i)
  ).toBeInTheDocument();
});

test("help route renders the manual copy on the shared background", async () => {
  window.history.pushState({}, "", "/help");

  render(<App fetchImpl={fetchImpl} />);

  await screen.findByRole("heading", { name: "Help" });
  const manual = screen.getByText("ARTCTL", { selector: ".help-page-manual" });
  const helpPage = manual.closest("article");
  const galleryTitle = screen.getByText("── Gallery ──");

  expect(helpPage).not.toHaveClass("bg-card");
  expect(helpPage).not.toHaveClass("border-border");
  expect(galleryTitle).toHaveClass("text-primary");
  expect(
    screen.getByText(/your selected theme persists across gallery, search, help, and artwork views/i)
  ).toBeInTheDocument();
});

test("themes route matches the Cortex-style theme picker structure and active state", async () => {
  window.history.pushState({}, "", "/themes");

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("heading", { name: "Themes" })).toBeInTheDocument();
  expect(screen.getByText("── theme ──")).toBeInTheDocument();
  expect(screen.getByText("Choose a color theme. Your selection is saved locally.")).toBeInTheDocument();
  expect(screen.getByText("theme is stored in browser localStorage")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Green" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Light" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Blue" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Purple" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Red" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Orange" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Cyan" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Pink" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Windows 95" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Windows XP" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "CRT Amber" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Solarized" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sepia" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Green" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getAllByText("✓")).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "Solarized" }));

  expect(window.localStorage.getItem("artctl-theme")).toBe("solarized");
  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("68 100% 30%");
  expect(screen.getByRole("button", { name: "Solarized" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getAllByText("✓")).toHaveLength(1);
});

test("themes route renders a themed picker surface while preserving theme selection behavior", async () => {
  window.history.pushState({}, "", "/themes");

  render(<App fetchImpl={fetchImpl} />);

  const darkGreen = await screen.findByRole("button", { name: "Dark Green" });
  const solarized = screen.getByRole("button", { name: "Solarized" });

  expect(darkGreen).toHaveClass("bg-primary/10");
  expect(darkGreen).toHaveClass("border-primary");
  expect(darkGreen).toHaveClass("text-primary");
  expect(solarized).toHaveClass("bg-card");
  expect(solarized).toHaveClass("border-border");
  expect(solarized).toHaveClass("text-foreground");

  fireEvent.click(solarized);

  expect(window.localStorage.getItem("artctl-theme")).toBe("solarized");
  expect(screen.getByRole("button", { name: "Solarized" })).toHaveAttribute("aria-pressed", "true");
});

test("selecting a theme updates the picker and shared panel styles to that same theme", async () => {
  window.history.pushState({}, "", "/themes");

  render(<App fetchImpl={fetchImpl} />);

  const solarized = THEMES.find((theme) => theme.id === "solarized");
  const footer = await screen.findByText("v0.1.0");

  fireEvent.click(screen.getByRole("button", { name: "Solarized" }));

  expect(window.localStorage.getItem("artctl-theme")).toBe("solarized");
  expect(screen.getByRole("button", { name: "Solarized" })).toHaveAttribute("aria-pressed", "true");
  expect(footer).toHaveClass("bg-card");
  expect(footer).toHaveClass("border-border");
  expect(footer).toHaveClass("text-muted-foreground");
});

test("activating a Cortex theme applies the original Cortex token values", async () => {
  window.history.pushState({}, "", "/themes");

  render(<App fetchImpl={fetchImpl} />);

  fireEvent.click(await screen.findByRole("button", { name: "Solarized" }));

  expect(document.documentElement.style.getPropertyValue("--background")).toBe("192 81% 9%");
  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("68 100% 30%");
  expect(document.documentElement.style.getPropertyValue("--border")).toBe("192 50% 22%");
});

test("choosing a theme stores the preference locally in the browser", async () => {
  window.history.pushState({}, "", "/themes");

  render(<App fetchImpl={fetchImpl} />);

  fireEvent.click(await screen.findByRole("button", { name: "Dark Cyan" }));

  expect(window.localStorage.getItem("artctl-theme")).toBe("dark-cyan");
});

test("app startup restores the previously chosen theme from browser storage", async () => {
  window.localStorage.setItem("artctl-theme", "crt-amber");
  window.history.pushState({}, "", "/help");

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("heading", { name: "Help" })).toBeInTheDocument();
  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("40 100% 50%");
  expect(window.localStorage.getItem("artctl-theme")).toBe("crt-amber");
});

test("the active theme remains applied when navigating to another route", async () => {
  window.history.pushState({}, "", "/themes");

  render(<App fetchImpl={fetchImpl} />);

  fireEvent.click(await screen.findByRole("button", { name: "Windows XP" }));
  fireEvent.click(screen.getByRole("link", { name: "[help]" }));

  expect(await screen.findByRole("heading", { name: "Help" })).toBeInTheDocument();
  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("217 100% 45%");
  expect(window.localStorage.getItem("artctl-theme")).toBe("windows-xp");
});
