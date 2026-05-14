import { describe, expect, test } from "vitest";
import { createInMemoryCatalog } from "../server/catalog.js";

describe("in-memory catalog", () => {
  test("searchCollection returns normalized local catalog results", async () => {
    const catalog = createInMemoryCatalog({
      records: [
        {
          objectID: 436524,
          title: "Sunflowers",
          artistDisplayName: "Vincent van Gogh",
          culture: "",
          objectDate: "1887",
          department: "European Paintings",
          medium: "Oil on canvas",
          primaryImage: "",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg",
          isPublicDomain: true
        }
      ]
    });

    await expect(catalog.searchCollection({ query: "sunflowers" })).resolves.toEqual({
      query: "sunflowers",
      totalResults: 1,
      results: [
        {
          objectId: 436524,
          title: "Sunflowers",
          artist: "Vincent van Gogh",
          date: "1887",
          department: "European Paintings",
          imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg",
          isPublicDomain: true,
          hasImage: true
        }
      ]
    });
  });

  test("searchCollection filters matching results by the curated medium value", async () => {
    const catalog = createInMemoryCatalog({
      records: [
        {
          objectID: 436524,
          title: "Work 1",
          artistDisplayName: "Vincent van Gogh",
          culture: "",
          objectDate: "1887",
          objectName: "Painting",
          medium: "Oil on canvas",
          primaryImage: "",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg",
          isPublicDomain: true
        },
        {
          objectID: 36483,
          title: "Work 2",
          artistDisplayName: "Katsushika Hokusai",
          culture: "",
          objectDate: "1830-32",
          objectName: "Print",
          medium: "Polychrome woodblock print; ink and color on paper",
          primaryImage: "",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg",
          isPublicDomain: true
        }
      ]
    });

    await expect(catalog.searchCollection({ query: "work", medium: "wood" })).resolves.toEqual({
      query: "work",
      totalResults: 1,
      results: [
        {
          objectId: 36483,
          title: "Work 2",
          artist: "Katsushika Hokusai",
          date: "1830-32",
          department: "",
          imageUrl: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg",
          isPublicDomain: true,
          hasImage: true
        }
      ]
    });
  });

  test("searchCollection filters matching results by departmentId", async () => {
    const catalog = createInMemoryCatalog({
      records: [
        {
          objectID: 436524,
          title: "Work 1",
          artistDisplayName: "Vincent van Gogh",
          culture: "",
          objectDate: "1887",
          departmentId: 11,
          department: "European Paintings",
          primaryImage: "",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg",
          isPublicDomain: true
        },
        {
          objectID: 36483,
          title: "Work 2",
          artistDisplayName: "Katsushika Hokusai",
          culture: "",
          objectDate: "1830-32",
          departmentId: 6,
          department: "Arms and Armor",
          primaryImage: "",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg",
          isPublicDomain: true
        }
      ]
    });

    await expect(catalog.searchCollection({ query: "work", departmentId: 11 })).resolves.toEqual({
      query: "work",
      totalResults: 1,
      results: [
        {
          objectId: 436524,
          title: "Work 1",
          artist: "Vincent van Gogh",
          date: "1887",
          department: "European Paintings",
          imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg",
          isPublicDomain: true,
          hasImage: true
        }
      ]
    });
  });

  test("searchCollection hides restricted works by default", async () => {
    const catalog = createInMemoryCatalog({
      records: [
        {
          objectID: 436524,
          title: "Open Work",
          artistDisplayName: "Vincent van Gogh",
          culture: "",
          objectDate: "1887",
          primaryImage: "",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg",
          isPublicDomain: true
        },
        {
          objectID: 486055,
          title: "Restricted Work",
          artistDisplayName: "Susan Rothenberg",
          culture: "",
          objectDate: "1992",
          primaryImage: "",
          primaryImageSmall: "",
          isPublicDomain: false,
          hydrationStatus: "no_image"
        }
      ]
    });

    await expect(catalog.searchCollection({ query: "work" })).resolves.toEqual({
      query: "work",
      totalResults: 1,
      results: [
        {
          objectId: 436524,
          title: "Open Work",
          artist: "Vincent van Gogh",
          date: "1887",
          department: "",
          imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg",
          isPublicDomain: true,
          hasImage: true
        }
      ]
    });
  });

  test("searchCollection can include restricted works when explicitly requested", async () => {
    const catalog = createInMemoryCatalog({
      records: [
        {
          objectID: 436524,
          title: "Open Work",
          artistDisplayName: "Vincent van Gogh",
          culture: "",
          objectDate: "1887",
          primaryImage: "",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg",
          isPublicDomain: true
        },
        {
          objectID: 486055,
          title: "Restricted Work",
          artistDisplayName: "Susan Rothenberg",
          culture: "",
          objectDate: "1992",
          primaryImage: "",
          primaryImageSmall: "",
          isPublicDomain: false,
          hydrationStatus: "no_image"
        }
      ]
    });

    await expect(
      catalog.searchCollection({ query: "work", excludeRestricted: false })
    ).resolves.toEqual({
      query: "work",
      totalResults: 2,
      results: [
        {
          objectId: 436524,
          title: "Open Work",
          artist: "Vincent van Gogh",
          date: "1887",
          department: "",
          imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1567.jpg",
          isPublicDomain: true,
          hasImage: true,
          hydrationStatus: ""
        },
        {
          objectId: 486055,
          title: "Restricted Work",
          artist: "Susan Rothenberg",
          date: "1992",
          department: "",
          imageUrl: "",
          isPublicDomain: false,
          hasImage: false,
          hydrationStatus: "no_image"
        }
      ]
    });
  });

  test("searchCollection returns the next stable page of matching results", async () => {
    const catalog = createInMemoryCatalog({
      records: Array.from({ length: 13 }, (_, index) => {
        const objectId = index + 1;

        return {
          objectID: objectId,
          title: `Work ${objectId}`,
          artistDisplayName: `Artist ${objectId}`,
          culture: "",
          objectDate: "1900",
          primaryImage: "",
          primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`,
          isPublicDomain: true
        };
      })
    });

    await expect(catalog.searchCollection({ query: "work", page: 2 })).resolves.toEqual({
      query: "work",
      totalResults: 13,
      results: [
        {
          objectId: 13,
          title: "Work 13",
          artist: "Artist 13",
          date: "1900",
          department: "",
          imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/13.jpg",
          isPublicDomain: true,
          hasImage: true
        }
      ]
    });
  });

  test("getWork returns a normalized work detail for a matching object", async () => {
    const catalog = createInMemoryCatalog({
      records: [
        {
          objectID: 436121,
          title: "The Great Wave off Kanagawa",
          artistDisplayName: "",
          culture: "Japanese",
          objectDate: "ca. 1830-32",
          objectName: "Print",
          medium: "Polychrome woodblock print; ink and color on paper",
          dimensions: "25.7 x 37.9 cm",
          primaryImage: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
          primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg",
          objectURL: "https://www.metmuseum.org/art/collection/search/45434",
          isPublicDomain: true
        }
      ]
    });

    await expect(catalog.getWork(436121)).resolves.toEqual({
      objectId: 436121,
      title: "The Great Wave off Kanagawa",
      artist: "Japanese",
      date: "ca. 1830-32",
      context: "Print - Polychrome woodblock print; ink and color on paper",
      dimensions: "25.7 x 37.9 cm",
      imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg",
      metUrl: "https://www.metmuseum.org/art/collection/search/45434",
      isPublicDomain: true
    });
  });

  test("getDepartments returns distinct department options from the local catalog", async () => {
    const catalog = createInMemoryCatalog({
      records: [
        {
          objectID: 1,
          title: "Work 1",
          departmentId: 11,
          department: "European Paintings"
        },
        {
          objectID: 2,
          title: "Work 2",
          departmentId: 6,
          department: "Arms and Armor"
        },
        {
          objectID: 3,
          title: "Work 3",
          departmentId: 11,
          department: "European Paintings"
        }
      ]
    });

    await expect(catalog.getDepartments()).resolves.toEqual({
      departments: [
        { departmentId: 6, displayName: "Arms and Armor" },
        { departmentId: 11, displayName: "European Paintings" }
      ]
    });
  });

  test("getGalleryPage returns an explicit empty state when no curated groups are configured", async () => {
    const catalog = createInMemoryCatalog();

    await expect(catalog.getGalleryPage()).resolves.toEqual({
      results: [],
      emptyState: {
        title: "Gallery coming soon",
        message: "Curated groups have not been configured yet."
      }
    });
  });
});
