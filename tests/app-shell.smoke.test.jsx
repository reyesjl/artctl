import { EventEmitter } from "node:events";
import { beforeEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import httpMocks from "node-mocks-http";
import { App } from "../src/App.jsx";
import { createArtctlApp } from "../server/app.js";

const defaultMetClient = {
  async getDepartments() {
    return { departments: [] };
  },

  async getGalleryPage() {
    return { results: [] };
  },

  async searchCollection(query) {
    return { query, results: [] };
  },

  async getWork() {
    return null;
  }
};

function createFetchImpl({ requestLog = [], metClient = defaultMetClient } = {}) {
  const apiApp = createArtctlApp({ metClient });

  return async function fetchImpl(resource) {
    const url = new URL(resource, "http://artctl.test");
    requestLog.push(url.pathname + url.search);

    const request = httpMocks.createRequest({
      method: "GET",
      url: url.pathname,
      query: Object.fromEntries(url.searchParams.entries())
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
  };
}

const fetchImpl = createFetchImpl();
const storage = new Map();

function installLocalStorage() {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
      clear() {
        storage.clear();
      }
    }
  });
}

beforeEach(() => {
  cleanup();
  installLocalStorage();
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

test("homepage loads the persistent app shell from the Express backend", async () => {
  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByText("ARTCTL", { selector: ".brand" })).toBeInTheDocument();
  expect(screen.queryByText("[ARTCTL]")).not.toBeInTheDocument();
  expect(screen.queryByText("Met collection terminal viewer")).not.toBeInTheDocument();
  expect(document.documentElement.dataset.theme).toBe("dark-green");
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

  expect(await screen.findByText("ARTCTL", { selector: ".brand" })).toBeInTheDocument();
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

test("homepage renders highlighted Met works from Express as gallery links", async () => {
  const requests = [];
  const metClient = {
    async getGalleryPage() {
      return {
        results: [
          {
            objectId: 436121,
            title: "The Great Wave off Kanagawa",
            artist: "Japanese",
            imageUrl: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"
          },
          {
            objectId: 436524,
            title: "Sunflowers",
            artist: "Vincent van Gogh",
            imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg"
          }
        ]
      };
    }
  };

  render(<App fetchImpl={createFetchImpl({ requestLog: requests, metClient })} />);

  expect(await screen.findByText(/The Met's highlighted works/i)).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: /The Great Wave off Kanagawa/i })).toHaveAttribute(
    "href",
    "/works/436121"
  );
  expect(screen.getByRole("link", { name: /Sunflowers/i })).toHaveAttribute(
    "href",
    "/works/436524"
  );
  expect(requests).toContain("/api/gallery");
});

test("homepage shows a friendly message when Express cannot load the Met gallery", async () => {
  const metClient = {
    async getGalleryPage() {
      throw new Error("Met API returned a non-JSON gallery response.");
    }
  };

  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(
    await screen.findByText("The Met gallery is temporarily unavailable. Please try again.")
  ).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Sunflowers/i })).not.toBeInTheDocument();
});

test("search route shows an empty state before any query is submitted", async () => {
  const requests = [];
  window.history.pushState({}, "", "/search");

  render(<App fetchImpl={createFetchImpl({ requestLog: requests })} />);

  expect(await screen.findByRole("heading", { name: "Search" })).toBeInTheDocument();
  expect(screen.getByText("Enter a search to find works.")).toBeInTheDocument();
  expect(requests).toEqual(["/api/app-shell", "/api/search/departments"]);
});

test("search route loads Department filter options from Express", async () => {
  const metClient = {
    async getDepartments() {
      return {
        departments: [
          { departmentId: 11, displayName: "European Paintings" },
          { departmentId: 6, displayName: "Arms and Armor" }
        ]
      };
    },

    async searchCollection(searchState) {
      return { query: searchState.query, results: [] };
    }
  };

  window.history.pushState({}, "", "/search");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(await screen.findByLabelText("Department")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "All departments" })).toBeInTheDocument();
  expect(await screen.findByRole("option", { name: "European Paintings" })).toHaveValue("11");
  expect(await screen.findByRole("option", { name: "Arms and Armor" })).toHaveValue("6");
});

