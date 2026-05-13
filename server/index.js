import path from "node:path";
import { pathToFileURL } from "node:url";
import { createArtctlApp } from "./app.js";
import { loadArtctlEnv, resolveAdminAuth, resolveCatalogDatabasePath, resolveWorkAiConfig } from "./local-env.js";
import { createWorkInfoGenerator } from "./work-ai.js";

function resolveProductionServerOptions(processEnv = process.env) {
  const resolvedEnv = loadArtctlEnv(processEnv);
  const distDir = path.resolve(process.cwd(), "dist");

  return {
    port: Number(resolvedEnv.PORT ?? 3000),
    spaHtmlPath: path.join(distDir, "index.html"),
    staticDir: distDir,
    catalogDatabasePath: resolveCatalogDatabasePath(processEnv),
    adminAuth: resolveAdminAuth(processEnv),
    workAiConfig: resolveWorkAiConfig(processEnv)
  };
}

export function createProductionArtctlApp(processEnv = process.env) {
  const { spaHtmlPath, staticDir, catalogDatabasePath, adminAuth, workAiConfig } =
    resolveProductionServerOptions(processEnv);

  return createArtctlApp({
    spaHtmlPath,
    staticDir,
    catalogDatabasePath,
    adminAuth,
    workInfoGenerator: createWorkInfoGenerator(workAiConfig ?? undefined)
  });
}

export function startProductionServer(processEnv = process.env) {
  const { port } = resolveProductionServerOptions(processEnv);
  const app = createProductionArtctlApp(processEnv);

  return app.listen(port, () => {
    console.log(`ARTCTL server listening on http://localhost:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startProductionServer(process.env);
}
