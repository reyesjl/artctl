import { writeFileSync } from "node:fs";
import { MetHydrationAbortError, runCatalogHydration } from "./catalog-hydrate.js";

function writeToStream(stream, output) {
  if (typeof stream.fd === "number") {
    writeFileSync(stream.fd, output);
  } else {
    stream.write(output);
  }
}

export async function runCatalogHydrationCli({
  databasePath,
  limit = 1,
  objectIds = null,
  delayMs = 0,
  jitterMs = 0,
  logProgress = false,
  stdout = process.stdout,
  stderr = process.stderr,
  fetchImpl = fetch,
  sleepImpl,
  randomImpl
}) {
  try {
    const result = await runCatalogHydration({
      databasePath,
      limit,
      objectIds,
      delayMs,
      jitterMs,
      fetchImpl,
      sleepImpl,
      randomImpl,
      onProgress: logProgress
        ? (event) => {
            if (event.stage === "start") {
              writeToStream(
                stderr,
                `Hydrating ${event.index}/${event.total} object ${event.objectId}\n`
              );
              return;
            }

            writeToStream(
              stderr,
              `Hydrated ${event.index}/${event.total} object ${event.objectId} -> ${event.hydrationStatus}\n`
            );
          }
        : null
    });
    const output = `${JSON.stringify(result)}\n`;

    writeToStream(stdout, output);

    return 0;
  } catch (error) {
    const result = {
      ok: false,
      databasePath,
      error: error instanceof Error ? error.message : String(error),
      ...(error instanceof MetHydrationAbortError
        ? {
            code: error.code,
            abortedOnObjectId: error.objectId
          }
        : {})
    };
    const output = `${JSON.stringify(result)}\n`;

    writeToStream(stderr, output);

    return 1;
  }
}
