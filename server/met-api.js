const metApiBaseUrl = "https://collectionapi.metmuseum.org/public/collection/v1";
const defaultCacheTtlMs = 5 * 60 * 1000;

class MetApiError extends Error {
  constructor(message) {
    super(message);
    this.name = "MetApiError";
  }
}

function normalizeArtist(object) {
  return object.artistDisplayName || object.culture || "Unknown";
}

function normalizeDate(object) {
  return object.objectDate || "Date unknown";
}

function normalizeContext(object) {
  const parts = [object.objectName, object.medium]
    .map((value) => value?.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);

  return parts.join(" - ") || "Object context unavailable";
}

function normalizeSearchResult(object) {
  return {
    objectId: object.objectID,
    title: object.title,
    artist: normalizeArtist(object),
    date: normalizeDate(object),
    imageUrl: object.primaryImageSmall || object.primaryImage || ""
  };
}

function normalizeWorkDetail(object) {
  return {
    objectId: object.objectID,
    title: object.title,
    artist: normalizeArtist(object),
    date: normalizeDate(object),
    context: normalizeContext(object),
    imageUrl: object.primaryImage || object.primaryImageSmall || "",
    metUrl: object.objectURL || `https://www.metmuseum.org/art/collection/search/${object.objectID}`
  };
}

function isJsonResponse(response) {
  return response.headers.get("content-type")?.includes("application/json");
}

export function createMetApiClient({ fetchImpl = fetch, cacheTtlMs = defaultCacheTtlMs } = {}) {
  const searchCache = new Map();

  function getCachedValue(cache, key) {
    const entry = cache.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }

    return entry.value;
  }

  function setCachedValue(cache, key, value) {
    cache.set(key, {
      value,
      expiresAt: Date.now() + cacheTtlMs
    });
  }

  async function readJson(resource, { errorMessage }) {
    const response = await fetchImpl(resource);

    if (!response.ok || !isJsonResponse(response)) {
      throw new MetApiError(errorMessage);
    }

    return response.json();
  }

  async function fetchObject(objectId, { optional = false } = {}) {
    const objectResponse = await fetchImpl(`${metApiBaseUrl}/objects/${objectId}`);

    if (!objectResponse.ok || !isJsonResponse(objectResponse)) {
      if (optional) {
        return null;
      }

      throw new MetApiError("Met API returned a non-JSON work response.");
    }

    return objectResponse.json();
  }

  return {
    async searchCollection(query) {
      const cachedResult = getCachedValue(searchCache, query);

      if (cachedResult) {
        return cachedResult;
      }

      const searchUrl = new URL(`${metApiBaseUrl}/search`);
      searchUrl.searchParams.set("hasImages", "true");
      searchUrl.searchParams.set("q", query);

      const searchPayload = await readJson(searchUrl, {
        errorMessage: "Met API returned a non-JSON search response."
      });
      const objectIds = searchPayload.objectIDs?.slice(0, 12) ?? [];

      if (objectIds.length === 0) {
        return { query, results: [] };
      }

      const objectPayloads = await Promise.all(
        objectIds.map((objectId) => fetchObject(objectId, { optional: true }))
      );

      const result = {
        query,
        results: objectPayloads
          .filter((object) => object?.objectID && object?.title)
          .map(normalizeSearchResult)
      };

      setCachedValue(searchCache, query, result);

      return result;
    },

    async getWork(objectId) {
      const object = await fetchObject(objectId);

      if (!object?.objectID || !object?.title) {
        return null;
      }

      return normalizeWorkDetail(object);
    }
  };
}
