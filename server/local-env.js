import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseEnvFile(fileContents) {
  const values = {};

  for (const line of fileContents.split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex < 1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim();

    values[key] = value;
  }

  return values;
}

export function resolveArtctlEnvFilePath(processEnv = process.env) {
  return processEnv.ARTCTL_ENV_FILE_PATH || path.resolve(process.cwd(), ".env.local");
}

export function loadArtctlEnv(processEnv = process.env) {
  const envFilePath = resolveArtctlEnvFilePath(processEnv);

  if (!existsSync(envFilePath)) {
    return { ...processEnv };
  }

  const fileValues = parseEnvFile(readFileSync(envFilePath, "utf8"));

  return {
    ...fileValues,
    ...processEnv
  };
}

export function resolveCatalogDatabasePath(processEnv = process.env) {
  return loadArtctlEnv(processEnv).CATALOG_DATABASE_PATH ?? null;
}

export function resolveAdminAuth(processEnv = process.env) {
  const resolvedEnv = loadArtctlEnv(processEnv);
  const username = resolvedEnv.ARTCTL_ADMIN_USERNAME?.trim() ?? "";
  const password = resolvedEnv.ARTCTL_ADMIN_PASSWORD ?? "";

  if (!username || !password) {
    return null;
  }

  return {
    username,
    password
  };
}
