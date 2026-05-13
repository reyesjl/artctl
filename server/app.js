import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import { createMetApiClient } from "./met-api.js";
import { MetHydrationAbortError, runCatalogHydration } from "./catalog-hydrate.js";
import { createRuntimeCatalog, createUninitializedCatalog } from "./catalog.js";
import { getObjectHydrationState } from "./catalog-sqlite.js";
import { loadCuratedArtistIndex } from "./curated-gallery.js";
import { curatedGalleryRecords } from "./curated-gallery-records.js";

const defaultSpaHtmlPath = path.resolve(process.cwd(), "index.html");

function readSpaHtml(spaHtmlPath) {
  return readFileSync(spaHtmlPath, "utf8");
}

function normalizePositiveInteger(value, defaultValue = 1) {
  const parsedValue = Number.parseInt(value ?? "", 10);

  return Number.isNaN(parsedValue) || parsedValue < 1 ? defaultValue : parsedValue;
}

function normalizeCuratedGroupSlug(value) {
  const normalizedGroupSlug = String(value ?? "").trim();
  return normalizedGroupSlug || "homepage";
}

function buildMetErrorBody(metClient, errorMessage) {
  const cooldownStatus = metClient.getCooldownStatus?.();

  if (!cooldownStatus) {
    return { error: errorMessage };
  }

  return {
    error: errorMessage,
    ...cooldownStatus
  };
}

function buildCatalogNotReadyBody() {
  return {
    error: "Catalog is not initialized.",
    scope: "catalog",
    code: "CATALOG_NOT_INITIALIZED"
  };
}

function ensureCatalogReady(response, catalog) {
  if (!catalog || catalog.isReady()) {
    return true;
  }

  response.status(503).json(catalog.getReadiness?.() ?? buildCatalogNotReadyBody());
  return false;
}

function parseCookieHeader(headerValue) {
  const cookies = new Map();

  for (const part of String(headerValue ?? "").split(";")) {
    const trimmedPart = part.trim();

    if (!trimmedPart) {
      continue;
    }

    const separatorIndex = trimmedPart.indexOf("=");

    if (separatorIndex < 1) {
      continue;
    }

    cookies.set(
      trimmedPart.slice(0, separatorIndex).trim(),
      trimmedPart.slice(separatorIndex + 1).trim()
    );
  }

  return cookies;
}

