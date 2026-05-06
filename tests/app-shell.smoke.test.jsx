import { EventEmitter } from "node:events";
import { beforeEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import httpMocks from "node-mocks-http";
import { App } from "../src/App.jsx";
import { createArtctlApp } from "../server/app.js";

const apiApp = createArtctlApp();

beforeEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

async function fetchImpl(resource) {
  const url = new URL(resource, "http://artctl.test");
  const request = httpMocks.createRequest({
    method: "GET",
    url: url.pathname
  });
  const response = httpMocks.createResponse({ eventEmitter: EventEmitter });

  await new Promise((resolve, reject) => {
    response.on("end", resolve);
    response.on("error", reject);
    apiApp.handle(request, response, reject);
  });

  return {
    ok: response.statusCode >= 200 && response.statusCode < 300,
    status: response.statusCode,
    async json() {
      return JSON.parse(response._getData());
    }
  };
}

test("homepage loads the persistent app shell from the Express backend", async () => {
  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByText("ARTCTL")).toBeInTheDocument();
  expect(screen.queryByText("[ARTCTL]")).not.toBeInTheDocument();
  expect(screen.queryByText("Met collection terminal viewer")).not.toBeInTheDocument();
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(screen.getByRole("link", { name: "[gallery]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[search]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[help]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[themes]" })).toBeInTheDocument();
});

test.each([
  { route: "/", heading: "Gallery" },
  { route: "/search", heading: "Search" },
  { route: "/works/42", heading: "Work 42" },
  { route: "/help", heading: "Help" },
  { route: "/themes", heading: "Themes" }
])("route $route renders its skeleton inside the shared shell", async ({ route, heading }) => {
  window.history.pushState({}, "", route);

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByText("ARTCTL")).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[gallery]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[search]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[help]" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "[themes]" })).toBeInTheDocument();
});

test("current route marks only the active nav link", async () => {
  window.history.pushState({}, "", "/search");

  render(<App fetchImpl={fetchImpl} />);

  const galleryLink = await screen.findByRole("link", { name: "[gallery]" });
  const searchLink = screen.getByRole("link", { name: "[search]" });

  expect(searchLink).toHaveClass("active");
  expect(galleryLink).not.toHaveClass("active");
});
