const metApiBaseUrl = "https://collectionapi.metmuseum.org/public/collection/v1";
const defaultCacheTtlMs = 5 * 60 * 1000;
const defaultRequestTimeoutMs = 8 * 1000;
const defaultMaxRetries = 1;
const searchPageSize = 12;
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

function normalizePositiveInteger(value, defaultValue = 1) {
  const parsedValue = Number.parseInt(value ?? "", 10);

  return Number.isNaN(parsedValue) || parsedValue < 1 ? defaultValue : parsedValue;
}

function normalizeSearchState(input) {
  if (typeof input === "string") {
    return {
      query: input.trim(),
      departmentId: null,
      medium: "",
      page: 1
    };
  }

  return {
    query: input?.query?.trim() ?? "",
    departmentId:
      input?.departmentId == null ? null : normalizePositiveInteger(input.departmentId, null),
    medium: input?.medium?.trim() ?? "",
    page: normalizePositiveInteger(input?.page)
  };
}

function normalizeGalleryState(input) {
  return {
    page: normalizePositiveInteger(input?.page),
    shuffle: input?.shuffle?.trim() ?? ""
  };
}

function buildSearchCacheKey(searchState) {
  return JSON.stringify([
    searchState.query,
    searchState.departmentId,
    searchState.medium,
    searchState.page
  ]);
}

function buildGalleryCacheKey(galleryState) {
  return JSON.stringify([galleryState.page, galleryState.shuffle]);
}

function hashString(input) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function buildGalleryOrder(objectIds, shuffleSeed) {
  const sortedObjectIds = [...objectIds].sort((left, right) => left - right);

  if (!shuffleSeed) {
    return sortedObjectIds;
  }

  return sortedObjectIds.sort((left, right) => {
    const leftRank = hashString(`${shuffleSeed}:${left}`);
    const rightRank = hashString(`${shuffleSeed}:${right}`);

    return leftRank - rightRank || left - right;
  });
}

const curatedMediumMatchers = {
  paintings: ["painting"],
  drawings: ["drawing"],
  prints: ["print"],
  photos: ["photograph", "photo"],
  sculpture: ["sculpture"],
  oil: ["oil"],
  paper: ["paper"],
  canvas: ["canvas"],
  metal: ["metal", "bronze", "silver", "gold", "iron", "steel", "copper"],
  wood: ["wood", "woodblock", "woodcut"]
};

function matchesCuratedMedium(object, medium) {
  if (!medium) {
    return true;
  }

  const keywords = curatedMediumMatchers[medium] ?? [medium];
  const haystack = [object?.medium, object?.objectName]
    .map((value) => value?.toLowerCase() ?? "")
    .join(" ");

  return keywords.some((keyword) => haystack.includes(keyword));
}

export function createMetApiClient({
  fetchImpl = fetch,
  cacheTtlMs = defaultCacheTtlMs,
  requestTimeoutMs = defaultRequestTimeoutMs,
  maxRetries = defaultMaxRetries
} = {}) {
  const searchCache = new Map();
  const galleryCache = new Map();
  const departmentCache = new Map();
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
    async searchCollection(input) {
      const searchState = normalizeSearchState(input);
      const { query, departmentId, medium } = searchState;
      const cacheKey = buildSearchCacheKey(searchState);
      const cachedResult = getCachedValue(searchCache, cacheKey);

      if (cachedResult) {
        return cachedResult;
      }

      const searchUrl = new URL(`${metApiBaseUrl}/search`);
      searchUrl.searchParams.set("hasImages", "true");
      searchUrl.searchParams.set("q", query);

      if (departmentId != null) {
        searchUrl.searchParams.set("departmentId", String(departmentId));
      }

      const searchPayload = await readJson(searchUrl, {
        errorMessage: "Met API returned a non-JSON search response."
      });
      const objectIds = searchPayload.objectIDs ?? [];
      const firstResultIndex = (searchState.page - 1) * searchPageSize;
      const lastResultIndex = firstResultIndex + searchPageSize;

      if (objectIds.length === 0) {
        return { query, results: [] };
      }

      const matchingObjects = [];

      for (
        let index = 0;
        index < objectIds.length && matchingObjects.length < lastResultIndex;
        index += searchPageSize
      ) {
        const objectPayloads = await Promise.all(
          objectIds
            .slice(index, index + searchPageSize)
            .map((objectId) => fetchObject(objectId, { optional: true }))
        );

        matchingObjects.push(
          ...objectPayloads
            .filter((object) => object?.objectID && object?.title)
            .filter((object) => matchesCuratedMedium(object, medium))
        );
      }

      const result = {
        query,
        results: matchingObjects
          .slice(firstResultIndex, lastResultIndex)
          .map(normalizeSearchResult)
      };

      setCachedValue(searchCache, cacheKey, result);

      return result;
    },

    async getDepartments() {
      const cacheKey = "departments";
      const cachedResult = getCachedValue(departmentCache, cacheKey);

      if (cachedResult) {
        return cachedResult;
      }

      const departmentsPayload = await readJson(`${metApiBaseUrl}/departments`, {
        errorMessage: "Met API returned a non-JSON departments response."
      });
      const result = {
        departments: (departmentsPayload.departments ?? []).filter(
          (department) => department?.departmentId && department?.displayName
        )
      };

      setCachedValue(departmentCache, cacheKey, result);

      return result;
    },

    async getGalleryPage(input) {
      const galleryState = normalizeGalleryState(input);
      const cacheKey = buildGalleryCacheKey(galleryState);
      const cachedResult = getCachedValue(galleryCache, cacheKey);
      const lastResultIndex = galleryState.page * galleryPageSize;
      const firstResultIndex = lastResultIndex - galleryPageSize;

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
        const objectIds = buildGalleryOrder(gallerySearchPayload.objectIDs ?? [], galleryState.shuffle);
        const results = [];

        for (
          let index = 0;
          index < objectIds.length && results.length <= lastResultIndex;
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

        const result = {
          page: galleryState.page,
          shuffle: galleryState.shuffle,
          hasMore: results.length > lastResultIndex,
          results: results.slice(firstResultIndex, lastResultIndex)
        };
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
