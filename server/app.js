import { readFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import { createMetApiClient } from "./met-api.js";

const defaultSpaHtmlPath = path.resolve(process.cwd(), "index.html");

function readSpaHtml(spaHtmlPath) {
  return readFileSync(spaHtmlPath, "utf8");
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

    if (!query) {
      response.status(400).json({
        error: "Query is required."
      });
      return;
    }

    const results = await metClient.searchCollection(query);
    response.json(results);
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
