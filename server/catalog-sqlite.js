import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const catalogObjectColumns = [
  ["objectNumber", "object_number", "TEXT NOT NULL"],
  ["isHighlight", "is_highlight", "INTEGER NOT NULL"],
  ["isTimelineWork", "is_timeline_work", "INTEGER NOT NULL"],
  ["isPublicDomain", "is_public_domain", "INTEGER NOT NULL"],
  ["objectID", "object_id", "INTEGER PRIMARY KEY"],
  ["galleryNumber", "gallery_number", "TEXT NOT NULL"],
  ["department", "department", "TEXT NOT NULL"],
  ["accessionYear", "accession_year", "TEXT NOT NULL"],
  ["objectName", "object_name", "TEXT NOT NULL"],
  ["title", "title", "TEXT NOT NULL"],
  ["culture", "culture", "TEXT NOT NULL"],
  ["period", "period", "TEXT NOT NULL"],
  ["dynasty", "dynasty", "TEXT NOT NULL"],
  ["reign", "reign", "TEXT NOT NULL"],
  ["portfolio", "portfolio", "TEXT NOT NULL"],
  ["constituentID", "constituent_id", "INTEGER"],
  ["artistRole", "artist_role", "TEXT NOT NULL"],
  ["artistPrefix", "artist_prefix", "TEXT NOT NULL"],
  ["artistDisplayName", "artist_display_name", "TEXT NOT NULL"],
  ["artistDisplayBio", "artist_display_bio", "TEXT NOT NULL"],
  ["artistSuffix", "artist_suffix", "TEXT NOT NULL"],
  ["artistAlphaSort", "artist_alpha_sort", "TEXT NOT NULL"],
  ["artistNationality", "artist_nationality", "TEXT NOT NULL"],
  ["artistBeginDate", "artist_begin_date", "TEXT NOT NULL"],
  ["artistEndDate", "artist_end_date", "TEXT NOT NULL"],
  ["artistGender", "artist_gender", "TEXT NOT NULL"],
  ["artistULANURL", "artist_ulan_url", "TEXT NOT NULL"],
  ["artistWikidataURL", "artist_wikidata_url", "TEXT NOT NULL"],
  ["objectDate", "object_date", "TEXT NOT NULL"],
  ["objectBeginDate", "object_begin_date", "INTEGER"],
  ["objectEndDate", "object_end_date", "INTEGER"],
  ["medium", "medium", "TEXT NOT NULL"],
  ["dimensions", "dimensions", "TEXT NOT NULL"],
  ["creditLine", "credit_line", "TEXT NOT NULL"],
  ["geographyType", "geography_type", "TEXT NOT NULL"],
  ["city", "city", "TEXT NOT NULL"],
  ["state", "state", "TEXT NOT NULL"],
  ["county", "county", "TEXT NOT NULL"],
  ["country", "country", "TEXT NOT NULL"],
  ["region", "region", "TEXT NOT NULL"],
  ["subregion", "subregion", "TEXT NOT NULL"],
  ["locale", "locale", "TEXT NOT NULL"],
  ["locus", "locus", "TEXT NOT NULL"],
  ["excavation", "excavation", "TEXT NOT NULL"],
  ["river", "river", "TEXT NOT NULL"],
  ["classification", "classification", "TEXT NOT NULL"],
  ["rightsAndReproduction", "rights_and_reproduction", "TEXT NOT NULL"],
  ["objectURL", "object_url", "TEXT NOT NULL"],
  ["objectWikidataURL", "object_wikidata_url", "TEXT NOT NULL"],
  ["metadataDate", "metadata_date", "TEXT NOT NULL"],
  ["repository", "repository", "TEXT NOT NULL"],
  ["tags", "tags", "TEXT NOT NULL"],
  ["tagsAATURL", "tags_aat_url", "TEXT NOT NULL"],
  ["tagsWikidataURL", "tags_wikidata_url", "TEXT NOT NULL"],
  ["departmentId", "department_id", "INTEGER"],
  ["primaryImage", "primary_image", "TEXT NOT NULL"],
  ["primaryImageSmall", "primary_image_small", "TEXT NOT NULL"],
  ["hydrationStatus", "hydration_status", "TEXT NOT NULL"],
  ["hydrationError", "hydration_error", "TEXT NOT NULL"],
  ["hydratedAt", "hydrated_at", "TEXT NOT NULL"]
];

