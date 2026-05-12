import { listPendingHydrationObjectIds, updateObjectHydration } from "./catalog-sqlite.js";

const metObjectBaseUrl = "https://collectionapi.metmuseum.org/public/collection/v1/objects";

class MetHydrationAbortError extends Error {
  constructor(message, { objectId, hydrationError }) {
    super(message);
    this.name = "MetHydrationAbortError";
    this.code = "MET_HYDRATION_ABORTED";
    this.objectId = objectId;
    this.hydrationError = hydrationError;
  }
}

function normalizeLimit(value) {
  const parsedValue = Number.parseInt(String(value ?? "1"), 10);

  return Number.isNaN(parsedValue) || parsedValue < 1 ? 1 : parsedValue;
}

function normalizeDelayMs(value) {
  const parsedValue = Number.parseInt(String(value ?? "0"), 10);

  return Number.isNaN(parsedValue) || parsedValue < 0 ? 0 : parsedValue;
}

function normalizeJitterMs(value) {
  const parsedValue = Number.parseInt(String(value ?? "0"), 10);

  return Number.isNaN(parsedValue) || parsedValue < 0 ? 0 : parsedValue;
}

function buildObjectUrl(objectId) {
  return `${metObjectBaseUrl}/${objectId}`;
}

function isJsonResponse(response) {
  return response.headers.get("content-type")?.includes("application/json");
}

function isRetryableStatus(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

function normalizeTransportHydrationError(error) {
  if (error?.name === "AbortError") {
    return "timeout";
  }

  if (error instanceof TypeError) {
    return "transport_error";
  }

  return null;
}

export async function runCatalogHydration({
  databasePath,
  limit = 1,
  objectIds = null,
  delayMs = 0,
  jitterMs = 0,
  fetchImpl = fetch,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  randomImpl = Math.random,
  onProgress = null,
  now = () => new Date().toISOString()
}) {
  const selectedObjectIds = listPendingHydrationObjectIds({
    databasePath,
    limit: normalizeLimit(limit),
    objectIds
  });
  const normalizedDelayMs = normalizeDelayMs(delayMs);
  const normalizedJitterMs = normalizeJitterMs(jitterMs);
  const results = [];
  const summary = {
    hydrated: 0,
    no_image: 0,
    retry: 0,
    failed: 0
  };
  let hydratedCount = 0;

  for (const [index, objectId] of selectedObjectIds.entries()) {
    if (index > 0 && normalizedDelayMs > 0) {
      const jitterOffset =
        normalizedJitterMs > 0 ? Math.floor(randomImpl() * normalizedJitterMs) : 0;
      await sleepImpl(normalizedDelayMs + jitterOffset);
    }

    onProgress?.({
      stage: "start",
      index: index + 1,
      total: selectedObjectIds.length,
      objectId
    });

    let response;

    try {
      response = await fetchImpl(buildObjectUrl(objectId));
    } catch (error) {
      const hydrationError = normalizeTransportHydrationError(error);

      if (!hydrationError) {
        throw error;
      }

      updateObjectHydration({
        databasePath,
        objectId,
        hydrationStatus: "retry",
        hydrationError,
        hydratedAt: now(),
        primaryImage: "",
        primaryImageSmall: ""
      });
      results.push({
        objectId,
        hydrationStatus: "retry",
        primaryImage: "",
        primaryImageSmall: "",
        hydrationError
      });
      summary.retry += 1;
      onProgress?.({
        stage: "finish",
        index: index + 1,
        total: selectedObjectIds.length,
        objectId,
        hydrationStatus: "retry"
      });
      continue;
    }

    if (response.status === 403) {
      updateObjectHydration({
        databasePath,
        objectId,
        hydrationStatus: "retry",
        hydrationError: "http_403",
        hydratedAt: now(),
        primaryImage: "",
        primaryImageSmall: ""
      });

      throw new MetHydrationAbortError(`Met API denied hydration for object ${objectId}.`, {
        objectId,
        hydrationError: "http_403"
      });
    }

    if (response.status === 404) {
      updateObjectHydration({
        databasePath,
        objectId,
        hydrationStatus: "failed",
        hydrationError: "http_404",
        hydratedAt: now(),
        primaryImage: "",
        primaryImageSmall: ""
      });
      results.push({
        objectId,
        hydrationStatus: "failed",
        primaryImage: "",
        primaryImageSmall: "",
        hydrationError: "http_404"
      });
      summary.failed += 1;
      onProgress?.({
        stage: "finish",
        index: index + 1,
        total: selectedObjectIds.length,
        objectId,
        hydrationStatus: "failed"
      });
      continue;
    }

    if (isRetryableStatus(response.status)) {
      const hydrationError = `http_${response.status}`;

      updateObjectHydration({
        databasePath,
        objectId,
        hydrationStatus: "retry",
        hydrationError,
        hydratedAt: now(),
        primaryImage: "",
        primaryImageSmall: ""
      });
      results.push({
        objectId,
        hydrationStatus: "retry",
        primaryImage: "",
        primaryImageSmall: "",
        hydrationError
      });
      summary.retry += 1;
      onProgress?.({
        stage: "finish",
        index: index + 1,
        total: selectedObjectIds.length,
        objectId,
        hydrationStatus: "retry"
      });
      continue;
    }

    if (!isJsonResponse(response)) {
      updateObjectHydration({
        databasePath,
        objectId,
        hydrationStatus: "retry",
        hydrationError: "non_json_response",
        hydratedAt: now(),
        primaryImage: "",
        primaryImageSmall: ""
      });

      throw new MetHydrationAbortError(
        `Met API returned a non-JSON hydration response for object ${objectId}.`,
        {
          objectId,
          hydrationError: "non_json_response"
        }
      );
    }

    if (!response.ok) {
      throw new Error(`Unable to hydrate object ${objectId}.`);
    }

    const payload = await response.json();
    const primaryImage = payload.primaryImage ?? "";
    const primaryImageSmall = payload.primaryImageSmall ?? "";
    const hydrationStatus = primaryImage || primaryImageSmall ? "hydrated" : "no_image";
    const result = {
      objectId,
      hydrationStatus,
      primaryImage,
      primaryImageSmall
    };

    updateObjectHydration({
      databasePath,
      objectId,
      hydrationStatus,
      hydrationError: "",
      hydratedAt: now(),
      primaryImage,
      primaryImageSmall
    });
    if (hydrationStatus === "hydrated") {
      hydratedCount += 1;
    }
    summary[hydrationStatus] += 1;
    results.push(result);
    onProgress?.({
      stage: "finish",
      index: index + 1,
      total: selectedObjectIds.length,
      objectId,
      hydrationStatus
    });
  }

  return {
    ok: true,
    databasePath,
    selectedCount: selectedObjectIds.length,
    hydratedCount,
    summary,
    results
  };
}

export { MetHydrationAbortError };
