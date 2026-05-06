import { EventEmitter } from "node:events";
import { describe, expect, test } from "vitest";
import httpMocks from "node-mocks-http";
import { createArtctlApp } from "../server/app.js";

const app = createArtctlApp();

async function makeRequest(url) {
  const request = httpMocks.createRequest({
    method: "GET",
    url
  });
  const response = httpMocks.createResponse({ eventEmitter: EventEmitter });

  await new Promise((resolve, reject) => {
    response.on("end", resolve);
    response.on("error", reject);
    app.handle(request, response, reject);
  });

  return response;
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