const objectColumnNames = catalogObjectColumns.map(([, columnName]) => columnName);
const objectValueKeys = catalogObjectColumns.map(([recordKey]) => recordKey);
const objectPlaceholderNames = objectColumnNames.map(() => "?").join(", ");
const catalogObjectSchemaSql = `
  CREATE TABLE IF NOT EXISTS objects (
    ${catalogObjectColumns.map(([, columnName, columnType]) => `${columnName} ${columnType}`).join(",\n    ")}
  );
`;
const catalogObjectFtsSchemaSql = `
  CREATE VIRTUAL TABLE IF NOT EXISTS objects_fts USING fts5(
    object_id UNINDEXED,
    title,
    artist_display_name,
    culture
  );
`;
const curatedGalleryItemSchemaSql = `
  CREATE TABLE IF NOT EXISTS curated_gallery_items (
    position INTEGER NOT NULL,
    object_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    image_url TEXT NOT NULL,
    FOREIGN KEY (object_id) REFERENCES objects(object_id)
  );
`;
const curatedGroupSchemaSql = `
  CREATE TABLE IF NOT EXISTS curated_groups (
    group_id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_homepage_featured INTEGER NOT NULL DEFAULT 0
  );
`;
const curatedGroupObjectSchemaSql = `
  CREATE TABLE IF NOT EXISTS curated_group_objects (
    group_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    object_id INTEGER NOT NULL,
    PRIMARY KEY (group_id, object_id),
    FOREIGN KEY (group_id) REFERENCES curated_groups(group_id),
    FOREIGN KEY (object_id) REFERENCES objects(object_id)
  );
`;
const catalogRecordProjectionSql = `
  objects.object_id AS objectID,
  objects.title AS title,
  objects.artist_display_name AS artistDisplayName,
  objects.culture AS culture,
  objects.object_date AS objectDate,
  objects.department AS department,
  objects.medium AS medium,
  objects.object_name AS objectName,
  objects.primary_image AS primaryImage,
  objects.primary_image_small AS primaryImageSmall,
  objects.is_public_domain AS isPublicDomain,
  objects.object_url AS objectURL,
  objects.department_id AS departmentId
`;
const defaultCuratedGalleryBatchSize = 24;
const defaultHomepageCuratedGroupSlug = "homepage";
const defaultHomepageCuratedGroupName = "Homepage Gallery";

function normalizeCuratedGroupSlug(groupSlug) {
  const normalizedGroupSlug = String(groupSlug ?? "").trim();
  return normalizedGroupSlug || defaultHomepageCuratedGroupSlug;
}

function deriveCuratedGroupSlug(name) {
  return String(name ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function withDatabase(databasePath, work) {
  const database = new DatabaseSync(databasePath);

  try {
    return work(database);
  } finally {
    database.close();
  }
}

function normalizeSqliteValue(value) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return value;
}

function normalizeFtsQuery(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .map((term) => term.replaceAll('"', '""'))
    .filter(Boolean)
    .map((term) => `"${term}"`)
    .join(" AND ");
}

function normalizeGalleryArtist(record) {
  return record.artistDisplayName || record.culture || "Unknown";
}

function buildAdminGalleryItemSelectSql(whereClause = "") {
  return `
    SELECT
      curated_group_objects.position AS position,
      objects.object_id AS objectId,
      objects.title AS title,
      CASE
        WHEN objects.artist_display_name <> '' THEN objects.artist_display_name
        WHEN objects.culture <> '' THEN objects.culture
        ELSE 'Unknown'
      END AS artist,
      CASE
        WHEN objects.primary_image_small <> '' THEN objects.primary_image_small
        ELSE objects.primary_image
      END AS imageUrl,
      objects.hydration_status AS hydrationStatus
    FROM curated_group_objects
    JOIN curated_groups ON curated_groups.group_id = curated_group_objects.group_id
    JOIN objects ON objects.object_id = curated_group_objects.object_id
    WHERE curated_groups.slug = ?
    ${whereClause}
    ORDER BY curated_group_objects.position
  `;
}

export function buildCuratedGalleryItem(record) {
  return {
    objectId: record.objectID,
    title: record.title,
    artist: normalizeGalleryArtist(record),
    imageUrl: record.primaryImageSmall || record.primaryImage
  };
}

function hasObjectRows(database) {
  const objectsTable = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'objects'"
    )
    .get();

  if (!objectsTable) {
    return false;
  }

  const result = database.prepare("SELECT COUNT(*) AS count FROM objects").get();
  return Number(result?.count ?? 0) > 0;
}

