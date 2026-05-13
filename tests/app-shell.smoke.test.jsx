import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  hydrationFetchImpl,
  adminAuth = undefined,
  workInfoGenerator = null,
  autoAuthenticateAdmin = false
} = {}) {
  const apiOptions = {
    ...(metClient
      ? { metClient, allowLegacyMetRuntime: true }
      : { catalogDatabasePath, hydrationFetchImpl }),
    ...(adminAuth !== undefined ? { adminAuth } : {}),
    workInfoGenerator
  };
  const apiApp = createArtctlApp(apiOptions);
  const cookieJar = new Map();

  function getCookieHeader() {
    if (cookieJar.size === 0) {
      return "";
    }

    return Array.from(cookieJar.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  function applySetCookieHeader(setCookieHeader) {
    for (const cookieHeader of []
      .concat(setCookieHeader ?? [])
      .filter(Boolean)) {
      const cookieAssignment = String(cookieHeader).split(";", 1)[0];
      const separatorIndex = cookieAssignment.indexOf("=");

      if (separatorIndex < 1) {
        continue;
      }

      const name = cookieAssignment.slice(0, separatorIndex).trim();
      const value = cookieAssignment.slice(separatorIndex + 1).trim();

      if (!value) {
        cookieJar.delete(name);
        continue;
      }

      cookieJar.set(name, value);
    }
  }

  async function dispatchRequest(url, init = {}) {
    const request = httpMocks.createRequest({
      method: init.method ?? "GET",
      url: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body: init.body ? JSON.parse(init.body) : undefined,
      headers: {
        ...(init.headers ?? {}),
        ...(getCookieHeader() ? { cookie: getCookieHeader() } : {})
      }
    });
    const response = httpMocks.createResponse({ eventEmitter: EventEmitter });

    await new Promise((resolve, reject) => {
      response.on("end", resolve);
      response.on("error", reject);
      apiApp.handle(request, response, reject);
    });

    applySetCookieHeader(response.getHeader("Set-Cookie"));
    return response;
  }

  async function ensureAdminSession() {
    if (!apiApp.get("artctlTestDefaultAdminAuth") || cookieJar.has("artctl_admin_session")) {
      return;
    }

    const loginResponse = await dispatchRequest(new URL("http://artctl.test/api/admin/login"), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ username: "admin", password: "secret" })
    });

    if (loginResponse.statusCode !== 200) {
      throw new Error("Unable to create test admin session.");
    }
  }

  return async function fetchImpl(resource, init = {}) {
    const url = new URL(resource, "http://artctl.test");
    const method = init.method ?? "GET";
    requestLog.push(
      method === "GET" ? `${url.pathname}${url.search}` : `${method} ${url.pathname}${url.search}`
    );

    const shouldAutoAuthenticateAdmin =
      url.pathname.startsWith("/api/admin") &&
      url.pathname !== "/api/admin/login" &&
      (url.pathname !== "/api/admin/session" || window.location.pathname.startsWith("/admin") || autoAuthenticateAdmin);

    if (shouldAutoAuthenticateAdmin) {
      await ensureAdminSession();
    }

    const response = await dispatchRequest(url, init);

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

function expectAdminGalleryCardOrder(card, order) {
  const orderBadge = within(card).getByText(String(order));

  expect(orderBadge).toHaveClass("absolute");
  expect(orderBadge).toHaveClass("bottom-3");
  expect(orderBadge).toHaveClass("right-3");
  expect(orderBadge).toHaveClass("text-xs");
  expect(orderBadge).toHaveClass("text-muted-foreground");
}

function setViewportWidth(width) {
  window.innerWidth = width;
  window.matchMedia = (query) => {
    const minWidthMatch = /min-width:\s*(\d+)px/.exec(query);
    const maxWidthMatch = /max-width:\s*(\d+)px/.exec(query);
    const minWidth = minWidthMatch ? Number(minWidthMatch[1]) : null;
    const maxWidth = maxWidthMatch ? Number(maxWidthMatch[1]) : null;
    const matches =
      (minWidth === null || width >= minWidth) &&
      (maxWidth === null || width <= maxWidth);

    return {
      matches,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      }
    };
  };
}

function dispatchTouchEvent(target, type, touches, changedTouches = touches) {
  const normalizedTouches = touches.map((touch, index) => ({
    identifier: touch.identifier ?? index,
    clientX: touch.clientX,
    clientY: touch.clientY
  }));
  const normalizedChangedTouches = changedTouches.map((touch, index) => ({
    identifier: touch.identifier ?? index,
    clientX: touch.clientX,
    clientY: touch.clientY
  }));
  const eventData = {
    touches: normalizedTouches,
    changedTouches: normalizedChangedTouches,
    targetTouches: normalizedTouches
  };

  if (type === "touchstart") {
    fireEvent.touchStart(target, eventData);
    return;
  }

  if (type === "touchmove") {
    fireEvent.touchMove(target, eventData);
    return;
  }

  if (type === "touchend") {
    fireEvent.touchEnd(target, eventData);
    return;
  }

  fireEvent(target, new Event(type, { bubbles: true, cancelable: true }));
}

beforeEach(() => {
  cleanup();
  installLocalStorage();
  window.localStorage.clear();
  setViewportWidth(1024);
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
  expect(screen.getByRole("link", { name: "[theme]" })).toBeInTheDocument();
  const header = screen.getByRole("banner");
  const footer = screen.getByText("ARTCTL v1.1").closest("footer");
  const galleryLink = screen.getByRole("link", { name: "[gallery]" });

  expect(header).not.toHaveClass("bg-card");
  expect(footer).not.toHaveClass("bg-card");
  expect(header).toHaveClass("bg-background");
  expect(footer).toHaveClass("bg-background");
  const nav = screen.getByRole("navigation", { name: "Primary" });
  expect(header).toHaveClass("app-header-strip");
  expect(header).not.toHaveClass("border-b");
  expect(nav).not.toHaveClass("border-b");
  expect(footer).toHaveClass("app-footer-strip");
  expect(footer).not.toHaveClass("border-t");
  expect(footer).toHaveClass("text-[10px]");
  expect(galleryLink).not.toHaveClass("border-b");
  expect(screen.getByText("ARTCTL", { selector: ".brand" })).toHaveClass("text-sm");
  expect(screen.getByText("ARTCTL", { selector: ".brand" })).toHaveClass("font-bold");
  expect(nav).toHaveClass("text-xs");
});

test("shared navigation hides the admin link when admin auth is configured but no admin session exists", async () => {
  render(
    <App
      fetchImpl={createFetchImpl({
        adminAuth: {
          username: "admin",
          password: "secret"
        }
      })}
    />
  );

  expect(await screen.findByText("ARTCTL", { selector: ".brand" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[gallery]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[search]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[help]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[theme]" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "[admin]" })).not.toBeInTheDocument();
});

test("shared shell opens a full-screen mobile menu from the header toggle", async () => {
  render(<App fetchImpl={createFetchImpl()} />);

  await screen.findByText("ARTCTL", { selector: ".brand" });
  fireEvent.click(screen.getByRole("button", { name: "open menu" }));

  const mobileMenu = screen.getByRole("dialog", { name: "mobile navigation" });

  expect(mobileMenu).toBeInTheDocument();
  expect(within(mobileMenu).getByRole("link", { name: "[gallery]" })).toBeInTheDocument();
  expect(within(mobileMenu).getByRole("link", { name: "[search]" })).toBeInTheDocument();
  expect(within(mobileMenu).getByRole("link", { name: "[help]" })).toBeInTheDocument();
  expect(within(mobileMenu).getByRole("link", { name: "[theme]" })).toBeInTheDocument();
});

test("shared shell closes the mobile menu after selecting a navigation link", async () => {
  render(<App fetchImpl={createFetchImpl()} />);

  await screen.findByText("ARTCTL", { selector: ".brand" });
  fireEvent.click(screen.getByRole("button", { name: "open menu" }));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "mobile navigation" })).getByRole("link", {
      name: "[help]"
    })
  );

  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "mobile navigation" })).not.toBeInTheDocument();
  });
});

test("homepage uses a wider route frame than standard pages", async () => {
  window.history.pushState({}, "", "/");

  render(<App fetchImpl={createFetchImpl()} />);

  expect(await screen.findByText("ARTCTL", { selector: ".brand" })).toBeInTheDocument();
  const galleryMain = screen.getByRole("main");
  expect(galleryMain.className).toContain("max-w-7xl");

  cleanup();
  window.history.pushState({}, "", "/search");

  render(<App fetchImpl={createFetchImpl()} />);

  expect(await screen.findByText("> type search")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Search" })).not.toBeInTheDocument();
  const searchMain = screen.getByRole("main");
  expect(searchMain.className).toContain("max-w-7xl");
});

test("work route uses the wider route frame", async () => {
  window.history.pushState({}, "", "/works/42");

  render(<App fetchImpl={createFetchImpl()} />);

  expect(await screen.findByRole("heading", { name: "Work 42" })).toBeInTheDocument();
  expect(screen.getByRole("main").className).toContain("max-w-7xl");
});

test.each([
  { route: "/works/42", heading: "Work 42" },
  { route: "/admin", heading: "Admin" },
  { route: "/admin/curated-groups", heading: "Curated Groups" },
  { route: "/admin/curated-groups/new", heading: "Create Curated Group" },
  { route: "/admin/curated-groups/homepage", heading: "Homepage Gallery" },
  { route: "/help", heading: "Help" },
  { route: "/theme", heading: "Theme" }
])("route $route renders its skeleton inside the shared shell", async ({ route, heading }) => {
  window.history.pushState({}, "", route);

  render(<App fetchImpl={createFetchImpl()} />);

  expect(await screen.findByText("ARTCTL", { selector: ".brand" })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "[gallery]" }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("link", { name: "[search]" }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("link", { name: "[help]" }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("link", { name: "[theme]" }).length).toBeGreaterThan(0);
  if (route.startsWith("/admin")) {
    expect(screen.getByRole("link", { name: "[admin]" })).toBeInTheDocument();
  } else {
    expect(screen.queryByRole("link", { name: "[admin]" })).not.toBeInTheDocument();
  }
});

test("search route renders its terminal shell inside the shared app shell", async () => {
  window.history.pushState({}, "", "/search");

  render(<App fetchImpl={createFetchImpl()} />);

  expect(await screen.findByText("ARTCTL", { selector: ".brand" })).toBeInTheDocument();
  expect(await screen.findByText("> type search")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Search" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[gallery]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[search]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[help]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[theme]" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "[admin]" })).not.toBeInTheDocument();
});

