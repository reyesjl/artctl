import { EventEmitter } from "node:events";
import { describe, expect, test } from "vitest";
import httpMocks from "node-mocks-http";
import { createArtctlApp } from "../server/app.js";
import { createMetApiClient } from "../server/met-api.js";

const app = createArtctlApp();

async function makeRequest(url, targetApp = app) {
  const request = httpMocks.createRequest({
    method: "GET",
    url
  });
  const response = httpMocks.createResponse({ eventEmitter: EventEmitter });

  await new Promise((resolve, reject) => {
    response.on("end", resolve);
    response.on("error", reject);
    targetApp.handle(request, response, reject);
  });

  return response;
}

function createHeaders(contentType, setCookies = []) {
  return {
    get(name) {
      if (name.toLowerCase() === "content-type") {
        return contentType;
      }

      return null;
    },
    getSetCookie() {
      return setCookies;
    }
  };
}

function createJsonResponse(payload, { setCookies = [] } = {}) {
  return {
    ok: true,
    status: 200,
    headers: createHeaders("application/json", setCookies),
    async json() {
      return payload;
    }
  };
}

function createTextResponse(
  body,
  { status = 200, contentType = "text/plain", setCookies = [] } = {}
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: createHeaders(contentType, setCookies),
    async text() {
      return body;
    },
    async json() {
      return JSON.parse(body);
    }
  };
}

describe("SPA route refresh", () => {
  test.each(["/", "/search", "/works/42", "/help", "/themes"])(
    "GET %s returns the ARTCTL shell",
    async (url) => {
      const response = await makeRequest(url);

      expect(response.statusCode).toBe(200);
      expect(response._getData()).toContain('<div id="root"></div>');
    }
  );
});