export function initializeCatalogSqlite(databasePath) {
  withDatabase(databasePath, (database) => {
    database.exec(catalogObjectSchemaSql);
    database.exec(catalogObjectFtsSchemaSql);
    database.exec(curatedGalleryItemSchemaSql);
    database.exec(curatedGroupSchemaSql);
    database.exec(curatedGroupObjectSchemaSql);
    const curatedGroupColumns = database.prepare("PRAGMA table_info(curated_groups)").all();
    if (!curatedGroupColumns.some((column) => column.name === "is_homepage_featured")) {
      database.exec(
        "ALTER TABLE curated_groups ADD COLUMN is_homepage_featured INTEGER NOT NULL DEFAULT 0"
      );
    }
    ensureHomepageCuratedGroup(database);
  });
}

export function persistCatalogRecordsToSqlite({
  databasePath,
  records,
  curatedGalleryItems = []
}) {
  const writer = createCatalogSqliteBulkWriter(databasePath);

  try {
    for (const record of records) {
      writer.writeRecord(record);
    }

    writer.commit(curatedGalleryItems);
  } catch (error) {
    writer.rollback();
    throw error;
  }
}

export function createCatalogSqliteBulkWriter(databasePath) {
  const database = new DatabaseSync(databasePath);
  let isClosed = false;
  let isFinished = false;

  database.exec(catalogObjectSchemaSql);
  database.exec(catalogObjectFtsSchemaSql);
  database.exec(curatedGalleryItemSchemaSql);
  database.exec(curatedGroupSchemaSql);
  database.exec(curatedGroupObjectSchemaSql);

  const insertStatement = database.prepare(`
    INSERT OR REPLACE INTO objects (${objectColumnNames.join(", ")})
    VALUES (${objectPlaceholderNames})
  `);
  const insertFtsStatement = database.prepare(`
    INSERT INTO objects_fts (object_id, title, artist_display_name, culture)
    VALUES (?, ?, ?, ?)
  `);
  const insertCuratedGalleryItemStatement = database.prepare(`
    INSERT INTO curated_gallery_items (position, object_id, title, artist, image_url)
    VALUES (?, ?, ?, ?, ?)
  `);

  database.exec("BEGIN");
  database.exec("DELETE FROM curated_gallery_items");
  database.exec("DELETE FROM curated_group_objects");
  database.exec("DELETE FROM curated_groups");
  database.exec("DELETE FROM objects");
  database.exec("DELETE FROM objects_fts");
  ensureHomepageCuratedGroup(database);

  function closeDatabase() {
    if (!isClosed) {
      database.close();
      isClosed = true;
    }
  }

  return {
    writeRecord(record) {
      if (isFinished) {
        throw new Error("SQLite bulk writer has already finished.");
      }

      insertStatement.run(...objectValueKeys.map((key) => normalizeSqliteValue(record[key])));
      insertFtsStatement.run(
        record.objectID,
        record.title,
        record.artistDisplayName,
        record.culture
      );
    },

    commit(curatedGalleryItems = []) {
      if (isFinished) {
        throw new Error("SQLite bulk writer has already finished.");
      }

      curatedGalleryItems.forEach((item, index) => {
        insertCuratedGalleryItemStatement.run(
          index + 1,
          item.objectId,
          item.title,
          item.artist,
          item.imageUrl
        );
      });

      database.exec("COMMIT");
      isFinished = true;
      closeDatabase();
    },

    rollback() {
      if (isFinished) {
        closeDatabase();
        return;
      }

      database.exec("ROLLBACK");
      isFinished = true;
      closeDatabase();
    }
  };
}