test("homepage route renders its shell without a page title", async () => {
  window.history.pushState({}, "", "/");

  render(<App fetchImpl={createFetchImpl()} />);

  expect(await screen.findByText("ARTCTL", { selector: ".brand" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Gallery" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[gallery]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[search]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[help]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[theme]" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "[admin]" })).not.toBeInTheDocument();
});

test("admin routes show a login form when admin auth is configured and no admin session exists", async () => {
  window.history.pushState({}, "", "/admin");

  render(
    <App
      fetchImpl={createFetchImpl({
        adminAuth: {
          username: "admin",
          password: "secret"
        }
      })}
    />
  );

  expect(await screen.findByRole("heading", { name: "Admin Login" })).toBeInTheDocument();
  expect(screen.getByLabelText("Username")).toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toBeInTheDocument();
  const form = screen.getByRole("button", { name: "[submit]" }).closest("form");
  const usernameInput = screen.getByLabelText("Username");
  const passwordInput = screen.getByLabelText("Password");

  expect(form).toHaveClass("border");
  expect(form).toHaveClass("border-border");
  expect(form).toHaveClass("bg-card");
  expect(form).toHaveClass("text-card-foreground");
  expect(form).toHaveClass("px-3");
  expect(form).toHaveClass("py-3");
  expect(form).toHaveClass("space-y-2");
  expect(form).toHaveClass("text-sm");
  expect(form).toHaveClass("font-mono");
  expect(usernameInput).toHaveAttribute("placeholder", "username");
  expect(passwordInput).toHaveAttribute("placeholder", "password");
  expect(usernameInput).toHaveClass("w-full");
  expect(usernameInput).toHaveClass("bg-transparent");
  expect(usernameInput).toHaveClass("border");
  expect(usernameInput).toHaveClass("border-border");
  expect(usernameInput).toHaveClass("px-2");
  expect(usernameInput).toHaveClass("py-1");
  expect(passwordInput).toHaveClass("w-full");
  expect(passwordInput).toHaveClass("bg-transparent");
  expect(passwordInput).toHaveClass("border");
  expect(passwordInput).toHaveClass("border-border");
  expect(passwordInput).toHaveClass("px-2");
  expect(passwordInput).toHaveClass("py-1");
  expect(screen.queryByRole("heading", { name: "Admin" })).not.toBeInTheDocument();
});

test("admin routes still show a login form when admin auth is not configured", async () => {
  window.history.pushState({}, "", "/admin");

  render(<App fetchImpl={createFetchImpl({ adminAuth: null })} />);

  expect(await screen.findByRole("heading", { name: "Admin Login" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Admin" })).not.toBeInTheDocument();
});

test("admin login unlocks the protected admin route", async () => {
  window.history.pushState({}, "", "/admin");

  render(
    <App
      fetchImpl={createFetchImpl({
        adminAuth: {
          username: "admin",
          password: "secret"
        }
      })}
    />
  );

  expect(await screen.findByRole("heading", { name: "Admin Login" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: "admin" }
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "secret" }
  });
  fireEvent.click(screen.getByRole("button", { name: "[submit]" }));

  expect(await screen.findByRole("heading", { name: "Admin" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[curated groups]" })).toBeInTheDocument();
});

test("shared navigation shows the admin link after admin login", async () => {
  window.history.pushState({}, "", "/admin");

  render(
    <App
      fetchImpl={createFetchImpl({
        adminAuth: {
          username: "admin",
          password: "secret"
        }
      })}
    />
  );

  expect(await screen.findByRole("heading", { name: "Admin Login" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: "admin" }
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "secret" }
  });
  fireEvent.click(screen.getByRole("button", { name: "[submit]" }));

  expect(await screen.findByRole("link", { name: "[admin]" })).toBeInTheDocument();
});

test("admin routes provide a logout control that ends the admin session", async () => {
  window.history.pushState({}, "", "/admin");

  render(
    <App
      fetchImpl={createFetchImpl({
        adminAuth: {
          username: "admin",
          password: "secret"
        }
      })}
    />
  );

  expect(await screen.findByRole("heading", { name: "Admin Login" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: "admin" }
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "secret" }
  });
  fireEvent.click(screen.getByRole("button", { name: "[submit]" }));

  expect(await screen.findByRole("heading", { name: "Admin" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "[logout]" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "[logout]" }));

  expect(await screen.findByRole("heading", { name: "Admin Login" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "[admin]" })).not.toBeInTheDocument();
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

  const fetchImpl = createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath });

  expect(
    (
      await fetchImpl("http://artctl.test/api/admin/curated-groups", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name: "Featured Landscapes" })
      })
    ).ok
  ).toBe(true);

  window.history.pushState({}, "", "/admin/curated-groups");

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("heading", { name: "Curated Groups" })).toBeInTheDocument();
  expect(requests.some((request) => request.includes("/api/admin/curated-groups"))).toBe(true);
  expect(await screen.findByRole("link", { name: "Homepage Gallery" })).toHaveAttribute(
    "href",
    "/admin/curated-groups/homepage"
  );
  expect(await screen.findByRole("link", { name: "Featured Landscapes" })).toHaveAttribute(
    "href",
    "/admin/curated-groups/featured-landscapes"
  );
  expect(screen.getByRole("button", { name: "Feature Featured Landscapes" })).toHaveTextContent("[ ]");
  expect(screen.getByRole("button", { name: "Feature Homepage Gallery" })).toHaveTextContent("[f]");
  const editButton = screen.getByRole("button", { name: "Edit Featured Landscapes" });
  const deleteButton = screen.getByRole("button", { name: "Delete Featured Landscapes" });
  const featureButton = screen.getByRole("button", { name: "Feature Featured Landscapes" });
  const controlCluster = editButton.parentElement;

  expect(editButton).toHaveTextContent("[edit]");
  expect(deleteButton).toHaveTextContent("[delete]");
  expect(controlCluster).toHaveClass("ml-auto");
  expect(controlCluster).toHaveClass("justify-end");
  expect(editButton).toHaveClass("text-muted-foreground");
  expect(editButton).toHaveClass("hover:text-primary");
  expect(deleteButton).toHaveClass("text-muted-foreground");
  expect(deleteButton).toHaveClass("hover:text-destructive");
  const createGroupLink = screen.getByRole("link", { name: "Create Group" });

  expect(createGroupLink).toHaveAttribute(
    "href",
    "/admin/curated-groups/new"
  );
  expect(createGroupLink).toHaveTextContent("[add]");
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
  expect(screen.getByText("> add curated group")).toBeInTheDocument();
  expect(screen.queryByLabelText("Group Slug")).not.toBeInTheDocument();
  const nameInput = screen.getByLabelText("Group Name");
  expect(nameInput).toHaveClass("bg-transparent");
  expect(nameInput.closest("form")).toHaveClass("border");
  expect(nameInput.closest("form")).toHaveClass("bg-card");
  fireEvent.change(nameInput, {
    target: { value: "Featured Landscapes" }
  });
  fireEvent.submit(nameInput.closest("form"));

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
  const featureButton = await screen.findByRole("button", { name: "Feature Featured Landscapes" });
  const homepageFeatureMarker = screen.getByRole("button", { name: "Feature Homepage Gallery" });

  expect(featureButton).toHaveTextContent("[ ]");
  expect(homepageFeatureMarker).toHaveTextContent("[f]");
  expect(featureButton).not.toHaveClass("bg-secondary");
  expect(featureButton).not.toHaveClass("border-input");
  fireEvent.click(featureButton);

  await waitFor(() => {
    expect(requests).toContain("PATCH /api/admin/curated-groups/featured-landscapes/feature");
  });
  expect(screen.getByRole("link", { name: "Featured Landscapes" })).toHaveClass("text-primary");
  expect(screen.getByRole("button", { name: "Feature Featured Landscapes" })).toHaveTextContent("[f]");
  expect(screen.getByRole("button", { name: "Feature Homepage Gallery" })).toHaveTextContent("[ ]");

  cleanup();
  window.history.pushState({}, "", "/");
  render(<App fetchImpl={createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath })} />);

  expect(screen.queryByRole("heading", { name: "Gallery" })).not.toBeInTheDocument();
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

test("curated groups route can rename a user-created group inline", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  const fetchImpl = createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath });

  expect(
    (
      await fetchImpl("http://artctl.test/api/admin/curated-groups", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name: "Featured Landscapes" })
      })
    ).ok
  ).toBe(true);

  window.history.pushState({}, "", "/admin/curated-groups");
  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("link", { name: "Featured Landscapes" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Edit Featured Landscapes" }));

  const nameInput = screen.getByLabelText("Group Name");
  expect(screen.getByText("> edit curated group (esc to cancel)")).toBeInTheDocument();
  expect(nameInput).toHaveValue("Featured Landscapes");
  fireEvent.change(nameInput, { target: { value: "Evening Paintings" } });
  fireEvent.keyDown(nameInput, { key: "Enter" });

  expect(await screen.findByRole("link", { name: "Evening Paintings" })).toHaveAttribute(
    "href",
    "/admin/curated-groups/evening-paintings"
  );
  expect(requests).toContain("PATCH /api/admin/curated-groups/featured-landscapes");
});

