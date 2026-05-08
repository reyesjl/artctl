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

function createJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    async json() {
      return payload;
    }
  };
}

function createTextResponse(body, { status = 200, contentType = "text/plain" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
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
});

describe("search API", () => {
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