describe("work detail API", () => {
  test("GET /api/works/:objectId returns a normalized ARTCTL work shape", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.endsWith("/objects/436121")) {
          return createJsonResponse({
            objectID: 436121,
            title: "The Great Wave off Kanagawa",
            artistDisplayName: "",
            culture: "Japanese",
            objectDate: "ca. 1830-32",
            objectName: "Print",
            medium: "Polychrome woodblock print; ink and color on paper",
            primaryImage: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg",
            objectURL: "https://www.metmuseum.org/art/collection/search/45434"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const detailApp = createArtctlApp({ metClient });

    const response = await makeRequest("/api/works/436121", detailApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      objectId: 436121,
      title: "The Great Wave off Kanagawa",
      artist: "Japanese",
      date: "ca. 1830-32",
      context: "Print - Polychrome woodblock print; ink and color on paper",
      imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
      metUrl: "https://www.metmuseum.org/art/collection/search/45434"
    });
  });

  test("GET /api/works/:objectId falls back to primaryImageSmall when needed", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.endsWith("/objects/437984")) {
          return createJsonResponse({
            objectID: 437984,
            title: "Study of a Horse",
            artistDisplayName: "Théodore Géricault",
            culture: "",
            objectDate: "1820",
            objectName: "Drawing",
            medium: "Graphite on paper",
            primaryImage: "",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/dp/web-large/DT1567.jpg",
            objectURL: "https://www.metmuseum.org/art/collection/search/437984"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const detailApp = createArtctlApp({ metClient });

    const response = await makeRequest("/api/works/437984", detailApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData()).imageUrl).toBe(
      "https://images.metmuseum.org/CRDImages/dp/web-large/DT1567.jpg"
    );
  });

  test("GET /api/works/:objectId returns metadata even when the Met API has no image fields", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.endsWith("/objects/486055")) {
          return createJsonResponse({
            objectID: 486055,
            title: "Galisteo Creek",
            artistDisplayName: "Gustave Baumann",
            culture: "",
            objectDate: "1920",
            objectName: "Color woodcut",
            medium: "Ink and color on paper",
            primaryImage: "",
            primaryImageSmall: "",
            objectURL: "https://www.metmuseum.org/art/collection/search/486055"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const detailApp = createArtctlApp({ metClient });

    const response = await makeRequest("/api/works/486055", detailApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      objectId: 486055,
      title: "Galisteo Creek",
      artist: "Gustave Baumann",
      date: "1920",
      context: "Color woodcut - Ink and color on paper",
      imageUrl: "",
      metUrl: "https://www.metmuseum.org/art/collection/search/486055"
    });
  });

  test("GET /api/works/:objectId retries once after an upstream cookie challenge", async () => {
    const challengeCookies = [
      "visid_incap_1662004=test-visitor; Path=/; Domain=.metmuseum.org",
      "incap_ses_1813_1662004=test-session; Path=/; Domain=.metmuseum.org"
    ];
    const requests = [];
    const metClient = createMetApiClient({
      async fetchImpl(resource, init = {}) {
        const url = String(resource);
        requests.push({ url, cookie: init.headers?.cookie ?? "" });

        if (url.endsWith("/objects/436121") && requests.length === 1) {
          return createTextResponse("<html>blocked</html>", {
            status: 403,
            contentType: "text/html",
            setCookies: challengeCookies
          });
        }

        if (url.endsWith("/objects/436121")) {
          return createJsonResponse({
            objectID: 436121,
            title: "The Great Wave off Kanagawa",
            artistDisplayName: "",
            culture: "Japanese",
            objectDate: "ca. 1830-32",
            objectName: "Print",
            medium: "Polychrome woodblock print; ink and color on paper",
            primaryImage: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg",
            objectURL: "https://www.metmuseum.org/art/collection/search/45434"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const detailApp = createArtctlApp({ metClient });

    const response = await makeRequest("/api/works/436121", detailApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData()).objectId).toBe(436121);
    expect(requests).toEqual([
      {
        url: "https://collectionapi.metmuseum.org/public/collection/v1/objects/436121",
        cookie: ""
      },
      {
        url: "https://collectionapi.metmuseum.org/public/collection/v1/objects/436121",
        cookie: "visid_incap_1662004=test-visitor; incap_ses_1813_1662004=test-session"
      }
    ]);
  });
});

describe("search API", () => {
  test("GET /api/search/departments returns Met department options", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.endsWith("/departments")) {
          return createJsonResponse({
            departments: [
              { departmentId: 11, displayName: "European Paintings" },
              { departmentId: 6, displayName: "Arms and Armor" }
            ]
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const searchApp = createArtctlApp({ metClient });

    const response = await makeRequest("/api/search/departments", searchApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      departments: [
        { departmentId: 11, displayName: "European Paintings" },
        { departmentId: 6, displayName: "Arms and Armor" }
      ]
    });
  });

  test("GET /api/search returns a JSON error when the Met upstream responds with HTML", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.includes("/search?")) {
          return createTextResponse("<html>blocked</html>", {
            status: 403,
            contentType: "text/html"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const searchApp = createArtctlApp({ metClient });

    const response = await makeRequest("/api/search?q=sunflowers", searchApp);

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response._getData())).toEqual({
      error: "Met API returned a non-JSON search response."
    });
  });

  test("GET /api/search reuses cached results for the same query", async () => {
    const requests = [];
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);
        requests.push(url);

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 1,
            objectIDs: [436524]
          });
        }

        if (url.endsWith("/objects/436524")) {
          return createJsonResponse({
            objectID: 436524,
            title: "Sunflowers",
            artistDisplayName: "Vincent van Gogh",
            culture: "",
            objectDate: "1887",
            primaryImage: "",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DP130155.jpg"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const searchApp = createArtctlApp({ metClient });

    const firstResponse = await makeRequest("/api/search?q=van%20gogh", searchApp);
    const secondResponse = await makeRequest("/api/search?q=van%20gogh", searchApp);

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(JSON.parse(secondResponse._getData())).toEqual({
      query: "van gogh",
      results: [
        {
          objectId: 436524,
          title: "Sunflowers",
          artist: "Vincent van Gogh",
          date: "1887",
          imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DP130155.jpg",
          isPublicDomain: false,
          hasImage: true
        }
      ]
    });
    expect(requests).toHaveLength(2);
  });

  test("GET /api/search filters results by the curated medium value", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 2,
            objectIDs: [436524, 486055]
          });
        }

        if (url.endsWith("/objects/436524")) {
          return createJsonResponse({
            objectID: 436524,
            title: "Sunflowers",
            artistDisplayName: "Vincent van Gogh",
            culture: "",
            objectDate: "1887",
            medium: "Oil on canvas",
            primaryImage: "",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg"
          });
        }

        if (url.endsWith("/objects/486055")) {
          return createJsonResponse({
            objectID: 486055,
            title: "Under the Wave off Kanagawa",
            artistDisplayName: "Katsushika Hokusai",
            culture: "",
            objectDate: "1830-32",
            medium: "Polychrome woodblock print; ink and color on paper",
            primaryImage: "",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const searchApp = createArtctlApp({ metClient });

    const response = await makeRequest("/api/search?q=wave&medium=wood", searchApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      query: "wave",
      results: [
        {
          objectId: 486055,
          title: "Under the Wave off Kanagawa",
          artist: "Katsushika Hokusai",
          date: "1830-32",
          imageUrl: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg",
          isPublicDomain: false,
          hasImage: true
        }
      ]
    });
  });

  test("GET /api/search backfills invalid hydrated objects to keep a full page", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 15,
            objectIDs: Array.from({ length: 15 }, (_, index) => index + 1)
          });
        }

        const objectId = Number(url.split("/").at(-1));

        if ([2, 5, 11].includes(objectId)) {
          return createJsonResponse({
            objectID: objectId,
            title: "",
            artistDisplayName: `Artist ${objectId}`,
            culture: "",
            objectDate: "1900",
            primaryImage: "",
            primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
          });
        }

        return createJsonResponse({
          objectID: objectId,
          title: `Work ${objectId}`,
          artistDisplayName: `Artist ${objectId}`,
          culture: "",
          objectDate: "1900",
          primaryImage: "",
          primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
        });
      }
    });
    const searchApp = createArtctlApp({ metClient });

    const response = await makeRequest("/api/search?q=works&page=1", searchApp);
    const payload = JSON.parse(response._getData());

    expect(response.statusCode).toBe(200);
    expect(payload.results).toHaveLength(12);
    expect(payload.results.map((result) => result.objectId)).toEqual([
      1, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15
    ]);
  });

  test("GET /api/search returns explicit public-domain and image-availability flags", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 2,
            objectIDs: [436524, 486055]
          });
        }

        if (url.endsWith("/objects/436524")) {
          return createJsonResponse({
            objectID: 436524,
            title: "Sunflowers",
            artistDisplayName: "Vincent van Gogh",
            culture: "",
            objectDate: "1887",
            isPublicDomain: true,
            primaryImage: "https://images.metmuseum.org/CRDImages/ep/original/DT1567.jpg",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg"
          });
        }

        if (url.endsWith("/objects/486055")) {
          return createJsonResponse({
            objectID: 486055,
            title: "Galisteo Creek",
            artistDisplayName: "Susan Rothenberg",
            culture: "",
            objectDate: "1992",
            isPublicDomain: false,
            primaryImage: "",
            primaryImageSmall: ""
          });
        }

        throw new Error(`Unexpected Met API request: ${url}`);
      }
    });
    const searchApp = createArtctlApp({ metClient });

    const response = await makeRequest("/api/search?q=van%20gogh", searchApp);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData())).toEqual({
      query: "van gogh",
      results: [
        {
          objectId: 436524,
          title: "Sunflowers",
          artist: "Vincent van Gogh",
          date: "1887",
          imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg",
          isPublicDomain: true,
          hasImage: true
        },
        {
          objectId: 486055,
          title: "Galisteo Creek",
          artist: "Susan Rothenberg",
          date: "1992",
          imageUrl: "",
          isPublicDomain: false,
          hasImage: false
        }
      ]
    });
  });
});