test("curated groups inline edit can be canceled with escape", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  const fetchImpl = createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath });

  expect(
    (
      await fetchImpl("http://artctl.test/api/admin/curated-groups", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name: "Featured Landscapes" })
      })
    ).ok
  ).toBe(true);

  window.history.pushState({}, "", "/admin/curated-groups");
  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("link", { name: "Featured Landscapes" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Edit Featured Landscapes" }));

  const nameInput = screen.getByLabelText("Group Name");
  fireEvent.change(nameInput, { target: { value: "Evening Paintings" } });
  fireEvent.keyDown(nameInput, { key: "Escape" });

  expect(screen.queryByLabelText("Group Name")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Featured Landscapes" })).toBeInTheDocument();
  expect(requests).not.toContain("PATCH /api/admin/curated-groups/featured-landscapes");
});

test("curated groups route can delete a user-created group inline", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  const fetchImpl = createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath });

  expect(
    (
      await fetchImpl("http://artctl.test/api/admin/curated-groups", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name: "Featured Landscapes" })
      })
    ).ok
  ).toBe(true);

  window.history.pushState({}, "", "/admin/curated-groups");
  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("link", { name: "Featured Landscapes" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Delete Featured Landscapes" }));

  expect(screen.getByRole("button", { name: "Confirm delete Featured Landscapes" })).toHaveTextContent(
    "[confirm delete]"
  );
  expect(screen.getByRole("button", { name: "Cancel delete Featured Landscapes" })).toHaveTextContent(
    "[cancel]"
  );
  expect(requests).not.toContain("DELETE /api/admin/curated-groups/featured-landscapes");

  fireEvent.click(screen.getByRole("button", { name: "Confirm delete Featured Landscapes" }));

  await waitFor(() => {
    expect(screen.queryByRole("link", { name: "Featured Landscapes" })).not.toBeInTheDocument();
  });
  expect(requests).toContain("DELETE /api/admin/curated-groups/featured-landscapes");
});

test("curated groups delete confirmation can be canceled without removing the row", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const requests = [];

  expect(
    runCatalogImport({
      csvPath: path.resolve("tests/fixtures/metobjects-real-subset.csv"),
      databasePath
    }).ok
  ).toBe(true);

  const fetchImpl = createFetchImpl({ requestLog: requests, catalogDatabasePath: databasePath });

  expect(
    (
      await fetchImpl("http://artctl.test/api/admin/curated-groups", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name: "Featured Landscapes" })
      })
    ).ok
  ).toBe(true);

  window.history.pushState({}, "", "/admin/curated-groups");
  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("link", { name: "Featured Landscapes" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Delete Featured Landscapes" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel delete Featured Landscapes" }));

  expect(screen.queryByRole("button", { name: "Confirm delete Featured Landscapes" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Featured Landscapes" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete Featured Landscapes" })).toBeInTheDocument();
  expect(requests).not.toContain("DELETE /api/admin/curated-groups/featured-landscapes");
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
  const curatedGroupsLink = screen.getByRole("link", { name: "[curated groups]" });

  expect(curatedGroupsLink).toHaveAttribute(
    "href",
    "/admin/curated-groups"
  );
  expect(curatedGroupsLink).toHaveTextContent("[curated groups]");
  expect(curatedGroupsLink).not.toHaveClass("bg-card");
  expect(curatedGroupsLink).not.toHaveClass("p-4");
  expect(curatedGroupsLink).not.toHaveClass("border");
  expect(screen.getByText("Manage editorial groups and homepage curation.")).toBeInTheDocument();
  expect(requests).toEqual(["/api/app-shell", "/api/admin/session", "/api/admin/session"]);
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
  const addButton = screen.getByRole("button", { name: "Add to Gallery" });

  expect(addButton).toHaveTextContent("[add]");
  expect(addButton).not.toHaveClass("bg-secondary");
  expect(addButton).not.toHaveClass("border-input");
  fireEvent.submit(addButton.closest("form"));

  expect(await screen.findByText("Curated Work 25")).toBeInTheDocument();
  const card = screen.getByText("Curated Work 25").closest("li");
  const orderBadge = within(card).getByText("1");
  const removeButton = within(card).getByRole("button", { name: "Remove Curated Work 25" });

  expect(orderBadge).toHaveClass("absolute");
  expect(orderBadge).toHaveClass("bottom-3");
  expect(orderBadge).toHaveClass("right-3");
  expect(orderBadge).toHaveClass("text-xs");
  expect(orderBadge).toHaveClass("text-muted-foreground");
  expect(removeButton).toHaveClass("absolute");
  expect(removeButton).toHaveClass("bottom-3");
  expect(removeButton).toHaveClass("left-3");
  expect(screen.getByText("25 · pending")).toBeInTheDocument();
  expect(requests).toContain("POST /api/admin/gallery");
});

test("group detail route truncates curated work titles like the gallery cards", async () => {
  const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-app-shell-sqlite-"));
  const databasePath = path.join(tempDir, "catalog.sqlite");
  const csvPath = path.join(tempDir, "admin-gallery-title-clamp.csv");

  writeFileSync(
    csvPath,
    "Object ID,Department,Title,Artist Display Name,Object Date,Object Name,Medium,Is Public Domain\n" +
      "25,European Paintings,An Extremely Long Curated Work Title That Should Clamp Across Two Lines In The Admin Gallery Card,Artist 25,1900,Painting,Oil on canvas,True\n",
    "utf8"
  );

  expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

  window.history.pushState({}, "", "/admin/curated-groups/homepage");

  render(<App fetchImpl={createFetchImpl({ catalogDatabasePath: databasePath })} />);

  expect(await screen.findByRole("heading", { name: "Homepage Gallery" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Object ID"), {
    target: { value: "25" }
  });
  fireEvent.submit(screen.getByRole("button", { name: "Add to Gallery" }).closest("form"));

  const title = await screen.findByText(
    "An Extremely Long Curated Work Title That Should Clamp Across Two Lines In The Admin Gallery Card"
  );

  expect(title).toHaveClass("line-clamp-2");
  expect(title).toHaveClass("text-sm");
  expect(title).toHaveClass("text-foreground");
  expect(screen.getByText("Artist 25")).toHaveClass("text-xs");
  expect(screen.getByText("Artist 25")).toHaveClass("text-muted-foreground");
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
  expect(screen.getByText("25 · pending")).toBeInTheDocument();
  expect(screen.getByText("26 · pending")).toBeInTheDocument();
  expect(screen.getByText("27 · pending")).toBeInTheDocument();
  expectAdminGalleryCardOrder(screen.getByText("Curated Work 25").closest("li"), 1);
  expectAdminGalleryCardOrder(screen.getByText("Curated Work 26").closest("li"), 2);
  expectAdminGalleryCardOrder(screen.getByText("Curated Work 27").closest("li"), 3);
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
  const removeButton = screen.getByRole("button", { name: "Remove Mantel" });

  expect(removeButton).toHaveTextContent("[remove]");
  expect(removeButton).not.toHaveClass("bg-secondary");
  expect(removeButton).not.toHaveClass("border-input");
  fireEvent.click(removeButton);

  await waitFor(() => {
    expect(screen.queryByText("Mantel")).not.toBeInTheDocument();
  });
  expect(screen.getByText('The "Shipwreck Medal"')).toBeInTheDocument();
  expect(screen.getByText("5046 · pending")).toBeInTheDocument();
  expectAdminGalleryCardOrder(screen.getByText('The "Shipwreck Medal"').closest("li"), 1);
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
  expect(screen.getByText("5046 · pending")).toBeInTheDocument();
  expect(screen.getByText("4926 · pending")).toBeInTheDocument();
  expectAdminGalleryCardOrder(screen.getByText('The "Shipwreck Medal"').closest("li"), 1);
  expectAdminGalleryCardOrder(screen.getByText("Mantel").closest("li"), 2);
  expect(requests).toContain("PATCH /api/admin/gallery/reorder");
});

test("admin gallery route can drag a curated item downward onto the next card and update the displayed order", async () => {
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
  const draggedCard = cards.find((card) => card.textContent.includes("Mantel"));
  const targetCard = cards.find((card) => card.textContent.includes('The "Shipwreck Medal"'));

  fireEvent.dragStart(draggedCard);
  fireEvent.dragOver(targetCard);
  fireEvent.drop(targetCard);

  await waitFor(() => {
    const reorderedCards = screen.getAllByRole("listitem");
    expect(reorderedCards[0]).toHaveTextContent('The "Shipwreck Medal"');
    expect(reorderedCards[1]).toHaveTextContent("Mantel");
  });
  expect(screen.getByText("5046 · pending")).toBeInTheDocument();
  expect(screen.getByText("4926 · pending")).toBeInTheDocument();
  expectAdminGalleryCardOrder(screen.getByText('The "Shipwreck Medal"').closest("li"), 1);
  expectAdminGalleryCardOrder(screen.getByText("Mantel").closest("li"), 2);
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
  const hydrateButton = screen.getByRole("button", { name: 'Hydrate The "Shipwreck Medal"' });

  expect(hydrateButton).toHaveTextContent("[hydrate]");
  expect(hydrateButton).not.toHaveClass("bg-secondary");
  expect(hydrateButton).not.toHaveClass("border-input");
  fireEvent.click(hydrateButton);

  await waitFor(() => {
    expect(screen.getByText("5046 · hydrated")).toBeInTheDocument();
  });
  expectAdminGalleryCardOrder(screen.getByText('The "Shipwreck Medal"').closest("li"), 2);
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
    expect(screen.getByText("5046 · hydrated")).toBeInTheDocument();
  });
  expectAdminGalleryCardOrder(screen.getByText('The "Shipwreck Medal"').closest("li"), 2);

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

  expect(screen.queryByRole("heading", { name: "Gallery" })).not.toBeInTheDocument();
  expect(await screen.findByText('The "Shipwreck Medal"')).toBeInTheDocument();
  expect(screen.getByText('The "Shipwreck Medal"').closest("a")).toHaveAttribute("href", "/works/5046");
  expect(screen.queryByRole("link", { name: "Mantel" })).not.toBeInTheDocument();
});

