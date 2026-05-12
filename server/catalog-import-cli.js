import { writeFileSync } from "node:fs";
import { runCatalogImport, runCatalogImportAsync } from "./catalog-import.js";

export async function runCatalogImportCli({
  csvPath,
  databasePath = null,
  stdout = process.stdout,
  stderr = process.stderr
}) {
  const result = databasePath
    ? await runCatalogImportAsync({ csvPath, databasePath })
    : runCatalogImport({ csvPath, databasePath });
  const target = result.ok ? stdout : stderr;
  const output = `${JSON.stringify(result)}\n`;

  if (typeof target.fd === "number") {
    writeFileSync(target.fd, output);
  } else {
    target.write(output);
  }

  return result.ok ? 0 : 1;
}
