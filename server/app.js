import { readFileSync } from "node:fs";
import path from "node:path";
import express from "express";

const defaultSpaHtmlPath = path.resolve(process.cwd(), "index.html");

function readSpaHtml(spaHtmlPath) {
  return readFileSync(spaHtmlPath, "utf8");
}

export function createArtctlApp({
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
