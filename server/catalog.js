import { createSqliteCatalog } from "./catalog-sqlite.js";

const searchPageSize = 12;
const defaultCatalogNotReadyBody = {
  error: "Catalog is not initialized.",
  scope: "catalog",
  code: "CATALOG_NOT_INITIALIZED"
};
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

function normalizePositiveInteger(value, defaultValue = 1) {
  const parsedValue = Number.parseInt(value ?? "", 10);

  return Number.isNaN(parsedValue) || parsedValue < 1 ? defaultValue : parsedValue;
}

function normalizeExcludeRestricted(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalizedValue = String(value ?? "").trim().toLowerCase();

  if (["false", "0", "off", "no"].includes(normalizedValue)) {
    return false;
  }

  return true;
}

function normalizeSearchState(input) {
  if (typeof input === "string") {
    return {
      query: input.trim(),
      departmentId: null,
      medium: "",
      page: 1,
      excludeRestricted: true
    };
  }

  return {
    query: input?.query?.trim() ?? "",
    departmentId:
      input?.departmentId == null ? null : normalizePositiveInteger(input.departmentId, null),
    medium: input?.medium?.trim() ?? "",
    page: normalizePositiveInteger(input?.page),
    excludeRestricted: normalizeExcludeRestricted(input?.excludeRestricted)
  };
}

function normalizeArtist(record) {
  return record.artistDisplayName || record.culture || "Unknown";
}

function normalizeDate(record) {
  return record.objectDate || "Date unknown";
}