test("submitting search with Department and Medium filters preserves the search state", async () => {
  let receivedSearchState = null;
  const metClient = {
    async getDepartments() {
      return {
        departments: [{ departmentId: 11, displayName: "European Paintings" }]
      };
    },

    async searchCollection(searchState) {
      receivedSearchState = searchState;

      return {
        query: searchState.query,
        results: [
          {
            objectId: 436121,
            title: "Landscape Study",
            artist: "Artist",
            date: "1900"
          }
        ]
      };
    }
  };

  window.history.pushState({}, "", "/search");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  fireEvent.change(await screen.findByLabelText("Query"), {
    target: { value: "landscape" }
  });
  fireEvent.change(await screen.findByLabelText("Department"), {
    target: { value: "11" }
  });
  fireEvent.change(screen.getByLabelText("Medium"), {
    target: { value: "wood" }
  });
  fireEvent.click(screen.getByRole("button", { name: "[search]" }));

  expect(await screen.findByRole("link", { name: "Landscape Study" })).toHaveAttribute(
    "href",
    "/works/436121"
  );
  expect(window.location.search).toBe("?q=landscape&departmentId=11&medium=wood");
  expect(receivedSearchState).toEqual({
    query: "landscape",
    departmentId: 11,
    medium: "wood",
    page: 1
  });
});

test("search results support explicit next-page navigation", async () => {
  const metClient = {
    async getDepartments() {
      return { departments: [] };
    },

    async searchCollection(searchState) {
      if (searchState.page === 2) {
        return {
          query: searchState.query,
          results: [
            {
              objectId: 13,
              title: "Work 13",
              artist: "Artist 13",
              date: "1900"
            }
          ]
        };
      }

      return {
        query: searchState.query,
        results: Array.from({ length: 12 }, (_, index) => ({
          objectId: index + 1,
          title: `Work ${index + 1}`,
          artist: `Artist ${index + 1}`,
          date: "1900"
        }))
      };
    }
  };

  window.history.pushState({}, "", "/search?q=landscape");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(await screen.findByRole("link", { name: "Work 1" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));

  expect(await screen.findByRole("link", { name: "Work 13" })).toHaveAttribute(
    "href",
    "/works/13"
  );
  expect(window.location.search).toBe("?q=landscape&page=2");
});

test("submitting a valid query fetches search results through Express and renders work links", async () => {
  const requests = [];
  const metClient = {
    async searchCollection(query) {
      return {
        query,
        results: [
          {
            objectId: 436524,
            title: "Sunflowers",
            artist: "Vincent van Gogh",
            date: "1887"
          }
        ]
      };
    }
  };

  window.history.pushState({}, "", "/search");
  render(<App fetchImpl={createFetchImpl({ requestLog: requests, metClient })} />);

  fireEvent.change(await screen.findByLabelText("Query"), {
    target: { value: "sunflowers" }
  });
  fireEvent.click(screen.getByRole("button", { name: "[search]" }));

  expect(await screen.findByRole("link", { name: "Sunflowers" })).toHaveAttribute(
    "href",
    "/works/436524"
  );
  expect(window.location.search).toBe("?q=sunflowers");
  expect(requests).toContain("/api/search?q=sunflowers");
});

test("submitting a whitespace-only query keeps the search route in its empty state", async () => {
  const requests = [];

  window.history.pushState({}, "", "/search");
  render(<App fetchImpl={createFetchImpl({ requestLog: requests })} />);

  fireEvent.change(await screen.findByLabelText("Query"), {
    target: { value: "   " }
  });
  fireEvent.click(screen.getByRole("button", { name: "[search]" }));

  expect(screen.getByText("Enter a search to find works.")).toBeInTheDocument();
  expect(window.location.search).toBe("");
  expect(requests).toEqual(["/api/app-shell", "/api/search/departments"]);
});

test("loading a populated search URL restores the same search state end to end", async () => {
  const requests = [];
  let receivedSearchState = null;
  const metClient = {
    async searchCollection(searchState) {
      receivedSearchState = searchState;

      return {
        query: searchState.query,
        results: [
          {
            objectId: 437329,
            title: "The Harvesters",
            artist: "Pieter Bruegel the Elder",
            date: "1565"
          }
        ]
      };
    }
  };

  window.history.pushState(
    {},
    "",
    "/search?q=harvesters&departmentId=11&medium=paintings&page=2"
  );
  render(<App fetchImpl={createFetchImpl({ requestLog: requests, metClient })} />);

  expect(await screen.findByDisplayValue("harvesters")).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "The Harvesters" })).toHaveAttribute(
    "href",
    "/works/437329"
  );
  expect(requests).toContain("/api/search?q=harvesters&departmentId=11&medium=paintings&page=2");
  expect(receivedSearchState).toEqual({
    query: "harvesters",
    departmentId: 11,
    medium: "paintings",
    page: 2
  });
});

