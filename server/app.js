import { readFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import { createMetApiClient } from "./met-api.js";

const defaultSpaHtmlPath = path.resolve(process.cwd(), "index.html");

function readSpaHtml(spaHtmlPath) {
  return readFileSync(spaHtmlPath, "utf8");
}

function normalizePositiveInteger(value, defaultValue = 1) {
  const parsedValue = Number.parseInt(value ?? "", 10);

  return Number.isNaN(parsedValue) || parsedValue < 1 ? defaultValue : parsedValue;
}

function normalizeGalleryState(query = {}) {
  return {
    page: normalizePositiveInteger(query.page),
    shuffle: query.shuffle?.trim() ?? ""
  };
}

export function createArtctlApp({
  metClient = createMetApiClient(),
  serveSpa = true,
  spaHtmlPath = defaultSpaHtmlPath,
  staticDir = null
} = {}) {
  const app = express();

  app.get("/api/app-shell", (_request, response) => {
    response.json({
      brand: "ARTCTL",
      tagline: "Met collection terminal viewer",
      navigation: [
        { href: "/", label: "Gallery" },
        { href: "/search", label: "Search" },
        { href: "/help", label: "Help" },
        { href: "/themes", label: "Themes" }
      ]
    });
  });

  app.get("/api/search", async (request, response) => {
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

    try {
      const results = await metClient.searchCollection({
        query,
        departmentId: departmentId ? normalizePositiveInteger(departmentId, null) : null,
        medium,
        page
      });
      response.json(results);
    } catch (error) {
      response.status(502).json({
        error: error.message
      });
    }
  });

  app.get("/api/search/departments", async (_request, response) => {
    try {
      const departments = await metClient.getDepartments();
      response.json(departments);
    } catch (error) {
      response.status(502).json({
        error: error.message
      });
    }
  });

  app.get("/api/gallery", async (request, response) => {
    try {
      const galleryPage = await metClient.getGalleryPage(normalizeGalleryState(request.query));
      response.json(galleryPage);
    } catch (error) {
      response.status(502).json({
        error: "The Met gallery is temporarily unavailable. Please try again."
      });
    }
  });

  app.get("/api/works/:objectId", async (request, response) => {
    const objectId = Number.parseInt(request.params.objectId, 10);

    if (Number.isNaN(objectId)) {
      response.status(400).json({
        error: "Object ID must be a number."
      });
      return;
    }

    let work;

    try {
      work = await metClient.getWork(objectId);
    } catch (error) {
      response.status(502).json({
        error: error.message
      });
      return;
    }

    if (!work) {
      response.status(404).json({
        error: "Work not found."
      });
      return;
    }

    response.json(work);
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
