import path from "node:path";
import { pathToFileURL } from "node:url";
import { runCatalogImportCli } from "./catalog-import-cli.js";
import { resolveCatalogDatabasePath } from "./local-env.js";

export async function runCatalogImportCommand(processLike = process) {
  const csvPath = processLike.argv[2];
  const databasePath = processLike.argv[3] ?? resolveCatalogDatabasePath(processLike.env);

  processLike.exitCode = await runCatalogImportCli({
    csvPath,
    databasePath,
    stdout: processLike.stdout,
    stderr: processLike.stderr
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void runCatalogImportCommand(process);
}