test("search results show inline availability markers for rights and image status", async () => {
  const metClient = {
    async searchCollection(query) {
      return {
        query,
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
      };
    }
  };

  window.history.pushState({}, "", "/search?q=van%20gogh");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(await screen.findByRole("link", { name: "Sunflowers" })).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "Galisteo Creek" })).toBeInTheDocument();
  expect(screen.getByText("Rights Restricted")).toBeInTheDocument();
  expect(screen.getByText("No Image Available")).toBeInTheDocument();
});

test("search route shows an error message when Express cannot load Met results", async () => {
  const metClient = {
    async searchCollection() {
      throw new Error("Met API returned a non-JSON search response.");
    }
  };

  window.history.pushState({}, "", "/search?q=sunflowers");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(await screen.findByDisplayValue("sunflowers")).toBeInTheDocument();
  expect(
    await screen.findByText("Met API returned a non-JSON search response.")
  ).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Sunflowers" })).not.toBeInTheDocument();
});

test("direct entry to a work route loads detail through Express and renders the work title", async () => {
  const requests = [];
  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "The Great Wave off Kanagawa",
        artist: "Japanese",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434"
      };
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(<App fetchImpl={createFetchImpl({ requestLog: requests, metClient })} />);

  expect(
    await screen.findByRole("heading", { name: "The Great Wave off Kanagawa" })
  ).toBeInTheDocument();
  expect(requests).toContain("/api/works/436121");
});

test("work viewer renders the preferred image and compact metadata with a Met link", async () => {
  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "The Great Wave off Kanagawa",
        artist: "Japanese",
        date: "ca. 1830-32",
        context: "Print - Polychrome woodblock print; ink and color on paper",
        imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
        metUrl: "https://www.metmuseum.org/art/collection/search/45434"
      };
    }
  };

  window.history.pushState({}, "", "/works/436121");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(
    await screen.findByRole("img", { name: "The Great Wave off Kanagawa" })
  ).toHaveAttribute("src", "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg");
  expect(screen.getByText("Japanese")).toBeInTheDocument();
  expect(screen.getByText("ca. 1830-32")).toBeInTheDocument();
  expect(
    screen.getByText("Print - Polychrome woodblock print; ink and color on paper")
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View on the Met" })).toHaveAttribute(
    "href",
    "https://www.metmuseum.org/art/collection/search/45434"
  );
});

test("work viewer shows metadata when the Met API has no image for the object", async () => {
  const metClient = {
    async getWork(objectId) {
      return {
        objectId,
        title: "Galisteo Creek",
        artist: "Gustave Baumann",
        date: "1920",
        context: "Color woodcut - Ink and color on paper",
        imageUrl: "",
        metUrl: "https://www.metmuseum.org/art/collection/search/486055"
      };
    }
  };

  window.history.pushState({}, "", "/works/486055");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(await screen.findByRole("heading", { name: "Galisteo Creek" })).toBeInTheDocument();
  expect(screen.getByText("Image unavailable through the Met API.")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "Galisteo Creek" })).not.toBeInTheDocument();
  expect(screen.getByText("Gustave Baumann")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View on the Met" })).toHaveAttribute(
    "href",
    "https://www.metmuseum.org/art/collection/search/486055"
  );
});