export function createArtctlApp(options = {}) {
  const {
    metClient = createMetApiClient({ curatedGalleryRecords }),
    serveSpa = true,
    spaHtmlPath = defaultSpaHtmlPath,
    staticDir = null,
    catalogDatabasePath = null,
    adminAuth = null,
    workInfoGenerator = null,
    hydrationFetchImpl = fetch,
    hydrationSleepImpl,
    hydrationRandomImpl,
    allowLegacyMetRuntime = false
  } = options;
  const defaultCatalog = catalogDatabasePath
    ? createRuntimeCatalog({ databasePath: catalogDatabasePath })
    : allowLegacyMetRuntime
      ? null
      : createUninitializedCatalog();
  const catalog = Object.hasOwn(options, "catalog") ? (options.catalog ?? null) : defaultCatalog;
  const app = express();
  const adminSessions = new Set();
  const adminAuthEnabled = Boolean(adminAuth?.username && adminAuth?.password);

  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true
    });
  });

  function createAdminSession() {
    const sessionId = randomBytes(24).toString("hex");
    adminSessions.add(sessionId);
    return sessionId;
  }

  function hasAdminSession(request) {
    if (!adminAuthEnabled) {
      return true;
    }

    const cookies = parseCookieHeader(request.headers.cookie);
    const sessionId = cookies.get("artctl_admin_session");

    return Boolean(sessionId && adminSessions.has(sessionId));
  }

  function requireAdminAuth(request, response, next) {
    if (hasAdminSession(request)) {
      next();
      return;
    }

    response.status(401).json({
      error: "Admin authentication required."
    });
  }

  async function loadWorkByObjectId(objectId) {
    if (catalog?.getWork) {
      if (catalogDatabasePath) {
        const hydrationState = getObjectHydrationState({ databasePath: catalogDatabasePath, objectId });

        if (
          hydrationState?.hydrationStatus === "pending" &&
          !hydrationState.primaryImage &&
          !hydrationState.primaryImageSmall
        ) {
          try {
            await runCatalogHydration({
              databasePath: catalogDatabasePath,
              limit: 1,
              objectIds: [objectId],
              fetchImpl: hydrationFetchImpl,
              sleepImpl: hydrationSleepImpl,
              randomImpl: hydrationRandomImpl
            });
          } catch (error) {
            if (!(error instanceof MetHydrationAbortError)) {
              throw error;
            }
          }
        }
      }

      return catalog.getWork(objectId);
    }

    return metClient.getWork(objectId);
  }

  app.get("/api/app-shell", (_request, response) => {
    response.json({
      brand: "ARTCTL",
      tagline: "Met collection terminal viewer",
      navigation: [
        { href: "/", label: "Gallery" },
        { href: "/search", label: "Search" },
        { href: "/help", label: "Help" },
        { href: "/theme", label: "Theme" },
        { href: "/admin", label: "Admin" }
      ]
    });
  });

  app.post("/api/admin/login", (request, response) => {
    if (!adminAuthEnabled) {
      response.status(501).json({
        error: "Admin authentication is not configured."
      });
      return;
    }

    const username = String(request.body?.username ?? "").trim();
    const password = String(request.body?.password ?? "");

    if (username !== adminAuth.username || password !== adminAuth.password) {
      response.status(401).json({
        error: "Invalid admin credentials."
      });
      return;
    }

    const sessionId = createAdminSession();
    response.setHeader("Set-Cookie", `artctl_admin_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
    response.json({
      ok: true
    });
  });

  app.get("/api/admin/session", (request, response) => {
    response.json({
      authenticated: adminAuthEnabled ? hasAdminSession(request) : false,
      authConfigured: adminAuthEnabled
    });
  });

  app.post("/api/admin/logout", (request, response) => {
    const cookies = parseCookieHeader(request.headers.cookie);
    const sessionId = cookies.get("artctl_admin_session");

    if (sessionId) {
      adminSessions.delete(sessionId);
    }

    response.setHeader(
      "Set-Cookie",
      "artctl_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
    );
    response.json({
      ok: true
    });
  });

  app.use("/api/admin", requireAdminAuth);

  app.get("/api/search", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    const query = request.query.q?.trim();
    const departmentId = request.query.departmentId?.trim();
    const medium = request.query.medium?.trim() ?? "";
    const page = normalizePositiveInteger(request.query.page);

    if (!query) {
      response.status(400).json({
        error: "Query is required."
      });
      return;
    }

    if (catalog?.searchCollection) {
      const results = await catalog.searchCollection({
        query,
        departmentId: departmentId ? normalizePositiveInteger(departmentId, null) : null,
        medium,
        page
      });
      response.json(results);
      return;
    }

    try {
      const results = await metClient.searchCollection({
        query,
        departmentId: departmentId ? normalizePositiveInteger(departmentId, null) : null,
        medium,
        page
      });
      response.json(results);
    } catch (error) {
      response.status(502).json(buildMetErrorBody(metClient, error.message));
    }
  });

  app.get("/api/search/departments", async (_request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    if (catalog?.getDepartments) {
      const departments = await catalog.getDepartments();
      response.json(departments);
      return;
    }

    try {
      const departments = await metClient.getDepartments();
      response.json(departments);
    } catch (error) {
      response.status(502).json(buildMetErrorBody(metClient, error.message));
    }
  });

  app.get("/api/gallery", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    if (catalog?.getGalleryPage) {
      const galleryPage = await catalog.getGalleryPage();
      response.json(galleryPage);
      return;
    }

    try {
      const galleryPage = await metClient.getGalleryPage();
      response.json(galleryPage);
    } catch (error) {
      response.status(502).json(
        buildMetErrorBody(metClient, "The Met gallery is temporarily unavailable. Please try again.")
      );
    }
  });

  app.get("/api/admin/gallery", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    const groupSlug = normalizeCuratedGroupSlug(request.query.groupSlug);

    if (catalog?.getAdminGallery) {
      const gallery = await catalog.getAdminGallery({ groupSlug });
      response.json(gallery);
      return;
    }

    response.json({ results: [] });
  });

  app.get("/api/admin/curated-groups", async (_request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    if (catalog?.getAdminCuratedGroups) {
      const groups = await catalog.getAdminCuratedGroups();
      response.json(groups);
      return;
    }

    response.json({ results: [] });
  });

  app.post("/api/admin/curated-groups", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    const name = String(request.body?.name ?? "").trim();

    if (!name) {
      response.status(400).json({
        error: "Curated group name is required."
      });
      return;
    }

    if (!catalog?.createAdminCuratedGroup) {
      response.status(501).json({
        error: "Curated group editing is not supported."
      });
      return;
    }

    const group = await catalog.createAdminCuratedGroup({ name });

    if (group?.error) {
      response.status(409).json({
        error: group.error
      });
      return;
    }

    response.status(201).json({
      ok: true,
      group
    });
  });

  app.patch("/api/admin/curated-groups/:slug/feature", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    if (!catalog?.featureAdminCuratedGroup) {
      response.status(501).json({
        error: "Curated group editing is not supported."
      });
      return;
    }

    const group = await catalog.featureAdminCuratedGroup(request.params.slug);

    if (!group) {
      response.status(404).json({
        error: "Curated group not found."
      });
      return;
    }

    response.json({
      ok: true,
      group
    });
  });

  app.patch("/api/admin/curated-groups/:slug", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    const name = String(request.body?.name ?? "").trim();

    if (!name) {
      response.status(400).json({
        error: "Curated group name is required."
      });
      return;
    }

    if (!catalog?.updateAdminCuratedGroup) {
      response.status(501).json({
        error: "Curated group editing is not supported."
      });
      return;
    }

    const group = await catalog.updateAdminCuratedGroup(request.params.slug, { name });

    if (!group) {
      response.status(404).json({
        error: "Curated group not found."
      });
      return;
    }

    if (group.error) {
      response.status(409).json({
        error: group.error
      });
      return;
    }

    response.json({
      ok: true,
      group
    });
  });

  app.delete("/api/admin/curated-groups/:slug", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    if (!catalog?.deleteAdminCuratedGroup) {
      response.status(501).json({
        error: "Curated group editing is not supported."
      });
      return;
    }

    const deleted = await catalog.deleteAdminCuratedGroup(request.params.slug);

    if (deleted === false) {
      response.status(404).json({
        error: "Curated group not found."
      });
      return;
    }

    if (deleted?.error) {
      response.status(409).json({
        error: deleted.error
      });
      return;
    }

    response.json({
      ok: true
    });
  });

  app.post("/api/admin/gallery", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    const objectId = Number.parseInt(String(request.body?.objectId ?? ""), 10);
    const groupSlug = normalizeCuratedGroupSlug(request.body?.groupSlug);

    if (Number.isNaN(objectId)) {
      response.status(400).json({
        error: "Object ID must be a number."
      });
      return;
    }

    if (!catalog?.addAdminGalleryItem) {
      response.status(501).json({
        error: "Admin gallery editing is not supported."
      });
      return;
    }

    const item = await catalog.addAdminGalleryItem(objectId, { groupSlug });

    if (!item) {
      response.status(404).json({
        error: "Work not found."
      });
      return;
    }

    response.status(201).json({
      ok: true,
      item
    });
  });

  app.delete("/api/admin/gallery/:objectId", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    const objectId = Number.parseInt(request.params.objectId, 10);
    const groupSlug = normalizeCuratedGroupSlug(request.query.groupSlug);

    if (Number.isNaN(objectId)) {
      response.status(400).json({
        error: "Object ID must be a number."
      });
      return;
    }

    if (!catalog?.removeAdminGalleryItem) {
      response.status(501).json({
        error: "Admin gallery editing is not supported."
      });
      return;
    }

    const removed = await catalog.removeAdminGalleryItem(objectId, { groupSlug });

    if (!removed) {
      response.status(404).json({
        error: "Curated gallery item not found."
      });
      return;
    }

    response.json({
      ok: true
    });
  });

  app.patch("/api/admin/gallery/:objectId/move-up", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    const objectId = Number.parseInt(request.params.objectId, 10);
    const groupSlug = normalizeCuratedGroupSlug(request.query.groupSlug);

    if (Number.isNaN(objectId)) {
      response.status(400).json({
        error: "Object ID must be a number."
      });
      return;
    }

    if (!catalog?.moveAdminGalleryItemUp) {
      response.status(501).json({
        error: "Admin gallery editing is not supported."
      });
      return;
    }

    const item = await catalog.moveAdminGalleryItemUp(objectId, { groupSlug });

    if (!item) {
      response.status(404).json({
        error: "Curated gallery item not found."
      });
      return;
    }

    response.json({
      ok: true,
      item
    });
  });

  app.patch("/api/admin/gallery/reorder", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    const objectId = Number.parseInt(String(request.body?.objectId ?? ""), 10);
    const targetObjectId = Number.parseInt(String(request.body?.targetObjectId ?? ""), 10);
    const groupSlug = normalizeCuratedGroupSlug(request.body?.groupSlug);

    if (Number.isNaN(objectId) || Number.isNaN(targetObjectId)) {
      response.status(400).json({
        error: "Object IDs must be numbers."
      });
      return;
    }

    if (!catalog?.reorderAdminGalleryItem) {
      response.status(501).json({
        error: "Admin gallery editing is not supported."
      });
      return;
    }

    const gallery = await catalog.reorderAdminGalleryItem(objectId, targetObjectId, { groupSlug });

    if (!gallery) {
      response.status(404).json({
        error: "Curated gallery item not found."
      });
      return;
    }

    response.json({
      ok: true,
      results: gallery.results ?? []
    });
  });

  app.post("/api/admin/gallery/:objectId/hydrate", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    const objectId = Number.parseInt(request.params.objectId, 10);
    const groupSlug = normalizeCuratedGroupSlug(request.query.groupSlug);

    if (Number.isNaN(objectId)) {
      response.status(400).json({
        error: "Object ID must be a number."
      });
      return;
    }

    if (!catalogDatabasePath) {
      response.status(501).json({
        error: "Admin gallery hydration is not supported."
      });
      return;
    }

    const gallery = await catalog.getAdminGallery?.({ groupSlug });
    const existingItem = gallery?.results?.find((item) => item.objectId === objectId);

    if (!existingItem) {
      response.status(404).json({
        error: "Curated gallery item not found."
      });
      return;
    }

    try {
      await runCatalogHydration({
        databasePath: catalogDatabasePath,
        limit: 1,
        objectIds: [objectId],
        fetchImpl: hydrationFetchImpl,
        sleepImpl: hydrationSleepImpl,
        randomImpl: hydrationRandomImpl
      });
    } catch (error) {
      response.status(error instanceof MetHydrationAbortError ? 502 : 500).json({
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof MetHydrationAbortError
          ? {
              code: error.code,
              abortedOnObjectId: error.objectId
            }
          : {})
      });
      return;
    }

    const updatedGallery = await catalog.getAdminGallery?.({ groupSlug });
    const item = updatedGallery?.results?.find((candidate) => candidate.objectId === objectId);

    if (!item) {
      response.status(404).json({
        error: "Curated gallery item not found."
      });
      return;
    }

    response.json({
      ok: true,
      item
    });
  });

  app.get("/api/artists/:artistSlug", async (request, response) => {
    try {
      const artistGallery = await metClient.getArtistGallery?.(request.params.artistSlug);

      if (!artistGallery) {
        response.status(404).json({
          error: "Artist gallery not found."
        });
        return;
      }

      response.json(artistGallery);
    } catch (error) {
      response.status(502).json(buildMetErrorBody(metClient, "Unable to load artist gallery."));
    }
  });

  app.get("/api/works/:objectId", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    const objectId = Number.parseInt(request.params.objectId, 10);

    if (Number.isNaN(objectId)) {
      response.status(400).json({
        error: "Object ID must be a number."
      });
      return;
    }

    try {
      const work = await loadWorkByObjectId(objectId);

      if (!work) {
        response.status(404).json({
          error: "Work not found."
        });
        return;
      }

      response.json(work);
    } catch (error) {
      response.status(502).json(buildMetErrorBody(metClient, error.message));
    }
  });

  app.post("/api/works/:objectId/ai-info", async (request, response) => {
    if (!ensureCatalogReady(response, catalog)) {
      return;
    }

    const objectId = Number.parseInt(request.params.objectId, 10);

    if (Number.isNaN(objectId)) {
      response.status(400).json({
        error: "Object ID must be a number."
      });
      return;
    }

    if (!workInfoGenerator?.explainWorkForArtStudent) {
      response.status(501).json({
        error: "AI artwork info is not configured."
      });
      return;
    }

    try {
      const work = await loadWorkByObjectId(objectId);

      if (!work) {
        response.status(404).json({
          error: "Work not found."
        });
        return;
      }

      const summary = await workInfoGenerator.explainWorkForArtStudent(work);
      response.json(summary);
    } catch (error) {
      response.status(502).json({
        error: error instanceof Error ? error.message : "Unable to generate artwork explanation."
      });
    }
  });

  if (staticDir) {
    app.use(express.static(staticDir));
  }

  if (serveSpa) {
    app.get(/^\/(?!api).*/, (_request, response) => {
      response.type("html").send(readSpaHtml(spaHtmlPath));
    });
  }

  return app;
}
