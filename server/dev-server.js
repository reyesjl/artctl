import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";
import { createArtctlApp } from "./app.js";
import { loadArtctlEnv, resolveCatalogDatabasePath } from "./local-env.js";

function resolveDevServerOptions(processEnv = process.env) {
  const resolvedEnv = loadArtctlEnv(processEnv);

  return {
    port: Number(resolvedEnv.PORT ?? 3000),
    catalogDatabasePath: resolveCatalogDatabasePath(processEnv)
  };
}

export function createDevArtctlApp(processEnv = process.env) {
  const { catalogDatabasePath } = resolveDevServerOptions(processEnv);

  return createArtctlApp({
    serveSpa: false,
    catalogDatabasePath
  });
}

export async function startDevServer(processEnv = process.env) {
  const { port } = resolveDevServerOptions(processEnv);
  const app = createDevArtctlApp(processEnv);
  const vite = await createViteServer({
    appType: "custom",
    server: { middlewareMode: true }
  });

  app.use(vite.middlewares);

  app.get(/^\/(?!api).*/, async (request, response, next) => {
    try {
      const templatePath = path.resolve(process.cwd(), "index.html");
      const template = readFileSync(templatePath, "utf8");
      const html = await vite.transformIndexHtml(request.originalUrl, template);

      response.status(200).type("html").send(html);
    } catch (error) {
      next(error);
    }
  });

  app.listen(port, () => {
    console.log(`ARTCTL dev server listening on http://localhost:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startDevServer(process.env);
}