test("work viewer shows a not found message when Express cannot load the object", async () => {
  const metClient = {
    async getWork() {
      return null;
    }
  };

  window.history.pushState({}, "", "/works/999999");
  render(<App fetchImpl={createFetchImpl({ metClient })} />);

  expect(await screen.findByRole("heading", { name: "Work 999999" })).toBeInTheDocument();
  expect(await screen.findByText("Work not found.")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

test("help route presents the current ARTCTL product copy", async () => {
  window.history.pushState({}, "", "/help");

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("heading", { name: "Help" })).toBeInTheDocument();
  expect(screen.getByText("ARTCTL", { selector: ".help-page-manual" })).toBeInTheDocument();
  expect(screen.getByText("Public-domain artwork explorer")).toBeInTheDocument();
  expect(screen.getByText("── Gallery ──")).toBeInTheDocument();
  expect(
    screen.getByText(/browse highlighted public-domain artworks in a quiet, minimal interface/i)
  ).toBeInTheDocument();
  expect(screen.getByText(/sunflowers · armor · monet · ukiyo-e · cats/i)).toBeInTheDocument();
  expect(screen.getByText("── Search ──")).toBeInTheDocument();
  expect(
    screen.getByText(/search across artists, titles, cultures, materials, periods/i)
  ).toBeInTheDocument();
  expect(screen.getByText("── Help ──")).toBeInTheDocument();
  expect(
    screen.getByText(/artctl is designed as a lightweight artwork browser inspired by terminal systems/i)
  ).toBeInTheDocument();
  expect(screen.getByText("── Themes ──")).toBeInTheDocument();
  expect(
    screen.getByText(/your selected theme persists across gallery, search, help, and artwork views/i)
  ).toBeInTheDocument();
  expect(screen.getByText("── Collection Source ──")).toBeInTheDocument();
  expect(
    screen.getByText(/the current collection source is the metropolitan museum open access api/i)
  ).toBeInTheDocument();
});

test("themes route matches the Cortex-style theme picker structure and active state", async () => {
  window.history.pushState({}, "", "/themes");

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("heading", { name: "Themes" })).toBeInTheDocument();
  expect(screen.getByText("── theme ──")).toBeInTheDocument();
  expect(screen.getByText("Choose a color theme. Your selection is saved locally.")).toBeInTheDocument();
  expect(screen.getByText("theme is stored in browser localStorage")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Green" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Light" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Blue" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Purple" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Red" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Orange" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Cyan" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Pink" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Windows 95" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Windows XP" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "CRT Amber" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Solarized" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sepia" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Dark Green" })).toHaveTextContent("✓");
  expect(screen.getAllByText("✓")).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "Solarized" }));

  expect(document.documentElement.dataset.theme).toBe("solarized");
  expect(screen.getByRole("button", { name: "Solarized" })).toHaveTextContent("✓");
  expect(screen.getAllByText("✓")).toHaveLength(1);
});

test("activating a Cortex theme applies the original Cortex token values", async () => {
  window.history.pushState({}, "", "/themes");

  render(<App fetchImpl={fetchImpl} />);

  fireEvent.click(await screen.findByRole("button", { name: "Solarized" }));

  expect(document.documentElement.style.getPropertyValue("--background")).toBe("192 81% 9%");
  expect(document.documentElement.style.getPropertyValue("--primary")).toBe("68 100% 30%");
  expect(document.documentElement.style.getPropertyValue("--border")).toBe("192 50% 22%");
});

test("choosing a theme stores the preference locally in the browser", async () => {
  window.history.pushState({}, "", "/themes");

  render(<App fetchImpl={fetchImpl} />);

  fireEvent.click(await screen.findByRole("button", { name: "Dark Cyan" }));

  expect(window.localStorage.getItem("artctl-theme")).toBe("dark-cyan");
});

test("app startup restores the previously chosen theme from browser storage", async () => {
  window.localStorage.setItem("artctl-theme", "crt-amber");
  window.history.pushState({}, "", "/help");

  render(<App fetchImpl={fetchImpl} />);

  expect(await screen.findByRole("heading", { name: "Help" })).toBeInTheDocument();
  expect(document.documentElement.dataset.theme).toBe("crt-amber");
});

test("the active theme remains applied when navigating to another route", async () => {
  window.history.pushState({}, "", "/themes");

  render(<App fetchImpl={fetchImpl} />);

  fireEvent.click(await screen.findByRole("button", { name: "Windows XP" }));
  fireEvent.click(screen.getByRole("link", { name: "[help]" }));

  expect(await screen.findByRole("heading", { name: "Help" })).toBeInTheDocument();
  expect(document.documentElement.dataset.theme).toBe("windows-xp");
});