function ensureHomepageCuratedGroup(database) {
  database
    .prepare(
      `
        INSERT OR IGNORE INTO curated_groups (slug, name, is_homepage_featured)
        VALUES (?, ?, 1)
      `
    )
    .run(defaultHomepageCuratedGroupSlug, defaultHomepageCuratedGroupName);

  const featuredCount =
    Number(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM curated_groups WHERE is_homepage_featured = 1"
        )
        .get()?.count ?? 0
    ) || 0;

  if (featuredCount === 0) {
    database
      .prepare("UPDATE curated_groups SET is_homepage_featured = 1 WHERE slug = ?")
      .run(defaultHomepageCuratedGroupSlug);
  }

  return Number(
    database
      .prepare("SELECT group_id AS groupId FROM curated_groups WHERE slug = ?")
      .get(defaultHomepageCuratedGroupSlug)?.groupId ?? 0
  );
}

function migrateLegacyCuratedGalleryItems(database) {
  const homepageGroupId = ensureHomepageCuratedGroup(database);
  const existingGroupRows =
    Number(
      database
        .prepare("SELECT COUNT(*) AS count FROM curated_group_objects WHERE group_id = ?")
        .get(homepageGroupId)?.count ?? 0
    ) > 0;

  if (existingGroupRows) {
    return homepageGroupId;
  }

  const legacyTable = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'curated_gallery_items'"
    )
    .get();

  if (!legacyTable) {
    return homepageGroupId;
  }

  const legacyRows = database
    .prepare(
      `
        SELECT object_id AS objectId, position
        FROM curated_gallery_items
        ORDER BY position
      `
    )
    .all();

  for (const row of legacyRows) {
    database
      .prepare(
        `
          INSERT OR IGNORE INTO curated_group_objects (group_id, position, object_id)
          VALUES (?, ?, ?)
        `
      )
      .run(homepageGroupId, row.position, row.objectId);
  }

  return homepageGroupId;
}

function getCuratedGroupId(database, groupSlug = defaultHomepageCuratedGroupSlug) {
  return Number(
    database
      .prepare("SELECT group_id AS groupId FROM curated_groups WHERE slug = ?")
      .get(normalizeCuratedGroupSlug(groupSlug))?.groupId ?? 0
  );
}

function getHomepageFeaturedCuratedGroupSlug(database) {
  return (
    database
      .prepare(
        `
          SELECT slug
          FROM curated_groups
          WHERE is_homepage_featured = 1
          ORDER BY group_id
          LIMIT 1
        `
      )
      .get()?.slug ?? defaultHomepageCuratedGroupSlug
  );
}

function mapCuratedGroupRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    isHomepageFeatured: Boolean(row.isHomepageFeatured)
  };
}

function selectCuratedGroupBySlug(database, slug) {
  return mapCuratedGroupRow(
    database
      .prepare(
        `
          SELECT
            curated_groups.slug AS slug,
            curated_groups.name AS name,
            COUNT(curated_group_objects.object_id) AS objectCount,
            MAX(curated_groups.is_homepage_featured) AS isHomepageFeatured
          FROM curated_groups
          LEFT JOIN curated_group_objects
            ON curated_group_objects.group_id = curated_groups.group_id
          WHERE curated_groups.slug = ?
          GROUP BY curated_groups.group_id, curated_groups.slug, curated_groups.name
        `
      )
      .get(slug)
  );
}