function deriveCuratedGroupSlug(name) {
  return String(name ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSearchResult(record) {
  const imageUrl = record.primaryImageSmall || record.primaryImage || "";
  const hydrationStatus = String(record.hydrationStatus ?? "").trim();

  return {
    objectId: record.objectID,
    title: record.title,
    artist: normalizeArtist(record),
    date: normalizeDate(record),
    department: record.department ?? "",
    imageUrl,
    isPublicDomain: Boolean(record.isPublicDomain),
    hasImage: Boolean(imageUrl),
    ...(hydrationStatus && hydrationStatus !== "pending" ? { hydrationStatus } : {})
  };
}

function normalizeContext(record) {
  const parts = [record.objectName, record.medium]
    .map((value) => value?.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);

  return parts.join(" - ") || "Object context unavailable";
}

function normalizeWorkDetail(record) {
  const hydrationStatus = String(record.hydrationStatus ?? "").trim();

  return {
    objectId: record.objectID,
    title: record.title,
    artist: normalizeArtist(record),
    date: normalizeDate(record),
    context: normalizeContext(record),
    dimensions: String(record.dimensions ?? "").trim(),
    imageUrl: record.primaryImage || record.primaryImageSmall || "",
    metUrl: record.objectURL || `https://www.metmuseum.org/art/collection/search/${record.objectID}`,
    isPublicDomain: Boolean(record.isPublicDomain),
    ...(hydrationStatus ? { hydrationStatus } : {})
  };
}

function matchesCuratedMedium(record, medium) {
  if (!medium) {
    return true;
  }

  const keywords = curatedMediumMatchers[medium] ?? [medium];
  const haystack = [record.medium, record.objectName]
    .map((value) => value?.toLowerCase() ?? "")
    .join(" ");

  return keywords.some((keyword) => haystack.includes(keyword));
}

export function createUninitializedCatalog(readiness = defaultCatalogNotReadyBody) {
  return {
    isReady() {
      return false;
    },

    getReadiness() {
      return readiness;
    }
  };
}

export function createRuntimeCatalog({ records = null, curatedGroups = [], databasePath = null } = {}) {
  if (!records || records.length === 0) {
    return createSqliteCatalog({
      databasePath,
      curatedGroups,
      searchPageSize,
      createUninitializedCatalog,
      normalizeSearchState,
      normalizeSearchResult,
      normalizeWorkDetail,
      matchesCuratedMedium
    });
  }

  return createInMemoryCatalog({ records, curatedGroups });
}

export function createInMemoryCatalog({ records = [], curatedGroups = [] } = {}) {
  return {
    isReady() {
      return true;
    },

    async searchCollection(searchState) {
      const normalizedSearchState = normalizeSearchState(searchState);
      const query = normalizedSearchState.query.toLowerCase();
      const filteredRecords = records.filter((record) => {
        const haystack = [record.title, record.artistDisplayName, record.culture]
          .map((value) => value?.toLowerCase() ?? "")
          .join(" ");
        const matchesDepartment =
          normalizedSearchState.departmentId == null ||
          record.departmentId === normalizedSearchState.departmentId;

      return (
          haystack.includes(query) &&
          matchesDepartment &&
          (!normalizedSearchState.excludeRestricted || record.isPublicDomain !== false) &&
          matchesCuratedMedium(record, normalizedSearchState.medium)
        );
      });
      const pageStart = (normalizedSearchState.page - 1) * searchPageSize;

      return {
        query: normalizedSearchState.query,
        totalResults: filteredRecords.length,
        results: filteredRecords.slice(pageStart, pageStart + searchPageSize).map(normalizeSearchResult)
      };
    },

    async getDepartments() {
      const departments = new Map();

      for (const record of records) {
        if (!record.department || record.departmentId == null) {
          continue;
        }

        if (!departments.has(record.departmentId)) {
          departments.set(record.departmentId, {
            departmentId: record.departmentId,
            displayName: record.department
          });
        }
      }

      return {
        departments: Array.from(departments.values()).sort((left, right) =>
          left.displayName.localeCompare(right.displayName)
        )
      };
    },

    async getGalleryPage() {
      if (curatedGroups.length === 0) {
        return {
          results: [],
          emptyState: {
            title: "Gallery coming soon",
            message: "Curated groups have not been configured yet."
          }
        };
      }

      return {
        results: curatedGroups
      };
    },

    async getAdminGallery() {
      return {
        results: []
      };
    },

    async getAdminCuratedGroups() {
      return {
        results: [
          {
            slug: "homepage",
            name: "Homepage Gallery",
            objectCount: 0,
            isHomepageFeatured: true
          }
        ]
      };
    },

    async createAdminCuratedGroup({ name }) {
      if (name === "Homepage Gallery") {
        return {
          error: "Curated group name already exists."
        };
      }

      return {
        slug: deriveCuratedGroupSlug(name),
        name,
        objectCount: 0
      };
    },

    async updateAdminCuratedGroup(groupSlug, { name }) {
      if (groupSlug === "homepage") {
        return {
          error: "Homepage Gallery cannot be edited."
        };
      }

      return {
        slug: deriveCuratedGroupSlug(name),
        name,
        objectCount: 0,
        isHomepageFeatured: false
      };
    },

    async featureAdminCuratedGroup(groupSlug) {
      return {
        slug: groupSlug,
        name: groupSlug,
        objectCount: 0,
        isHomepageFeatured: true
      };
    },

    async deleteAdminCuratedGroup(groupSlug) {
      if (groupSlug === "homepage") {
        return {
          error: "Homepage Gallery cannot be deleted."
        };
      }

      return true;
    },

    async addAdminGalleryItem() {
      return null;
    },

    async removeAdminGalleryItem() {
      return false;
    },

    async moveAdminGalleryItemUp() {
      return null;
    },

    async reorderAdminGalleryItem() {
      return {
        results: []
      };
    },

    async getWork(objectId) {
      const record = records.find((candidate) => candidate.objectID === objectId);

      if (!record) {
        return null;
      }

      return normalizeWorkDetail(record);
    },

    async getRandomWork({ excludeObjectIds = [] } = {}) {
      const excludedObjectIds = new Set(excludeObjectIds);
      const eligibleRecords = records.filter(
        (record) => record.isPublicDomain !== false && !excludedObjectIds.has(record.objectID)
      );

      if (eligibleRecords.length === 0) {
        return null;
      }

      const randomIndex = Math.floor(Math.random() * eligibleRecords.length);
      return normalizeWorkDetail(eligibleRecords[randomIndex]);
    }
  };
}
