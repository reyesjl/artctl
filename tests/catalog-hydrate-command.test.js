import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { runCatalogHydrationCommand } from "../server/catalog-hydrate-command.js";
import { runCatalogImport } from "../server/catalog-import.js";
import { createTrackedTempDir } from "./temp-dir.js";

function createWritableBuffer() {
  let output = "";

  return {
    write(chunk) {
      output += String(chunk);
    },
    toString() {
      return output;
    }
  };
}

function spawnNodeWithoutWarnings(commandPath, args, options = {}) {
  return spawnSync("node", [commandPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1",
      ...(options.env ?? {})
    }
  });
}

describe("catalog hydrate command", () => {
  test("runCatalogHydrationCommand reads argv, writes the report, and sets exitCode", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-command-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const processLike = {
      argv: [
        "node",
        "server/catalog-hydrate-command.js",
        databasePath,
        "--limit",
        "1",
        "--object-id",
        "5046"
      ],
      stdout,
      stderr,
      exitCode: undefined
    };

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    await runCatalogHydrationCommand(processLike, {
      fetchImpl: async (url) => {
        expect(url).toBe("https://collectionapi.metmuseum.org/public/collection/v1/objects/5046");

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              objectID: 5046,
              primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
              primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
            };
          }
        };
      }
    });

    expect(processLike.exitCode).toBe(0);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 1,
      hydratedCount: 1,
      summary: {
        hydrated: 1,
        no_image: 0,
        retry: 0,
        failed: 0
      },
      results: [
        {
          objectId: 5046,
          hydrationStatus: "hydrated",
          dimensions: "",
          primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
          primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
        }
      ]
    });
    expect(stderr.toString()).toBe(
      ["Hydrating 1/1 object 5046", "Hydrated 1/1 object 5046 -> hydrated"].join("\n") + "\n"
    );
  });

  test("catalog-hydrate-command.js runs as a real node entrypoint", () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-command-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const commandPath = path.resolve("server/catalog-hydrate-command.js");

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    const result = spawnNodeWithoutWarnings(commandPath, [databasePath, "--limit", "1", "--object-id", "5046"], {
      env: {
        ARTCTL_FAKE_MET_OBJECT_5046: JSON.stringify({
          objectID: 5046,
          primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
          primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
        })
      }
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      databasePath,
      selectedCount: 1,
      hydratedCount: 1,
      summary: {
        hydrated: 1,
        no_image: 0,
        retry: 0,
        failed: 0
      },
      results: [
        {
          objectId: 5046,
          hydrationStatus: "hydrated",
          dimensions: "",
          primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
          primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
        }
      ]
    });
    expect(result.stderr).toBe(
      ["Hydrating 1/1 object 5046", "Hydrated 1/1 object 5046 -> hydrated"].join("\n") + "\n"
    );
  });

  test("runCatalogHydrationCommand loads the SQLite database path from .env.local", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-command-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const envFilePath = path.join(tempDir, ".env.local");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const processLike = {
      argv: ["node", "server/catalog-hydrate-command.js", "--limit", "1", "--object-id", "5046"],
      env: {
        ARTCTL_ENV_FILE_PATH: envFilePath
      },
      stdout,
      stderr,
      exitCode: undefined
    };

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);
    writeFileSync(envFilePath, `CATALOG_DATABASE_PATH=${databasePath}\n`, "utf8");

    await runCatalogHydrationCommand(processLike, {
      fetchImpl: async (url) => {
        expect(url).toBe("https://collectionapi.metmuseum.org/public/collection/v1/objects/5046");

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              objectID: 5046,
              primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
              primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
            };
          }
        };
      }
    });

    expect(processLike.exitCode).toBe(0);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 1,
      hydratedCount: 1,
      summary: {
        hydrated: 1,
        no_image: 0,
        retry: 0,
        failed: 0
      },
      results: [
        {
          objectId: 5046,
          hydrationStatus: "hydrated",
          dimensions: "",
          primaryImage: "https://images.metmuseum.org/primary/5046.jpg",
          primaryImageSmall: "https://images.metmuseum.org/small/5046.jpg"
        }
      ]
    });
    expect(stderr.toString()).toBe(
      ["Hydrating 1/1 object 5046", "Hydrated 1/1 object 5046 -> hydrated"].join("\n") + "\n"
    );
  });

  test("runCatalogHydrationCommand forwards --delay-ms to the hydrator cli", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-command-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const events = [];
    const processLike = {
      argv: [
        "node",
        "server/catalog-hydrate-command.js",
        databasePath,
        "--limit",
        "2",
        "--delay-ms",
        "250",
        "--object-id",
        "4926",
        "--object-id",
        "5046"
      ],
      stdout,
      stderr,
      exitCode: undefined
    };

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    await runCatalogHydrationCommand(processLike, {
      fetchImpl: async (url) => {
        events.push(`fetch:${url.split("/").at(-1)}`);

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              objectID: Number.parseInt(url.split("/").at(-1), 10),
              primaryImage: "",
              primaryImageSmall: ""
            };
          }
        };
      },
      sleepImpl: async (delayMs) => {
        events.push(`sleep:${delayMs}`);
      }
    });

    expect(processLike.exitCode).toBe(0);
    expect(events).toEqual(["fetch:4926", "sleep:250", "fetch:5046"]);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 2,
      hydratedCount: 0,
      summary: {
        hydrated: 0,
        no_image: 2,
        retry: 0,
        failed: 0
      },
      results: [
        {
          objectId: 4926,
          hydrationStatus: "no_image",
          dimensions: "",
          primaryImage: "",
          primaryImageSmall: ""
        },
        {
          objectId: 5046,
          hydrationStatus: "no_image",
          dimensions: "",
          primaryImage: "",
          primaryImageSmall: ""
        }
      ]
    });
    expect(stderr.toString()).toBe(
      [
        "Hydrating 1/2 object 4926",
        "Hydrated 1/2 object 4926 -> no_image",
        "Hydrating 2/2 object 5046",
        "Hydrated 2/2 object 5046 -> no_image"
      ].join("\n") + "\n"
    );
  });

  test("runCatalogHydrationCommand forwards --jitter-ms to the hydrator cli", async () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-hydrate-command-"));
    const csvPath = path.resolve("tests/fixtures/metobjects-real-subset.csv");
    const databasePath = path.join(tempDir, "catalog.sqlite");
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const events = [];
    const processLike = {
      argv: [
        "node",
        "server/catalog-hydrate-command.js",
        databasePath,
        "--limit",
        "2",
        "--delay-ms",
        "1000",
        "--jitter-ms",
        "250",
        "--object-id",
        "4926",
        "--object-id",
        "5046"
      ],
      stdout,
      stderr,
      exitCode: undefined
    };

    expect(runCatalogImport({ csvPath, databasePath }).ok).toBe(true);

    await runCatalogHydrationCommand(processLike, {
      randomImpl: () => 0.5,
      fetchImpl: async (url) => {
        events.push(`fetch:${url.split("/").at(-1)}`);

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return {
              objectID: Number.parseInt(url.split("/").at(-1), 10),
              primaryImage: "",
              primaryImageSmall: ""
            };
          }
        };
      },
      sleepImpl: async (delayMs) => {
        events.push(`sleep:${delayMs}`);
      }
    });

    expect(processLike.exitCode).toBe(0);
    expect(events).toEqual(["fetch:4926", "sleep:1125", "fetch:5046"]);
    expect(JSON.parse(stdout.toString())).toEqual({
      ok: true,
      databasePath,
      selectedCount: 2,
      hydratedCount: 0,
      summary: {
        hydrated: 0,
        no_image: 2,
        retry: 0,
        failed: 0
      },
      results: [
        {
          objectId: 4926,
          hydrationStatus: "no_image",
          dimensions: "",
          primaryImage: "",
          primaryImageSmall: ""
        },
        {
          objectId: 5046,
          hydrationStatus: "no_image",
          dimensions: "",
          primaryImage: "",
          primaryImageSmall: ""
        }
      ]
    });
    expect(stderr.toString()).toBe(
      [
        "Hydrating 1/2 object 4926",
        "Hydrated 1/2 object 4926 -> no_image",
        "Hydrating 2/2 object 5046",
        "Hydrated 2/2 object 5046 -> no_image"
      ].join("\n") + "\n"
    );
  });
});
