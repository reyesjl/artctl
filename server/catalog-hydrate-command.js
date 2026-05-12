import path from "node:path";
import { pathToFileURL } from "node:url";
import { runCatalogHydrationCli } from "./catalog-hydrate-cli.js";
import { resolveCatalogDatabasePath } from "./local-env.js";

function parseCatalogHydrationArgs(argv) {
  const firstArgument = argv[2];
  const databasePath =
    firstArgument && !firstArgument.startsWith("--") ? firstArgument : null;
  let limit = 1;
  let delayMs = 0;
  let jitterMs = 0;
  const objectIds = [];
  const optionStartIndex = databasePath ? 3 : 2;

  for (let index = optionStartIndex; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--limit") {
      limit = Number.parseInt(argv[index + 1] ?? "1", 10);
      index += 1;
      continue;
    }

    if (argument === "--delay-ms") {
      delayMs = Number.parseInt(argv[index + 1] ?? "0", 10);
      index += 1;
      continue;
    }

    if (argument === "--jitter-ms") {
      jitterMs = Number.parseInt(argv[index + 1] ?? "0", 10);
      index += 1;
      continue;
    }

    if (argument === "--object-id") {
      const objectId = Number.parseInt(argv[index + 1] ?? "", 10);

      if (!Number.isNaN(objectId)) {
        objectIds.push(objectId);
      }

      index += 1;
    }
  }

  return {
    databasePath,
    limit,
    delayMs,
    jitterMs,
    objectIds
  };
}

function createProcessFetchImpl(processLike) {
  return async (url) => {
    const objectId = Number.parseInt(String(url).split("/").at(-1) ?? "", 10);
    const envKey = `ARTCTL_FAKE_MET_OBJECT_${objectId}`;
    const fakePayload = processLike.env?.[envKey];

    if (!fakePayload) {
      return fetch(url);
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      async json() {
        return JSON.parse(fakePayload);
      }
    };
  };
}

export async function runCatalogHydrationCommand(
  processLike = process,
  { fetchImpl = createProcessFetchImpl(processLike), sleepImpl, randomImpl } = {}
) {
  const {
    databasePath: parsedDatabasePath,
    limit,
    delayMs,
    jitterMs,
    objectIds
  } = parseCatalogHydrationArgs(processLike.argv);
  const databasePath = parsedDatabasePath ?? resolveCatalogDatabasePath(processLike.env);

  processLike.exitCode = await runCatalogHydrationCli({
    databasePath,
    limit,
    delayMs,
    jitterMs,
    objectIds,
    logProgress: true,
    stdout: processLike.stdout,
    stderr: processLike.stderr,
    fetchImpl,
    sleepImpl,
    randomImpl
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void runCatalogHydrationCommand(process);
}