test("search route keeps its content on the shared shell background", async () => {
  window.history.pushState({}, "", "/search");

  render(<App fetchImpl={fetchImpl} />);

  await screen.findByText("> type search");
  const queryInput = screen.getByPlaceholderText("artist, title, culture, medium...");
  const searchShell = queryInput.closest(".search-shell");
  const searchForm = queryInput.closest("form");

  expect(screen.queryByRole("heading", { name: "Search" })).not.toBeInTheDocument();
  expect(queryInput).not.toBeNull();
  expect(screen.getByText("> type search")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "[departments]" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "[media]" })).toBeInTheDocument();
  expect(searchShell).toHaveClass("border");
  expect(searchShell).toHaveClass("border-solid");
  expect(searchShell).toHaveClass("border-border");
  expect(searchShell).toHaveClass("divide-y");
  expect(searchShell).toHaveClass("divide-border");
  expect(searchForm).not.toHaveClass("border");
  expect(screen.getByRole("link", { name: "[search]" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByText("ARTCTL v1.1")).toBeInTheDocument();
});

test("search route reveals terminal-style department and media pickers from the action strip", async () => {
  window.history.pushState({}, "", "/search");

  const metClient = {
    async getDepartments() {
      return {
        departments: [
          { departmentId: 11, displayName: "European Paintings" },
          { departmentId: 6, displayName: "Arms and Armor" }
        ]
      };
    },
    async searchCollection(query) {
      return { query, results: [] };
    }
  };

  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const departmentsButton = await screen.findByRole("button", { name: "[departments]" });
  const mediaButton = screen.getByRole("button", { name: "[media]" });
  const searchButton = screen.getByRole("button", { name: "[search]" });
  const actionsRow = departmentsButton.closest(".flex");

  expect(actionsRow).toContainElement(mediaButton);
  expect(actionsRow).toContainElement(searchButton);

  fireEvent.click(departmentsButton);
  const europeanPaintings = await screen.findByRole("button", { name: "[european paintings]" });
  const departmentsPopover = europeanPaintings.closest("[data-search-filter-popover='departments']");
  expect(europeanPaintings).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "[arms and armor]" })).toBeInTheDocument();
  expect(departmentsPopover).toBeInTheDocument();
  expect(departmentsPopover).toHaveClass("max-h-56");
  expect(departmentsPopover).toHaveClass("overflow-y-auto");
  expect(departmentsPopover).toHaveClass("w-max");
  expect(departmentsButton).toHaveClass("text-primary");
  fireEvent.click(europeanPaintings);
  expect(screen.queryByRole("button", { name: "[european paintings]" })).not.toBeInTheDocument();
  expect(departmentsButton).not.toHaveClass("text-primary");

  fireEvent.click(mediaButton);
  const paintings = screen.getByRole("button", { name: "[paintings]" });
  const mediaPopover = paintings.closest("[data-search-filter-popover='media']");
  expect(paintings).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "[oil]" })).toBeInTheDocument();
  expect(mediaPopover).toBeInTheDocument();
  expect(mediaPopover).toHaveClass("max-h-56");
  expect(mediaPopover).toHaveClass("overflow-y-auto");
  expect(mediaPopover).toHaveClass("w-max");
  expect(mediaButton).toHaveClass("text-primary");
  fireEvent.click(paintings);
  expect(screen.queryByRole("button", { name: "[paintings]" })).not.toBeInTheDocument();
  expect(mediaButton).not.toHaveClass("text-primary");

  fireEvent.click(mediaButton);
  await screen.findByRole("button", { name: "[paintings]" });
  fireEvent.mouseDown(document.body);

  expect(screen.queryByRole("button", { name: "[paintings]" })).not.toBeInTheDocument();
  expect(mediaButton).not.toHaveClass("text-primary");
});

test("search route applies active styling to the selected department and media filters", async () => {
  window.history.pushState({}, "", "/search");

  const metClient = {
    async getDepartments() {
      return {
        departments: [
          { departmentId: 11, displayName: "European Paintings" },
          { departmentId: 6, displayName: "Arms and Armor" }
        ]
      };
    },
    async searchCollection(query) {
      return { query, results: [] };
    }
  };

  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  fireEvent.click(await screen.findByRole("button", { name: "[departments]" }));
  const europeanPaintings = await screen.findByRole("button", { name: "[european paintings]" });
  const armsAndArmor = screen.getByRole("button", { name: "[arms and armor]" });
  fireEvent.click(europeanPaintings);
  fireEvent.click(screen.getByRole("button", { name: "[departments]" }));
  const reopenedEuropeanPaintings = await screen.findByRole("button", {
    name: "[european paintings]"
  });
  const reopenedArmsAndArmor = screen.getByRole("button", { name: "[arms and armor]" });

  expect(reopenedEuropeanPaintings).toHaveClass("text-primary");
  expect(reopenedEuropeanPaintings).not.toHaveClass("bg-primary/10");
  expect(reopenedEuropeanPaintings).toHaveClass("appearance-none");
  expect(reopenedEuropeanPaintings).toHaveClass("bg-transparent");
  expect(reopenedEuropeanPaintings).toHaveClass("border-0");
  expect(reopenedEuropeanPaintings).toHaveClass("text-left");
  expect(reopenedArmsAndArmor).not.toHaveClass("bg-primary/10");
  expect(reopenedArmsAndArmor).not.toHaveClass("text-muted-foreground");
  expect(reopenedArmsAndArmor).toHaveClass("appearance-none");
  expect(reopenedArmsAndArmor).toHaveClass("bg-transparent");
  expect(reopenedArmsAndArmor).toHaveClass("border-0");
  expect(reopenedArmsAndArmor).toHaveClass("text-left");

  fireEvent.click(screen.getByRole("button", { name: "[media]" }));
  const wood = screen.getByRole("button", { name: "[wood]" });
  const oil = screen.getByRole("button", { name: "[oil]" });
  fireEvent.click(wood);
  fireEvent.click(screen.getByRole("button", { name: "[media]" }));
  const reopenedWood = await screen.findByRole("button", { name: "[wood]" });
  const reopenedOil = screen.getByRole("button", { name: "[oil]" });

  expect(reopenedWood).toHaveClass("text-primary");
  expect(reopenedWood).not.toHaveClass("bg-primary/10");
  expect(reopenedWood).toHaveClass("appearance-none");
  expect(reopenedWood).toHaveClass("bg-transparent");
  expect(reopenedWood).toHaveClass("border-0");
  expect(reopenedWood).toHaveClass("text-left");
  expect(reopenedOil).not.toHaveClass("bg-primary/10");
  expect(reopenedOil).not.toHaveClass("text-muted-foreground");
  expect(reopenedOil).toHaveClass("appearance-none");
  expect(reopenedOil).toHaveClass("bg-transparent");
  expect(reopenedOil).toHaveClass("border-0");
  expect(reopenedOil).toHaveClass("text-left");
});

test("search route shows active filters and can clear them from the filter actions", async () => {
  window.history.pushState({}, "", "/search");

  const metClient = {
    async getDepartments() {
      return {
        departments: [
          { departmentId: 11, displayName: "European Paintings" },
          { departmentId: 6, displayName: "Arms and Armor" }
        ]
      };
    },
    async searchCollection(query) {
      return { query, results: [] };
    }
  };

  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(screen.queryByRole("button", { name: "[clear filters]" })).not.toBeInTheDocument();
  expect(screen.queryByText(/European Paintings|Wood/)).not.toBeInTheDocument();

  fireEvent.click(await screen.findByRole("button", { name: "[departments]" }));
  fireEvent.click(await screen.findByRole("button", { name: "[european paintings]" }));
  fireEvent.click(screen.getByRole("button", { name: "[media]" }));
  fireEvent.click(screen.getByRole("button", { name: "[wood]" }));

  expect(screen.getByRole("button", { name: "[clear filters]" })).toBeInTheDocument();
  expect(screen.getByText("European Paintings · Wood")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "[clear filters]" }));

  expect(screen.queryByRole("button", { name: "[clear filters]" })).not.toBeInTheDocument();
  expect(screen.queryByText("European Paintings · Wood")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "[departments]" }));
  expect(screen.getByRole("button", { name: "[european paintings]" })).not.toHaveClass("text-primary");
  fireEvent.click(screen.getByRole("button", { name: "[media]" }));
  expect(screen.getByRole("button", { name: "[wood]" })).not.toHaveClass("text-primary");
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

  const galleryNotice = await screen.findByLabelText("Gallery notice");

  expect(screen.queryByRole("heading", { name: "Gallery" })).not.toBeInTheDocument();
  expect(galleryNotice).toHaveClass("border");
  expect(galleryNotice).toHaveClass("border-border");
  expect(
    screen.getByText("The homepage gallery rotates weekly from a gallery of 400k+ works.")
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "[Send to a Friend]" })).toHaveClass("text-xs");
  expect(screen.getByRole("button", { name: "[Send to a Friend]" })).toHaveClass("text-primary");
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

  expect(screen.queryByRole("heading", { name: "Gallery" })).not.toBeInTheDocument();
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

  expect(screen.queryByRole("heading", { name: "Search" })).not.toBeInTheDocument();
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

  expect(screen.queryByRole("heading", { name: "Search" })).not.toBeInTheDocument();
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

  expect(screen.queryByRole("heading", { name: "Search" })).not.toBeInTheDocument();
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

  expect(screen.queryByRole("heading", { name: "Search" })).not.toBeInTheDocument();
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

  expect(await screen.findByDisplayValue('"medal mantel"')).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Search" })).not.toBeInTheDocument();
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
  const hydrationFetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      }
    },
    async json() {
      return {
        objectID: 5046,
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

  window.history.pushState({}, "", "/works/5046");

  render(
    <App
      fetchImpl={createFetchImpl({
        requestLog: requests,
        catalogDatabasePath: databasePath,
        hydrationFetchImpl
      })}
    />
  );

  expect(await screen.findByRole("heading", { name: 'The "Shipwreck Medal"' })).toBeInTheDocument();
  expect(screen.getByText("Salathiel Ellis")).toBeInTheDocument();
  expect(screen.getByText("1845–57")).toBeInTheDocument();
  expect(screen.getByText("Medal - Bronze")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: 'The "Shipwreck Medal"' })).toHaveAttribute(
    "src",
    "https://images.metmuseum.org/primary/5046.jpg"
  );
  expect(screen.queryByRole("link", { name: "[View on the Met]" })).not.toBeInTheDocument();
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

  expect(screen.queryByRole("heading", { name: "Gallery" })).not.toBeInTheDocument();
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
  expect(card).toHaveClass("border");
  expect(card).toHaveClass("border-solid");
  expect(card).toHaveClass("border-border");
  expect(card).toHaveClass("hover:border-primary");
  expect(card).toHaveClass("focus-within:border-primary");
  expect(card).toHaveClass("active:border-primary");
  expect(cardLink).toHaveAttribute("href", "/works/436524");
  expect(title).toHaveClass("line-clamp-2");
  expect(title).toHaveClass("text-sm");
  expect(title).toHaveClass("text-foreground");
  expect(meta).toHaveClass("text-xs");
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

