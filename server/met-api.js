const metApiBaseUrl = "https://collectionapi.metmuseum.org/public/collection/v1";
const defaultCacheTtlMs = 5 * 60 * 1000;
const defaultRequestTimeoutMs = 8 * 1000;
const defaultMaxRetries = 1;
const galleryPageSize = 24;
const galleryBatchSize = 24;

class MetApiError extends Error {
  constructor(message) {
    super(message);
    this.name = "MetApiError";
  }
}

class MetApiTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "MetApiTimeoutError";
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
  const imageUrl = object.primaryImageSmall || object.primaryImage || "";

  return {
    objectId: object.objectID,
    title: object.title,
    artist: normalizeArtist(object),
    date: normalizeDate(object),
    imageUrl,
    isPublicDomain: Boolean(object.isPublicDomain),
    hasImage: Boolean(imageUrl)
  };
}

function normalizeGalleryResult(object) {
  return {
    objectId: object.objectID,
    title: object.title,
    artist: normalizeArtist(object),
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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableResponse(response) {
  return [408, 425, 429, 500, 502, 503, 504].includes(response.status);
}

function isRetryableError(error) {
  return (
    error instanceof MetApiTimeoutError ||
    error?.name === "AbortError" ||
    error instanceof TypeError
  );
}

export function createMetApiClient({
  fetchImpl = fetch,
  cacheTtlMs = defaultCacheTtlMs,
  requestTimeoutMs = defaultRequestTimeoutMs,
  maxRetries = defaultMaxRetries
} = {}) {
  const searchCache = new Map();
  const galleryCache = new Map();
  const cookieJar = new Map();

  function getCachedValue(cache, key) {
    const entry = cache.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
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

  function getCachedEntry(cache, key) {
    return cache.get(key) ?? null;
  }

  function getCookieHeader() {
    if (cookieJar.size === 0) {
      return "";
    }

    return Array.from(cookieJar.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  function rememberCookies(response) {
    const setCookies = response.headers.getSetCookie?.() ?? [];

    for (const header of setCookies) {
      const delimiterIndex = header.indexOf(";");
      const cookiePair = delimiterIndex >= 0 ? header.slice(0, delimiterIndex) : header;
      const assignmentIndex = cookiePair.indexOf("=");

      if (assignmentIndex <= 0) {
        continue;
      }

      const name = cookiePair.slice(0, assignmentIndex).trim();
      const value = cookiePair.slice(assignmentIndex + 1).trim();

      if (name && value) {
        cookieJar.set(name, value);
      }
    }
  }

  async function fetchWithTimeout(resource, headers) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timeoutId = null;

    try {
      const requestInit = {
        headers,
        signal: controller?.signal
      };
      const fetchPromise = fetchImpl(resource, requestInit);

      if (requestTimeoutMs <= 0) {
        return await fetchPromise;
      }

      return await Promise.race([
        fetchPromise,
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            controller?.abort();
            reject(new MetApiTimeoutError("Met API request timed out."));
          }, requestTimeoutMs);
        })
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function fetchMet(resource) {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const cookieHeader = getCookieHeader();
        let response = await fetchWithTimeout(
          resource,
          cookieHeader ? { cookie: cookieHeader } : undefined
        );

        rememberCookies(response);

        if (
          response.status === 403 &&
          !isJsonResponse(response) &&
          cookieJar.size > 0
        ) {
          response = await fetchWithTimeout(resource, {
            cookie: getCookieHeader()
          });
          rememberCookies(response);
        }

        if (isRetryableResponse(response) && attempt < maxRetries) {
          await sleep(150 * (attempt + 1));
          continue;
        }

        return response;
      } catch (error) {
        if (!isRetryableError(error) || attempt >= maxRetries) {
          throw error;
        }

        await sleep(150 * (attempt + 1));
      }
    }

    throw new MetApiError("Met API request failed.");
  }

  async function readJson(resource, { errorMessage }) {
    const response = await fetchMet(resource);

    if (!response.ok || !isJsonResponse(response)) {
      throw new MetApiError(errorMessage);
    }

    return response.json();
  }

  async function fetchObject(objectId, { optional = false } = {}) {
    let objectResponse;

    try {
      objectResponse = await fetchMet(`${metApiBaseUrl}/objects/${objectId}`);
    } catch (error) {
      if (optional) {
        return null;
      }

      throw new MetApiError("Met API work request failed.");
    }

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

    async getGalleryPage() {
      const cacheKey = "first-page";
      const cachedResult = getCachedValue(galleryCache, cacheKey);

      if (cachedResult) {
        return cachedResult;
      }

      try {
        const gallerySearchUrl = new URL(`${metApiBaseUrl}/search`);
        gallerySearchUrl.searchParams.set("hasImages", "true");
        gallerySearchUrl.searchParams.set("isHighlight", "true");
        gallerySearchUrl.searchParams.set("q", "*");

        const gallerySearchPayload = await readJson(gallerySearchUrl, {
          errorMessage: "Met API returned a non-JSON gallery response."
        });
        const objectIds = [...(gallerySearchPayload.objectIDs ?? [])].sort((left, right) => left - right);
        const results = [];

        for (
          let index = 0;
          index < objectIds.length && results.length < galleryPageSize;
          index += galleryBatchSize
        ) {
          const objectPayloads = await Promise.all(
            objectIds
              .slice(index, index + galleryBatchSize)
              .map((objectId) => fetchObject(objectId, { optional: true }))
          );

          results.push(
            ...objectPayloads
              .filter(
                (object) =>
                  object?.objectID &&
                  object?.title &&
                  Boolean(object.primaryImageSmall || object.primaryImage) &&
                  object.isPublicDomain !== false
              )
              .map(normalizeGalleryResult)
          );
        }

        const result = { results: results.slice(0, galleryPageSize) };
        setCachedValue(galleryCache, cacheKey, result);

        return result;
      } catch (error) {
        const staleResult = getCachedEntry(galleryCache, cacheKey)?.value ?? null;

        if (staleResult) {
          return staleResult;
        }

        throw error;
      }
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