describe("gallery API", () => {
  test("GET /api/gallery uses highlight search to build a deterministic gallery batch", async () => {
    const requests = [];
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);
        requests.push(url);

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 4,
            objectIDs: [500, 475, 498, 490]
          });
        }

        const objectId = Number(url.split("/").at(-1));

        return createJsonResponse({
          objectID: objectId,
          title: `Work ${objectId}`,
          artistDisplayName: `Artist ${objectId}`,
          culture: "",
          isHighlight: true,
          isPublicDomain: true,
          primaryImage: "",
          primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
        });
      }
    });
    const galleryApp = createArtctlApp({ metClient });

    const response = await makeRequest("/api/gallery", galleryApp);
    const searchRequest = new URL(requests[0]);

    expect(response.statusCode).toBe(200);
    expect(searchRequest.pathname).toBe("/public/collection/v1/search");
    expect(searchRequest.searchParams.get("isHighlight")).toBe("true");
    expect(searchRequest.searchParams.get("hasImages")).toBe("true");
    expect(searchRequest.searchParams.get("q")).toBe("*");
    expect(JSON.parse(response._getData()).results).toHaveLength(4);
    expect(JSON.parse(response._getData()).results[0]).toEqual({
      objectId: 475,
      title: "Work 475",
      artist: "Artist 475",
      imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/475.jpg"
    });
    expect(JSON.parse(response._getData()).results.at(-1).objectId).toBe(500);
  });

  test("GET /api/gallery skips individual object fetch failures while building the first batch", async () => {
    const metClient = createMetApiClient({
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 26,
            objectIDs: Array.from({ length: 26 }, (_, index) => 500 - index)
          });
        }

        const objectId = Number(url.split("/").at(-1));

        if (objectId === 490) {
          throw new Error("socket hang up");
        }

        return createJsonResponse({
          objectID: objectId,
          title: `Work ${objectId}`,
          artistDisplayName: `Artist ${objectId}`,
          culture: "",
          isHighlight: true,
          isPublicDomain: true,
          primaryImage: "",
          primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
        });
      }
    });
    const galleryApp = createArtctlApp({ metClient });

    const response = await makeRequest("/api/gallery", galleryApp);
    const results = JSON.parse(response._getData()).results;

    expect(response.statusCode).toBe(200);
    expect(results).toHaveLength(24);
    expect(results.some((work) => work.objectId === 490)).toBe(false);
    expect(results.at(-1).objectId).toBe(499);
  });

  test("GET /api/gallery reuses challenge cookies across the upstream fanout", async () => {
    const challengeCookies = [
      "visid_incap_1662004=test-visitor; Path=/; Domain=.metmuseum.org",
      "incap_ses_1813_1662004=test-session; Path=/; Domain=.metmuseum.org"
    ];
    const requests = [];
    const metClient = createMetApiClient({
      async fetchImpl(resource, init = {}) {
        const url = String(resource);
        requests.push({ url, cookie: init.headers?.cookie ?? "" });

        if (url.includes("/search?") && requests.length === 1) {
          return createTextResponse("<html>blocked</html>", {
            status: 403,
            contentType: "text/html",
            setCookies: challengeCookies
          });
        }

        if (url.includes("/search?")) {
          return createJsonResponse({
            total: 24,
            objectIDs: Array.from({ length: 24 }, (_, index) => index + 1)
          });
        }

        const objectId = Number(url.split("/").at(-1));

        return createJsonResponse({
          objectID: objectId,
          title: `Work ${objectId}`,
          artistDisplayName: `Artist ${objectId}`,
          culture: "",
          isHighlight: true,
          isPublicDomain: true,
          primaryImage: "",
          primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
        });
      }
    });
    const galleryApp = createArtctlApp({ metClient });

    const response = await makeRequest("/api/gallery", galleryApp);
    const objectRequestCookies = requests
      .filter(({ url }) => /\/objects\/\d+$/.test(url))
      .map(({ cookie }) => cookie);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response._getData()).results).toHaveLength(24);
    expect(requests.slice(0, 2)).toEqual([
      {
        url: "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&q=*",
        cookie: ""
      },
      {
        url: "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isHighlight=true&q=*",
        cookie: "visid_incap_1662004=test-visitor; incap_ses_1813_1662004=test-session"
      }
    ]);
    expect(objectRequestCookies.every(Boolean)).toBe(true);
  });

  test("GET /api/gallery serves the last cached gallery page when a later upstream request times out", async () => {
    const stableGalleryIds = [475, 490, 498];
    let galleryFetches = 0;
    const metClient = createMetApiClient({
      cacheTtlMs: 0,
      requestTimeoutMs: 5,
      async fetchImpl(resource) {
        const url = String(resource);

        if (url.includes("/search?")) {
          galleryFetches += 1;

          if (galleryFetches === 1) {
            return createJsonResponse({
              total: stableGalleryIds.length,
              objectIDs: stableGalleryIds
            });
          }

          return new Promise(() => {});
        }

        const objectId = Number(url.split("/").at(-1));

        return createJsonResponse({
          objectID: objectId,
          title: `Work ${objectId}`,
          artistDisplayName: `Artist ${objectId}`,
          culture: "",
          isHighlight: true,
          isPublicDomain: true,
          primaryImage: "",
          primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
        });
      }
    });
    const galleryApp = createArtctlApp({ metClient });

    const firstResponse = await makeRequest("/api/gallery", galleryApp);
    const secondResponse = await makeRequest("/api/gallery", galleryApp);

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(JSON.parse(secondResponse._getData())).toEqual(JSON.parse(firstResponse._getData()));
    expect(galleryFetches).toBe(3);
  });
});