test("homepage shares the current gallery page from the weekly rotation notice", async () => {
  const metClient = {
    async getGalleryPage() {
      return {
        results: [
          {
            objectId: 436121,
            title: "The Great Wave off Kanagawa",
            artist: "Japanese",
            imageUrl: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"
          }
        ]
      };
    }
  };
  const share = vi.fn().mockResolvedValue(undefined);

  Object.defineProperty(window.navigator, "share", {
    configurable: true,
    value: share
  });

  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  fireEvent.click(await screen.findByRole("button", { name: "[Send to a Friend]" }));

  await waitFor(() => {
    expect(share).toHaveBeenCalledWith({
      title: "ARTCTL",
      text: "Explore this week’s ARTCTL gallery.",
      url: window.location.href
    });
  });
});

test("homepage can open the suggestion modal and submit a suggested artwork", async () => {
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
          }
        ]
      };
    }
  };

  render(<App fetchImpl={createFetchImpl({ requestLog: requests, metClient })} />);

  fireEvent.click(await screen.findByRole("button", { name: "[Suggest Art Work]" }));

  const dialog = await screen.findByRole("dialog", { name: "Suggest Art Work" });

  expect(screen.getByLabelText("Artist")).toBeInTheDocument();
  expect(screen.getByLabelText("Work Name")).toBeInTheDocument();
  expect(screen.getByLabelText("Creditor Name")).toBeInTheDocument();
  expect(dialog.querySelector("form")).toHaveClass("border");
  expect(dialog.querySelector("form")).toHaveClass("bg-card");

  fireEvent.change(screen.getByLabelText("Artist"), {
    target: { value: "Hilma af Klint" }
  });
  fireEvent.change(screen.getByLabelText("Work Name"), {
    target: { value: "The Ten Largest, No. 7, Adulthood" }
  });
  fireEvent.change(screen.getByLabelText("Creditor Name"), {
    target: { value: "Jamie" }
  });
  fireEvent.click(screen.getByRole("button", { name: "[submit]" }));

  await waitFor(() => {
    expect(requests).toContain("POST /api/suggestions");
  });
  expect(screen.queryByRole("dialog", { name: "Suggest Art Work" })).not.toBeInTheDocument();
});

test("admin suggestions route can list and delete submitted artwork suggestions", async () => {
  const requests = [];
  const fetchImpl = createFetchImpl({ requestLog: requests });

  await fetchImpl("http://artctl.test/api/suggestions", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      artist: "Hilma af Klint",
      workName: "The Ten Largest, No. 7, Adulthood",
      creditorName: "Jamie"
    })
  });

  window.history.pushState({}, "", "/admin/suggestions");
  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("heading", { name: "Artwork Suggestions" })).toBeInTheDocument();
  expect(await screen.findByText("Hilma af Klint")).toBeInTheDocument();
  expect(screen.getByText("The Ten Largest, No. 7, Adulthood")).toBeInTheDocument();
  expect(screen.getByText("Jamie")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Delete suggestion for The Ten Largest, No. 7, Adulthood" }));

  await waitFor(() => {
    expect(screen.queryByText("The Ten Largest, No. 7, Adulthood")).not.toBeInTheDocument();
  });
  expect(requests).toContain("DELETE /api/admin/suggestions/1");
});