export function createSqliteCatalog({
  databasePath,
  curatedGroups = [],
  searchPageSize,
  createUninitializedCatalog,
  normalizeSearchState,
  normalizeSearchResult,
  normalizeWorkDetail,
  matchesCuratedMedium
}) {
  if (!databasePath || !existsSync(databasePath)) {
    return createUninitializedCatalog();
  }

  try {
    initializeCatalogSqlite(databasePath);
  } catch {
    return createUninitializedCatalog();
  }

  try {
    const isReady = withDatabase(databasePath, (database) => hasObjectRows(database));

    if (!isReady) {
      return createUninitializedCatalog();
    }
  } catch {
    return createUninitializedCatalog();
  }

  return {
    isReady() {
      return true;
    },

    async searchCollection(searchState) {
      const normalizedSearch = normalizeSearchState(searchState);
      const ftsQuery = normalizeFtsQuery(normalizedSearch.query);
      const departmentClause =
        normalizedSearch.departmentId == null ? "" : "AND department_id = ?";
      const rows = withDatabase(databasePath, (database) =>
        database
          .prepare(
            `
              SELECT ${catalogRecordProjectionSql}
              FROM objects
              JOIN objects_fts ON objects_fts.object_id = objects.object_id
              WHERE objects_fts MATCH ?
              ${departmentClause}
              ORDER BY objects.object_id
            `
          )
          .all(
            ...(normalizedSearch.departmentId == null
              ? [ftsQuery]
              : [ftsQuery, normalizedSearch.departmentId])
          )
      );
      const filteredRows = rows.filter((record) =>
        matchesCuratedMedium(record, normalizedSearch.medium)
      );
      const pageStart = (normalizedSearch.page - 1) * searchPageSize;

      return {
        query: normalizedSearch.query,
        results: filteredRows
          .slice(pageStart, pageStart + searchPageSize)
          .map(normalizeSearchResult)
      };
    },

    async getDepartments() {
      const rows = withDatabase(databasePath, (database) =>
        database
          .prepare(
            `
              SELECT department_id AS departmentId, department AS displayName
              FROM objects
              WHERE department_id IS NOT NULL AND department <> ''
              GROUP BY department_id, department
              ORDER BY displayName
            `
          )
          .all()
      );

      return { departments: rows };
    },

    async getGalleryPage() {
      const rows = withDatabase(databasePath, (database) =>
        {
          migrateLegacyCuratedGalleryItems(database);
          const homepageGroupSlug = getHomepageFeaturedCuratedGroupSlug(database);

          return database
            .prepare(
              `
                SELECT
                  objects.object_id AS objectId,
                  objects.title AS title,
                  CASE
                    WHEN objects.artist_display_name <> '' THEN objects.artist_display_name
                    WHEN objects.culture <> '' THEN objects.culture
                    ELSE 'Unknown'
                  END AS artist,
                  CASE
                    WHEN objects.primary_image_small <> '' THEN objects.primary_image_small
                    ELSE objects.primary_image
                  END AS imageUrl
                FROM curated_group_objects
                JOIN curated_groups ON curated_groups.group_id = curated_group_objects.group_id
                JOIN objects ON objects.object_id = curated_group_objects.object_id
                WHERE curated_groups.slug = ?
                  AND (objects.primary_image_small <> '' OR objects.primary_image <> '')
                ORDER BY curated_group_objects.position
                LIMIT ?
              `
            )
            .all(homepageGroupSlug, defaultCuratedGalleryBatchSize);
        }
      );

      if (rows.length === 0) {
        return {
          results: [],
          emptyState: {
            title: "Gallery coming soon",
            message: "Curated groups have not been configured yet."
          }
        };
      }

      return { results: rows };
    },

    async getAdminGallery({ groupSlug = defaultHomepageCuratedGroupSlug } = {}) {
      const rows = withDatabase(databasePath, (database) =>
        {
          migrateLegacyCuratedGalleryItems(database);
          return database
            .prepare(buildAdminGalleryItemSelectSql())
            .all(normalizeCuratedGroupSlug(groupSlug));
        }
      );

      return { results: rows };
    },

    async getAdminCuratedGroups() {
      const rows = withDatabase(databasePath, (database) => {
        migrateLegacyCuratedGalleryItems(database);

        return database
          .prepare(
            `
              SELECT
                curated_groups.slug AS slug,
                curated_groups.name AS name,
                COUNT(curated_group_objects.object_id) AS objectCount,
                MAX(curated_groups.is_homepage_featured) AS isHomepageFeatured
              FROM curated_groups
              LEFT JOIN curated_group_objects
                ON curated_group_objects.group_id = curated_groups.group_id
              GROUP BY curated_groups.group_id, curated_groups.slug, curated_groups.name
              ORDER BY curated_groups.name
            `
          )
          .all();
      });

      return { results: rows.map(mapCuratedGroupRow) };
    },

    async createAdminCuratedGroup({ name }) {
      return withDatabase(databasePath, (database) => {
        migrateLegacyCuratedGalleryItems(database);
        const slug = deriveCuratedGroupSlug(name);

        const existingName = database
          .prepare(
            `
              SELECT slug
              FROM curated_groups
              WHERE name = ?
            `
          )
          .get(name);

        if (existingName) {
          return {
            error: "Curated group name already exists."
          };
        }

        if (!slug) {
          return {
            error: "Curated group name is required."
          };
        }

        database
          .prepare(
            `
              INSERT INTO curated_groups (slug, name)
              VALUES (?, ?)
            `
          )
          .run(slug, name);

        return selectCuratedGroupBySlug(database, slug);
      });
    },

    async updateAdminCuratedGroup(groupSlug, { name }) {
      return withDatabase(databasePath, (database) => {
        migrateLegacyCuratedGalleryItems(database);
        const currentSlug = normalizeCuratedGroupSlug(groupSlug);

        if (currentSlug === defaultHomepageCuratedGroupSlug) {
          return {
            error: "Homepage Gallery cannot be edited."
          };
        }

        const groupId = getCuratedGroupId(database, currentSlug);

        if (groupId === 0) {
          return null;
        }

        const nextName = String(name ?? "").trim();
        const nextSlug = deriveCuratedGroupSlug(nextName);

        if (!nextName || !nextSlug) {
          return {
            error: "Curated group name is required."
          };
        }

        const existingName = database
          .prepare(
            `
              SELECT group_id AS groupId
              FROM curated_groups
              WHERE name = ? AND group_id <> ?
            `
          )
          .get(nextName, groupId);

        if (existingName) {
          return {
            error: "Curated group name already exists."
          };
        }

        database
          .prepare(
            `
              UPDATE curated_groups
              SET slug = ?, name = ?
              WHERE group_id = ?
            `
          )
          .run(nextSlug, nextName, groupId);

        return selectCuratedGroupBySlug(database, nextSlug);
      });
    },

    async featureAdminCuratedGroup(groupSlug) {
      return withDatabase(databasePath, (database) => {
        migrateLegacyCuratedGalleryItems(database);
        const normalizedGroupSlug = normalizeCuratedGroupSlug(groupSlug);
        const groupId = getCuratedGroupId(database, normalizedGroupSlug);

        if (groupId === 0) {
          return null;
        }

        database.exec("BEGIN");

        try {
          database.prepare("UPDATE curated_groups SET is_homepage_featured = 0").run();
          database
            .prepare("UPDATE curated_groups SET is_homepage_featured = 1 WHERE group_id = ?")
            .run(groupId);
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }

        return mapCuratedGroupRow(
          database
          .prepare(
            `
              SELECT
                curated_groups.slug AS slug,
                curated_groups.name AS name,
                COUNT(curated_group_objects.object_id) AS objectCount,
                MAX(curated_groups.is_homepage_featured) AS isHomepageFeatured
              FROM curated_groups
              LEFT JOIN curated_group_objects
                ON curated_group_objects.group_id = curated_groups.group_id
              WHERE curated_groups.group_id = ?
              GROUP BY curated_groups.group_id, curated_groups.slug, curated_groups.name
            `
          )
          .get(groupId)
        );
      });
    },

    async deleteAdminCuratedGroup(groupSlug) {
      return withDatabase(databasePath, (database) => {
        migrateLegacyCuratedGalleryItems(database);
        const currentSlug = normalizeCuratedGroupSlug(groupSlug);

        if (currentSlug === defaultHomepageCuratedGroupSlug) {
          return {
            error: "Homepage Gallery cannot be deleted."
          };
        }

        const groupId = getCuratedGroupId(database, currentSlug);

        if (groupId === 0) {
          return false;
        }

        database.exec("BEGIN");

        try {
          database
            .prepare("DELETE FROM curated_group_objects WHERE group_id = ?")
            .run(groupId);
          database
            .prepare("DELETE FROM curated_groups WHERE group_id = ?")
            .run(groupId);
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }

        return true;
      });
    },

    async addAdminGalleryItem(objectId, { groupSlug = defaultHomepageCuratedGroupSlug } = {}) {
      return withDatabase(databasePath, (database) => {
        migrateLegacyCuratedGalleryItems(database);
        const normalizedGroupSlug = normalizeCuratedGroupSlug(groupSlug);
        const groupId = getCuratedGroupId(database, normalizedGroupSlug);

        if (groupId === 0) {
          return null;
        }

        const existing = database
          .prepare(`${buildAdminGalleryItemSelectSql("AND curated_group_objects.object_id = ?")}`)
          .get(normalizedGroupSlug, objectId);

        if (existing) {
          return existing;
        }

        const objectRow = database
          .prepare(
            `
              SELECT
                object_id AS objectId,
                title AS title,
                CASE
                  WHEN artist_display_name <> '' THEN artist_display_name
                  WHEN culture <> '' THEN culture
                  ELSE 'Unknown'
                END AS artist,
                CASE
                  WHEN primary_image_small <> '' THEN primary_image_small
                  ELSE primary_image
                END AS imageUrl
              FROM objects
              WHERE object_id = ?
            `
          )
          .get(objectId);

        if (!objectRow) {
          return null;
        }

        const nextPosition =
          Number(
            database
              .prepare(
                "SELECT COALESCE(MAX(position), 0) AS maxPosition FROM curated_group_objects WHERE group_id = ?"
              )
              .get(groupId)?.maxPosition ?? 0
          ) + 1;

        database
          .prepare(
            `
              INSERT INTO curated_group_objects (group_id, position, object_id)
              VALUES (?, ?, ?)
            `
          )
          .run(groupId, nextPosition, objectRow.objectId);

        return database
          .prepare(`${buildAdminGalleryItemSelectSql("AND curated_group_objects.object_id = ?")}`)
          .get(normalizedGroupSlug, objectId);
      });
    },

    async removeAdminGalleryItem(
      objectId,
      { groupSlug = defaultHomepageCuratedGroupSlug } = {}
    ) {
      return withDatabase(databasePath, (database) => {
        migrateLegacyCuratedGalleryItems(database);
        const groupId = getCuratedGroupId(database, groupSlug);

        if (groupId === 0) {
          return false;
        }

        const existing = database
          .prepare(
            `
              SELECT position
              FROM curated_group_objects
              WHERE group_id = ? AND object_id = ?
            `
          )
          .get(groupId, objectId);

        if (!existing) {
          return false;
        }

        database.exec("BEGIN");

        try {
          database
            .prepare("DELETE FROM curated_group_objects WHERE group_id = ? AND object_id = ?")
            .run(groupId, objectId);
          database
            .prepare(
              `
                UPDATE curated_group_objects
                SET position = position - 1
                WHERE group_id = ? AND position > ?
              `
            )
            .run(groupId, existing.position);
          database.exec("COMMIT");
          return true;
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
    },

    async moveAdminGalleryItemUp(
      objectId,
      { groupSlug = defaultHomepageCuratedGroupSlug } = {}
    ) {
      return withDatabase(databasePath, (database) => {
        migrateLegacyCuratedGalleryItems(database);
        const normalizedGroupSlug = normalizeCuratedGroupSlug(groupSlug);
        const groupId = getCuratedGroupId(database, normalizedGroupSlug);

        if (groupId === 0) {
          return null;
        }

        const existing = database
          .prepare(
            `
              SELECT position
              FROM curated_group_objects
              WHERE group_id = ? AND object_id = ?
            `
          )
          .get(groupId, objectId);

        if (!existing) {
          return null;
        }

        if (Number(existing.position) <= 1) {
          return database
            .prepare(`${buildAdminGalleryItemSelectSql("AND curated_group_objects.object_id = ?")}`)
            .get(normalizedGroupSlug, objectId);
        }

        const previous = database
          .prepare(
            `
              SELECT object_id AS objectId
              FROM curated_group_objects
              WHERE group_id = ? AND position = ?
            `
          )
          .get(groupId, Number(existing.position) - 1);

        if (!previous) {
          return database
            .prepare(`${buildAdminGalleryItemSelectSql("AND curated_group_objects.object_id = ?")}`)
            .get(normalizedGroupSlug, objectId);
        }

        database.exec("BEGIN");

        try {
          database
            .prepare("UPDATE curated_group_objects SET position = ? WHERE group_id = ? AND object_id = ?")
            .run(0, groupId, objectId);
          database
            .prepare("UPDATE curated_group_objects SET position = ? WHERE group_id = ? AND object_id = ?")
            .run(existing.position, groupId, previous.objectId);
          database
            .prepare("UPDATE curated_group_objects SET position = ? WHERE group_id = ? AND object_id = ?")
            .run(Number(existing.position) - 1, groupId, objectId);
          database.exec("COMMIT");

          return database
            .prepare(`${buildAdminGalleryItemSelectSql("AND curated_group_objects.object_id = ?")}`)
            .get(normalizedGroupSlug, objectId);
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
    },

    async reorderAdminGalleryItem(
      objectId,
      targetObjectId,
      { groupSlug = defaultHomepageCuratedGroupSlug } = {}
    ) {
      return withDatabase(databasePath, (database) => {
        migrateLegacyCuratedGalleryItems(database);
        const normalizedGroupSlug = normalizeCuratedGroupSlug(groupSlug);
        const groupId = getCuratedGroupId(database, normalizedGroupSlug);

        if (groupId === 0) {
          return null;
        }

        const rows = database
          .prepare(
            `
              SELECT object_id AS objectId
              FROM curated_group_objects
              WHERE group_id = ?
              ORDER BY position
            `
          )
          .all(groupId);
        const sourceIndex = rows.findIndex((row) => row.objectId === objectId);
        const targetIndex = rows.findIndex((row) => row.objectId === targetObjectId);

        if (sourceIndex === -1 || targetIndex === -1) {
          return null;
        }

        if (sourceIndex === targetIndex) {
          return {
            results: database.prepare(buildAdminGalleryItemSelectSql()).all(normalizedGroupSlug)
          };
        }

        const nextObjectIds = rows.map((row) => row.objectId);
        const [movedObjectId] = nextObjectIds.splice(sourceIndex, 1);
        const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        nextObjectIds.splice(insertIndex, 0, movedObjectId);

        database.exec("BEGIN");

        try {
          nextObjectIds.forEach((currentObjectId, index) => {
            database
              .prepare(
                "UPDATE curated_group_objects SET position = ? WHERE group_id = ? AND object_id = ?"
              )
              .run(index + 1, groupId, currentObjectId);
          });
          database.exec("COMMIT");

          return {
            results: database.prepare(buildAdminGalleryItemSelectSql()).all(normalizedGroupSlug)
          };
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
    },

    async getWork(objectId) {
      const row = withDatabase(databasePath, (database) =>
        database
          .prepare(
            `
              SELECT ${catalogRecordProjectionSql}
              FROM objects
              WHERE object_id = ?
            `
          )
          .get(objectId)
      );

      return row ? normalizeWorkDetail(row) : null;
    }
  };
}

export function listPendingHydrationObjectIds({
  databasePath,
  limit = 1,
  objectIds = null
}) {
  return withDatabase(databasePath, (database) => {
    if (Array.isArray(objectIds) && objectIds.length > 0) {
      const placeholders = objectIds.map(() => "?").join(", ");

      return database
        .prepare(
          `
            SELECT object_id AS objectId
            FROM objects
            WHERE object_id IN (${placeholders})
            ORDER BY object_id
          `
        )
        .all(...objectIds)
        .slice(0, limit)
        .map((row) => row.objectId);
    }

    return database
      .prepare(
        `
          SELECT object_id AS objectId
          FROM objects
          WHERE hydration_status = 'pending'
          ORDER BY object_id
          LIMIT ?
        `
      )
      .all(limit)
      .map((row) => row.objectId);
  });
}

export function updateObjectHydration({
  databasePath,
  objectId,
  hydrationStatus,
  hydrationError = "",
  hydratedAt,
  primaryImage = "",
  primaryImageSmall = ""
}) {
  withDatabase(databasePath, (database) => {
    database
      .prepare(
        `
          UPDATE objects
          SET
            primary_image = ?,
            primary_image_small = ?,
            hydration_status = ?,
            hydration_error = ?,
            hydrated_at = ?
          WHERE object_id = ?
        `
      )
      .run(
        primaryImage,
        primaryImageSmall,
        hydrationStatus,
        hydrationError,
        hydratedAt,
        objectId
      );
  });
}

export function getObjectHydrationState({ databasePath, objectId }) {
  return withDatabase(databasePath, (database) => {
    const row = database
      .prepare(
        `
          SELECT
            object_id AS objectId,
            primary_image AS primaryImage,
            primary_image_small AS primaryImageSmall,
            hydration_status AS hydrationStatus,
            hydration_error AS hydrationError,
            hydrated_at AS hydratedAt
          FROM objects
          WHERE object_id = ?
        `
      )
      .get(objectId);

    return row ?? null;
  });
}