test("homepage shows a dismissible task notice below the gallery", async () => {
  const metClient = {
    async getGalleryPage() {
      return {
        results: [
          {
            objectId: 436121,
            title: "The Great Wave off Kanagawa",
            artist: "Japanese",
            imageUrl: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"
          }
        ]
      };
    }
  };

  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const taskNotice = await screen.findByLabelText("Task notice");
  const taskLink = screen.getByRole("link", { name: "[taskctl.net]" });

  expect(taskNotice).toHaveClass("border");
  expect(taskNotice).toHaveClass("border-border");
  expect(screen.getByText("[Related Project]")).toBeInTheDocument();
  expect(screen.getByText("A minimal task system for overloaded minds.")).toBeInTheDocument();
  expect(taskLink).toHaveAttribute("href", "https://taskctl.net");
  expect(taskLink).toHaveAttribute("target", "_blank");

  fireEvent.click(screen.getByRole("button", { name: "Dismiss task notice" }));

  expect(screen.queryByLabelText("Task notice")).not.toBeInTheDocument();
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

  expect(await screen.findByText("> type search")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Search" })).not.toBeInTheDocument();
  await waitFor(() => {
    expect(requests).toEqual(["/api/app-shell", "/api/admin/session", "/api/search/departments"]);
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

test("search route renders text actions while preserving current submission behavior", async () => {
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
  const departmentsButton = screen.getByRole("button", { name: "[departments]" });
  const mediaButton = screen.getByRole("button", { name: "[media]" });
  const searchButton = screen.getByRole("button", { name: "[search]" });
  const searchShell = queryInput.closest(".search-shell");

  expect(screen.getByText("> type search")).toBeInTheDocument();
  expect(searchShell).toHaveClass("border");
  expect(searchShell).toHaveClass("bg-card");
  expect(queryInput).toHaveClass("text-foreground");
  expect(queryInput).toHaveClass("appearance-none");
  expect(queryInput).toHaveClass("bg-transparent");
  expect(queryInput).toHaveClass("font-mono");
  expect(queryInput).toHaveClass("shadow-none");
  expect(queryInput).toHaveAttribute("placeholder", "artist, title, culture, medium...");
  expect(departmentsButton).toHaveTextContent("[departments]");
  expect(mediaButton).toHaveTextContent("[media]");
  expect(searchButton).toHaveTextContent("[search]");
  expect(searchButton).not.toHaveClass("bg-secondary");
  expect(searchButton).not.toHaveClass("border-input");
  expect(searchButton).not.toHaveClass("px-3");

  fireEvent.change(queryInput, {
    target: { value: "landscape" }
  });
  fireEvent.click(departmentsButton);
  fireEvent.click(await screen.findByRole("button", { name: "[european paintings]" }));
  fireEvent.click(mediaButton);
  fireEvent.click(screen.getByRole("button", { name: "[wood]" }));
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

test("search pagination renders as text actions while preserving page navigation", async () => {
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

  expect(nextButton).toHaveTextContent("[next]");
  expect(nextButton).not.toHaveClass("bg-secondary");
  expect(nextButton).not.toHaveClass("border-input");
  expect(nextButton).not.toHaveClass("px-3");
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

  expect(window.location.search).toBe("");
  expect(requests).toEqual(["/api/app-shell", "/api/admin/session", "/api/search/departments"]);
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
        metUrl: "https://www.metmuseum.org/art/collection/search/45434",
        isPublicDomain: true
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
        metUrl: "https://www.metmuseum.org/art/collection/search/45434",
        isPublicDomain: true
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
  expect(screen.queryByRole("link", { name: "[View on the Met]" })).not.toBeInTheDocument();
});

test("mobile work viewer collapses details into a tappable summary row by default", async () => {
  setViewportWidth(390);

  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "The Great Wave off Kanagawa",
        artist: "Japanese",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434",
        isPublicDomain: true
      };
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(
    await screen.findByRole("img", { name: "The Great Wave off Kanagawa" })
  ).toBeInTheDocument();

  const detailsToggle = screen.getByRole("button", { name: "Show work details" });

  expect(detailsToggle).toHaveTextContent("Japanese");
  expect(detailsToggle).toHaveTextContent("ca. 1830-32");
  expect(
    screen.queryByText("Print - Polychrome woodblock print; ink and color on paper")
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "[View on the Met]" })).not.toBeInTheDocument();

  fireEvent.click(detailsToggle);

  expect(await screen.findByText("Print - Polychrome woodblock print; ink and color on paper")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "[View on the Met]" })).not.toBeInTheDocument();
});

test("work viewer can request and render ai info for an art student", async () => {
  const requests = [];
  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "The Great Wave off Kanagawa",
        artist: "Katsushika Hokusai",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434"
      };
    }
  };
  let resolveStudy;
  const workInfoGenerator = {
    explainWorkForArtStudent() {
      return new Promise((resolve) => {
        resolveStudy = resolve;
      });
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, metClient, workInfoGenerator })} />
  );

  const image = await screen.findByRole("img", { name: "The Great Wave off Kanagawa" });
  const viewer = image.closest("figure");

  expect(viewer).not.toBeNull();
  expect(screen.getByRole("button", { name: "Study it" })).toHaveTextContent("[study it]");

  fireEvent.click(screen.getByRole("button", { name: "Study it" }));

  expect(await screen.findByTestId("ai-braille-stream")).toBeInTheDocument();
  expect(viewer).toContainElement(screen.getByTestId("ai-braille-stream"));
  await waitFor(() => {
    expect(typeof resolveStudy).toBe("function");
  });

  resolveStudy({
    observe:
      "The wave arcs over the boats, using scale contrast and repeated curves to focus attention.",
    context:
      "Hokusai made the print in Edo-period Japan, where landscape prints circulated as popular images.",
    technique:
      "Crisp contour and flat color make the composition legible while the repeated curve unifies the scene.",
    sources: [
      {
        url: "https://www.metmuseum.org/art/collection/search/45434",
        title: "The Great Wave | The Met"
      },
      {
        url: "https://www.britannica.com/topic/The-Great-Wave-off-Kanagawa",
        title: "The Great Wave off Kanagawa | Britannica"
      }
    ]
  });

  expect(await screen.findByText("observe")).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByTestId("ai-braille-stream")).toBeNull();
  });
  const studyOverlay = screen.getByLabelText("Study overlay");

  expect(studyOverlay).not.toBeNull();
  expect(viewer).toContainElement(studyOverlay);
  expect(studyOverlay).toHaveClass("border");
  expect(studyOverlay).toHaveClass("border-border");
  expect(studyOverlay).toHaveClass("overflow-y-auto");
  expect(studyOverlay).toHaveClass("max-h-[55%]");
  expect(screen.queryByText("study")).not.toBeInTheDocument();
  expect(screen.queryByText("look")).not.toBeInTheDocument();
  expect(screen.getByText("observe")).toBeInTheDocument();
  expect(screen.getByText("context")).toBeInTheDocument();
  expect(screen.getByText("technique")).toBeInTheDocument();
  expect(
    screen.getByText(
      "The wave arcs over the boats, using scale contrast and repeated curves to focus attention."
    )
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "Hokusai made the print in Edo-period Japan, where landscape prints circulated as popular images."
    )
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "Crisp contour and flat color make the composition legible while the repeated curve unifies the scene."
    )
  ).toBeInTheDocument();
  expect(screen.getByText("observe")).toHaveClass("text-[10px]");
  expect(screen.getByText("observe")).toHaveClass("text-muted-foreground");
  expect(screen.getByText("observe").parentElement).toHaveClass("grid");
  expect(screen.getByText("observe").parentElement).toHaveClass("gap-1");
  const sourceLinks = screen.getAllByRole("link", { name: "[src]" });

  expect(sourceLinks).toHaveLength(2);
  expect(sourceLinks[0]).toHaveAttribute(
    "href",
    "https://www.metmuseum.org/art/collection/search/45434"
  );
  expect(sourceLinks[1]).toHaveAttribute(
    "href",
    "https://www.britannica.com/topic/The-Great-Wave-off-Kanagawa"
  );
  expect(screen.getByRole("button", { name: "Close study overlay" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Close study overlay" }));

  await waitFor(() => {
    expect(screen.queryByText("observe")).not.toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole("button", { name: "Study it" }));

  expect(await screen.findByText("observe")).toBeInTheDocument();
  expect(
    requests.filter((request) => request === "POST /api/works/436121/ai-info")
  ).toHaveLength(1);
  expect(requests).toContain("POST /api/works/436121/ai-info");
});

test("study it does not start a second generation while a note already exists on the page", async () => {
  const requests = [];
  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "The Great Wave off Kanagawa",
        artist: "Katsushika Hokusai",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434"
      };
    }
  };
  const workInfoGenerator = {
    async explainWorkForArtStudent() {
      return {
        observe:
          "The wave arcs over the boats, using scale contrast and repeated curves to focus attention.",
        context:
          "Hokusai made the print in Edo-period Japan, where landscape prints circulated as popular images.",
        technique:
          "Crisp contour and flat color make the composition legible while the repeated curve unifies the scene.",
        sources: []
      };
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(
    <App fetchImpl={createFetchImpl({ requestLog: requests, metClient, workInfoGenerator })} />
  );

  await screen.findByRole("img", { name: "The Great Wave off Kanagawa" });

  fireEvent.click(screen.getByRole("button", { name: "Study it" }));
  expect(await screen.findByText("observe")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Close study overlay" }));
  expect(await screen.findByRole("button", { name: "Study it" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Study it" }));
  fireEvent.click(screen.getByRole("button", { name: "Study it" }));

  expect(await screen.findByText("observe")).toBeInTheDocument();
  expect(
    requests.filter((request) => request === "POST /api/works/436121/ai-info")
  ).toHaveLength(1);
});

test("mobile work viewer opens study content in a separate bottom sheet", async () => {
  setViewportWidth(390);

  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "The Great Wave off Kanagawa",
        artist: "Katsushika Hokusai",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434"
      };
    }
  };
  const workInfoGenerator = {
    async explainWorkForArtStudent() {
      return {
        observe:
          "The wave arcs over the boats, using scale contrast and repeated curves to focus attention.",
        context:
          "Hokusai made the print in Edo-period Japan, where landscape prints circulated as popular images.",
        technique:
          "Crisp contour and flat color make the composition legible while the repeated curve unifies the scene.",
        sources: []
      };
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(<App fetchImpl={createFetchImpl({ metClient, workInfoGenerator })} />);

  await screen.findByRole("img", { name: "The Great Wave off Kanagawa" });
  const viewer = screen.getByLabelText("Artwork viewer");

  fireEvent.click(screen.getByRole("button", { name: "Study it" }));

  const studySheet = await screen.findByRole("dialog", { name: "Study sheet" });

  expect(studySheet).toBeInTheDocument();
  expect(viewer).not.toContainElement(screen.getByText("observe"));
  expect(studySheet).toContainElement(screen.getByText("observe"));
  expect(screen.getByRole("button", { name: "Close study sheet" })).toBeInTheDocument();
});

test("mobile study sheet closes when swiped downward", async () => {
  setViewportWidth(390);

  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "The Great Wave off Kanagawa",
        artist: "Katsushika Hokusai",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434"
      };
    }
  };
  const workInfoGenerator = {
    async explainWorkForArtStudent() {
      return {
        observe:
          "The wave arcs over the boats, using scale contrast and repeated curves to focus attention.",
        context:
          "Hokusai made the print in Edo-period Japan, where landscape prints circulated as popular images.",
        technique:
          "Crisp contour and flat color make the composition legible while the repeated curve unifies the scene.",
        sources: []
      };
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(<App fetchImpl={createFetchImpl({ metClient, workInfoGenerator })} />);

  await screen.findByRole("img", { name: "The Great Wave off Kanagawa" });
  fireEvent.click(screen.getByRole("button", { name: "Study it" }));

  const studySheet = await screen.findByRole("dialog", { name: "Study sheet" });

  dispatchTouchEvent(studySheet, "touchstart", [{ clientX: 120, clientY: 120 }]);
  dispatchTouchEvent(studySheet, "touchmove", [{ clientX: 120, clientY: 220 }]);
  dispatchTouchEvent(studySheet, "touchend", [], [{ clientX: 120, clientY: 220 }]);

  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Study sheet" })).not.toBeInTheDocument();
  });
});

test("direct entry to an image-backed work route shows inspection controls", async () => {
  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "The Great Wave off Kanagawa",
        artist: "Japanese",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434",
        isPublicDomain: true
      };
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(await screen.findByRole("img", { name: "The Great Wave off Kanagawa" })).toBeInTheDocument();
  const viewer = screen.getByLabelText("Artwork viewer");
  const zoomIn = screen.getByRole("button", { name: "Zoom in" });
  const zoomOut = screen.getByRole("button", { name: "Zoom out" });
  const resetView = screen.getByRole("button", { name: "Reset view" });

  expect(zoomIn).toBeInTheDocument();
  expect(zoomOut).toBeInTheDocument();
  expect(resetView).toBeInTheDocument();
  expect(viewer).toContainElement(zoomIn);
  expect(viewer).toContainElement(zoomOut);
  expect(viewer).toContainElement(resetView);
  expect(screen.getByText("zoom")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Zoom in" })).toHaveTextContent("[+]");
  expect(screen.getByRole("button", { name: "Zoom out" })).toHaveTextContent("[-]");
  expect(screen.getByRole("button", { name: "Reset view" })).toHaveTextContent("[reset]");
  expect(screen.getByText("mode")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Original mode" })).toHaveTextContent("[1 original]");
  expect(screen.getByRole("button", { name: "Edges mode" })).toHaveTextContent("[2 edges]");
  expect(screen.getByRole("button", { name: "Detail mode" })).toHaveTextContent("[3 detail]");
  expect(screen.getByRole("button", { name: "Composition mode" })).toHaveTextContent("[4 composition]");
  expect(screen.getByRole("button", { name: "Original mode" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Original mode" })).toHaveClass("text-primary");
  expect(screen.getByRole("button", { name: "Edges mode" })).not.toHaveClass("text-primary");
});

test("mobile work viewer places inspection controls below the image instead of overlaying it", async () => {
  setViewportWidth(390);

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
  const viewer = screen.getByLabelText("Artwork viewer");
  const controls = screen.getByLabelText("Artwork inspection controls");

  expect(viewer).toContainElement(image);
  expect(viewer).not.toContainElement(screen.getByRole("button", { name: "Zoom in" }));
  expect(controls).toContainElement(screen.getByRole("button", { name: "Zoom in" }));
  expect(controls).toContainElement(screen.getByRole("button", { name: "Study it" }));
});

test("work viewer zoom controls change the artwork presentation and reset to the default view", async () => {
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
  const overlay = screen.getByLabelText("Artwork inspection controls");

  expect(image).toHaveStyle({
    transform: "translate(0px, 0px) scale(1)"
  });
  expect(overlay).toContainElement(screen.getByRole("button", { name: "Zoom in" }));

  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  fireEvent.click(screen.getByRole("button", { name: "Edges mode" }));

  expect(await screen.findByRole("img", { name: "The Great Wave off Kanagawa (Edges)" })).toHaveStyle({
    transform: "translate(0px, 0px) scale(1.5)"
  });
  expect(overlay).toContainElement(screen.getByRole("button", { name: "Reset view" }));

  fireEvent.click(screen.getByRole("button", { name: "Reset view" }));

  expect(screen.getByRole("img", { name: "The Great Wave off Kanagawa" })).toHaveStyle({
    transform: "translate(0px, 0px) scale(1)"
  });
  expect(screen.getByRole("button", { name: "Original mode" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Edges mode" })).toHaveAttribute("aria-pressed", "false");
});

test("reset view stays enabled for non-original analysis modes even at the default zoom level", async () => {
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

  await screen.findByRole("img", { name: "The Great Wave off Kanagawa" });

  fireEvent.click(screen.getByRole("button", { name: "Edges mode" }));

  const resetView = screen.getByRole("button", { name: "Reset view" });

  expect(resetView).toBeEnabled();

  fireEvent.click(resetView);

  expect(await screen.findByRole("img", { name: "The Great Wave off Kanagawa" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Original mode" })).toHaveAttribute("aria-pressed", "true");
});

test("switching viewer modes replaces the displayed artwork with a browser-computed analysis view", async () => {
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

  expect(image).toHaveAttribute("src", "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg");

  fireEvent.click(screen.getByRole("button", { name: "Edges mode" }));

  await waitFor(() => {
    expect(screen.getByRole("img", { name: "The Great Wave off Kanagawa (Edges)" })).toBeInTheDocument();
  });
  expect(screen.queryByRole("img", { name: "The Great Wave off Kanagawa" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edges mode" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Original mode" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Edges mode" })).toHaveClass("text-primary");
  expect(screen.getByRole("button", { name: "Original mode" })).not.toHaveClass("text-primary");
});

test("number keys 1 through 4 switch the active viewer mode", async () => {
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

  await screen.findByRole("img", { name: "The Great Wave off Kanagawa" });

  fireEvent.keyDown(window, { key: "2" });
  expect(await screen.findByRole("img", { name: "The Great Wave off Kanagawa (Edges)" })).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "3" });
  expect(await screen.findByRole("img", { name: "The Great Wave off Kanagawa (Detail)" })).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "4" });
  expect(await screen.findByRole("img", { name: "The Great Wave off Kanagawa (Composition)" })).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "1" });
  expect(await screen.findByRole("img", { name: "The Great Wave off Kanagawa" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Original mode" })).toHaveAttribute("aria-pressed", "true");
});

test("dragging a zoomed work image pans it without displacing the metadata panel", async () => {
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

  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  fireEvent.mouseDown(image, { clientX: 40, clientY: 50 });
  fireEvent.mouseMove(image, { clientX: 68, clientY: 74 });
  fireEvent.mouseUp(image);

  expect(image).toHaveStyle({
    transform: "translate(28px, 24px) scale(1.5)"
  });
  expect(screen.getByLabelText("Work metadata")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "[View on the Met]" })).not.toBeInTheDocument();
});

test("mobile work viewer pans a zoomed image with one-finger drag", async () => {
  setViewportWidth(390);

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

  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await waitFor(() => {
    expect(image).toHaveStyle({
      transform: "translate(0px, 0px) scale(1.5)"
    });
  });
  dispatchTouchEvent(image, "touchstart", [{ clientX: 40, clientY: 50 }]);
  dispatchTouchEvent(image, "touchmove", [{ clientX: 68, clientY: 74 }]);
  dispatchTouchEvent(image, "touchend", [], [{ clientX: 68, clientY: 74 }]);

  expect(image).toHaveStyle({
    transform: "translate(28px, 24px) scale(1.5)"
  });
});

test("mobile work viewer resets zoom and pan on double tap", async () => {
  setViewportWidth(390);

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

  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await waitFor(() => {
    expect(image).toHaveStyle({
      transform: "translate(0px, 0px) scale(1.5)"
    });
  });

  dispatchTouchEvent(image, "touchstart", [{ clientX: 40, clientY: 50 }]);
  dispatchTouchEvent(image, "touchmove", [{ clientX: 68, clientY: 74 }]);
  dispatchTouchEvent(image, "touchend", [], [{ clientX: 68, clientY: 74 }]);

  expect(image).toHaveStyle({
    transform: "translate(28px, 24px) scale(1.5)"
  });

  dispatchTouchEvent(image, "touchstart", [{ clientX: 60, clientY: 60 }]);
  dispatchTouchEvent(image, "touchend", [], [{ clientX: 60, clientY: 60 }]);
  dispatchTouchEvent(image, "touchstart", [{ clientX: 60, clientY: 60 }]);
  dispatchTouchEvent(image, "touchend", [], [{ clientX: 60, clientY: 60 }]);

  await waitFor(() => {
    expect(image).toHaveStyle({
      transform: "translate(0px, 0px) scale(1)"
    });
  });
});

test("mobile work viewer zooms in with a two-finger pinch gesture", async () => {
  setViewportWidth(390);

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

  dispatchTouchEvent(image, "touchstart", [
    { identifier: 1, clientX: 50, clientY: 50 },
    { identifier: 2, clientX: 150, clientY: 50 }
  ]);
  dispatchTouchEvent(image, "touchmove", [
    { identifier: 1, clientX: 25, clientY: 50 },
    { identifier: 2, clientX: 175, clientY: 50 }
  ]);

  await waitFor(() => {
    expect(image).toHaveStyle({
      transform: "translate(0px, 0px) scale(1.5)"
    });
  });
});

test("mobile work viewer clamps pan so a zoomed image cannot be dragged fully out of view", async () => {
  setViewportWidth(390);

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
  const stage = image.parentElement;

  stage.getBoundingClientRect = () => ({
    width: 300,
    height: 200,
    top: 0,
    left: 0,
    right: 300,
    bottom: 200
  });
  image.getBoundingClientRect = () => ({
    width: 300,
    height: 200,
    top: 0,
    left: 0,
    right: 300,
    bottom: 200
  });

  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  await waitFor(() => {
    expect(image).toHaveStyle({
      transform: "translate(0px, 0px) scale(1.5)"
    });
  });

  dispatchTouchEvent(image, "touchstart", [{ clientX: 40, clientY: 50 }]);
  dispatchTouchEvent(image, "touchmove", [{ clientX: 400, clientY: 400 }]);
  dispatchTouchEvent(image, "touchend", [], [{ clientX: 400, clientY: 400 }]);

  expect(image).toHaveStyle({
    transform: "translate(75px, 50px) scale(1.5)"
  });
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
        metUrl: "https://www.metmuseum.org/art/collection/search/45434",
        isPublicDomain: true
      };
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  await screen.findByRole("img", { name: "The Great Wave off Kanagawa" });
  const viewer = document.querySelector(".work-viewer");
  const metadata = screen.getByLabelText("Work metadata");

  expect(viewer).not.toBeNull();
  expect(viewer).toHaveClass("grid");
  expect(viewer).toHaveClass("gap-4");
  expect(metadata).toHaveClass("border-t");
  expect(metadata).toHaveClass("border-border");
  expect(screen.getByText("Artist")).toHaveClass("text-muted-foreground");
  expect(screen.getByRole("button", { name: "[Share this Work]" })).toHaveClass("text-xs");
  expect(screen.getByRole("button", { name: "[Share this Work]" })).toHaveClass("text-primary");
  expect(screen.getByLabelText("Open Access")).toBeInTheDocument();
  expect(screen.getByText("Public Domain")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Access and Public Domain info" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "[Buy a Print]" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "[Buy a Print]" })).toHaveClass("text-primary");
  expect(screen.queryByText("Coming Soon!")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "[View on the Met]" })).not.toBeInTheDocument();
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
  expect(image.parentElement).not.toHaveClass("p-3");
});

test("work viewer shares the current work link from the metadata panel", async () => {
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
  const share = vi.fn().mockResolvedValue(undefined);

  Object.defineProperty(window.navigator, "share", {
    configurable: true,
    value: share
  });

  window.history.pushState({}, "", "/works/436121");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  fireEvent.click(await screen.findByRole("button", { name: "[Share this Work]" }));

  await waitFor(() => {
    expect(share).toHaveBeenCalledWith({
      title: "The Great Wave off Kanagawa",
      text: "Japanese",
      url: window.location.href
    });
  });
});

test("work viewer opens a coming-soon modal for print purchases", async () => {
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

  fireEvent.click(await screen.findByRole("button", { name: "[Buy a Print]" }));

  expect(await screen.findByRole("dialog", { name: "Buy a Print" })).toBeInTheDocument();
  expect(
    screen.getByText("The ability to purchase prints from here is coming soon!")
  ).toBeInTheDocument();
});

test("work viewer explains open access and public domain from the metadata badge", async () => {
  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "The Great Wave off Kanagawa",
        artist: "Japanese",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434",
        isPublicDomain: true
      };
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  fireEvent.click(await screen.findByRole("button", { name: "Open Access and Public Domain info" }));

  expect(await screen.findByRole("dialog", { name: "Open Access and Public Domain" })).toBeInTheDocument();
  expect(
    screen.getByText("Open Access means the Met has made the image available to use.")
  ).toBeInTheDocument();
  expect(
    screen.getByText("Public domain means the work is free of known copyright restrictions.")
  ).toBeInTheDocument();
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
        metUrl: "https://www.metmuseum.org/art/collection/search/486055",
        isPublicDomain: true
      };
    }
  };

  window.history.pushState({}, "", "/works/486055");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  const unavailable = await screen.findByText("Image unavailable through the Met API.");

  expect(unavailable).toHaveClass("text-muted-foreground");
  expect(unavailable).toHaveClass("text-center");
  expect(screen.queryByRole("img", { name: "Galisteo Creek" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Zoom out" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reset view" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Original mode" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edges mode" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Detail mode" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Composition mode" })).not.toBeInTheDocument();
  expect(screen.getByText("Gustave Baumann")).toBeInTheDocument();
  expect(screen.queryByText("Public Domain")).not.toBeInTheDocument();
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
  expect(screen.queryByRole("link", { name: "[View on the Met]" })).not.toBeInTheDocument();
});

test("mobile work viewer auto-opens details when no image is available", async () => {
  setViewportWidth(390);

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
  expect(screen.getByRole("button", { name: "Hide work details" })).toBeInTheDocument();
  expect(screen.getByText("Color woodcut - Ink and color on paper")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "[View on the Met]" })).not.toBeInTheDocument();
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
  const helpPage = screen.getByText("ARTCTL", { selector: ".help-page-manual" }).closest("article");

  expect(helpPage).not.toBeNull();
  expect(within(helpPage).getByText("ARTCTL", { selector: ".help-page-manual" })).toBeInTheDocument();
  expect(within(helpPage).getByText("Quiet software for studying public-domain art.")).toBeInTheDocument();
  expect(within(helpPage).getByText("── WHY ARTCTL EXISTS ──")).toBeInTheDocument();
  expect(
    within(helpPage).getByText(/artctl combines curated galleries, structured observation, and machine-assisted interpretation/i)
  ).toBeInTheDocument();
  expect(within(helpPage).getByText(/visual analysis/i)).toBeInTheDocument();
  expect(within(helpPage).getByText(/deliberate exploration instead of algorithmic feeds/i)).toBeInTheDocument();
  expect(within(helpPage).getByText("── STUDY WORKS ──")).toBeInTheDocument();
  expect(within(helpPage).getByText("[study it]")).toBeInTheDocument();
  expect(within(helpPage).getByText(/machine observation is not connoisseurship\./i)).toBeInTheDocument();
  expect(within(helpPage).getByText("── CURATED GALLERY ──")).toBeInTheDocument();
  expect(within(helpPage).getByText(/future plans include guest-curated collections/i)).toBeInTheDocument();
  expect(within(helpPage).getByText("── SEARCH ──")).toBeInTheDocument();
  expect(within(helpPage).getByText(/search across 400,000\+ public-domain works indexed from museum collection data\./i)).toBeInTheDocument();
  expect(within(helpPage).getByText(/goya/i)).toBeInTheDocument();
  expect(within(helpPage).getByText("── SYSTEM DESIGN ──")).toBeInTheDocument();
  expect(
    within(helpPage).getByText(/artctl maintains a local collection database built from museum object data exports\./i)
  ).toBeInTheDocument();
  expect(within(helpPage).getByText("── THEMES ──")).toBeInTheDocument();
  expect(
    within(helpPage).getByText(/terminal systems/i)
  ).toBeInTheDocument();
  expect(within(helpPage).getByText("── COLLECTION SOURCE ──")).toBeInTheDocument();
  expect(
    within(helpPage).getByText(/metropolitan museum open access collection api/i)
  ).toBeInTheDocument();
  expect(within(helpPage).getByText("── ABOUT ME ──")).toBeInTheDocument();
  expect(within(helpPage).getByText(/software engineer with 10\+ years of experience in full-stack work\./i)).toBeInTheDocument();
  expect(within(helpPage).getByText(/simple things done really well can make for good software and be useful and make people happy\./i)).toBeInTheDocument();
  expect(within(helpPage).getByText(/a quiet terminal-style task manager for focused planning and execution\./i)).toBeInTheDocument();
  expect(within(helpPage).getByRole("link", { name: /taskctl\.net/i })).toHaveAttribute("href", "https://taskctl.net");
});

test("help route renders a clickable section index with hash links", async () => {
  window.history.pushState({}, "", "/help");

  render(<App fetchImpl={fetchImpl} />);

  await screen.findByRole("heading", { name: "Help" });
  const sectionNav = screen.getByRole("navigation", { name: "help sections" });
  const studyLink = screen.getByRole("link", { name: "[study works]" });
  const sourceLink = screen.getByRole("link", { name: "[collection source]" });
  const aboutLink = screen.getByRole("link", { name: "[about me]" });

  expect(sectionNav).toBeInTheDocument();
  expect(studyLink).toHaveAttribute("href", "#study-works");
  expect(sourceLink).toHaveAttribute("href", "#collection-source");
  expect(aboutLink).toHaveAttribute("href", "#about-me");
});

test("help route renders the manual copy on the shared background", async () => {
  window.history.pushState({}, "", "/help");

  render(<App fetchImpl={fetchImpl} />);

  await screen.findByRole("heading", { name: "Help" });
  const manual = screen.getByText("ARTCTL", { selector: ".help-page-manual" });
  const helpPage = manual.closest("article");
  const firstSectionTitle = within(helpPage).getByText("── WHY ARTCTL EXISTS ──");

  expect(helpPage).not.toHaveClass("bg-card");
  expect(helpPage).not.toHaveClass("border-border");
  expect(firstSectionTitle).toHaveClass("text-primary");
  expect(
    screen.getByText(/theme state persists across the application\./i)
  ).toBeInTheDocument();
});

test("help route includes a trailing scroll spacer for late section anchors", async () => {
  window.history.pushState({}, "", "/help");

  render(<App fetchImpl={fetchImpl} />);

  await screen.findByRole("heading", { name: "Help" });
  const helpPage = screen.getByText("ARTCTL", { selector: ".help-page-manual" }).closest("article");
  const spacer = helpPage.querySelector(".help-scroll-spacer");

  expect(spacer).toHaveAttribute("aria-hidden", "true");
  expect(spacer).toHaveClass("h-screen");
});

test("theme route matches the Cortex-style theme picker structure and active state", async () => {
  window.history.pushState({}, "", "/theme");

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("heading", { name: "Theme" })).toBeInTheDocument();
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

test("theme route renders a themed picker surface while preserving theme selection behavior", async () => {
  window.history.pushState({}, "", "/theme");

  render(<App fetchImpl={fetchImpl} />);

  const darkGreen = await screen.findByRole("button", { name: "Dark Green" });
  const solarized = screen.getByRole("button", { name: "Solarized" });
  const darkGreenSwatches = darkGreen.querySelectorAll(".theme-option-swatch");

  expect(darkGreen).toHaveClass("bg-primary/10");
  expect(darkGreen).toHaveClass("border-primary");
  expect(darkGreen).toHaveClass("text-primary");
  expect(darkGreen).toHaveClass("font-mono");
  expect(darkGreen).toHaveClass("text-xs");
  expect(darkGreen).toHaveClass("appearance-none");
  expect(darkGreen).toHaveClass("border-solid");
  expect(darkGreen).toHaveClass("shadow-none");
  expect(darkGreenSwatches).toHaveLength(2);
  for (const swatch of darkGreenSwatches) {
    expect(swatch).toHaveClass("border");
    expect(swatch).toHaveClass("border-border");
    expect(swatch).toHaveClass("border-solid");
  }
  expect(solarized).toHaveClass("bg-card");
  expect(solarized).toHaveClass("border-border");
  expect(solarized).toHaveClass("text-foreground");
  expect(solarized).toHaveClass("font-mono");
  expect(solarized).toHaveClass("text-xs");
  expect(solarized).toHaveClass("appearance-none");
  expect(solarized).toHaveClass("border-solid");
  expect(solarized).toHaveClass("shadow-none");
  expect(solarized).toHaveClass("hover:bg-secondary");

  fireEvent.click(solarized);

  expect(window.localStorage.getItem("artctl-theme")).toBe("solarized");
  expect(screen.getByRole("button", { name: "Solarized" })).toHaveAttribute("aria-pressed", "true");
});

test("selecting a theme updates the picker and shared panel styles to that same theme", async () => {
  window.history.pushState({}, "", "/theme");

  render(<App fetchImpl={fetchImpl} />);

  const footer = (await screen.findByText("ARTCTL v1.1")).closest("footer");

  fireEvent.click(screen.getByRole("button", { name: "Solarized" }));

  expect(window.localStorage.getItem("artctl-theme")).toBe("solarized");
  expect(screen.getByRole("button", { name: "Solarized" })).toHaveAttribute("aria-pressed", "true");
  expect(footer).toHaveClass("bg-background");
  expect(footer).not.toHaveClass("bg-card");
  expect(footer).toHaveClass("app-footer-strip");
  expect(footer).not.toHaveClass("border-t");
  expect(footer).toHaveClass("text-[10px]");
  expect(footer).toHaveClass("text-muted-foreground");
});

test("activating a Cortex theme applies the original Cortex token values", async () => {
  window.history.pushState({}, "", "/theme");

  render(<App fetchImpl={fetchImpl} />);

  fireEvent.click(await screen.findByRole("button", { name: "Solarized" }));

  expect(document.documentElement.style.getPropertyValue("--background")).toBe("192 81% 9%");
  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("68 100% 30%");
  expect(document.documentElement.style.getPropertyValue("--border")).toBe("192 50% 22%");
});

test("choosing a theme stores the preference locally in the browser", async () => {
  window.history.pushState({}, "", "/theme");

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
  window.history.pushState({}, "", "/theme");

  render(<App fetchImpl={fetchImpl} />);

  fireEvent.click(await screen.findByRole("button", { name: "Windows XP" }));
  fireEvent.click(screen.getByRole("link", { name: "[help]" }));

  expect(await screen.findByRole("heading", { name: "Help" })).toBeInTheDocument();
  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("217 100% 45%");
  expect(window.localStorage.getItem("artctl-theme")).toBe("windows-xp");
});
