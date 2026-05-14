import { createReadStream, readFileSync } from "node:fs";
import {
  createCatalogSqliteBulkWriter,
  initializeCatalogSqlite,
  persistCatalogRecordsToSqlite
} from "./catalog-sqlite.js";

function normalizeBoolean(value) {
  return String(value).trim().toLowerCase() === "true";
}

function normalizeInteger(value) {
  const parsedValue = Number.parseInt(String(value ?? "").trim(), 10);

  return Number.isNaN(parsedValue) ? null : parsedValue;
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function readField(row, ...names) {
  for (const name of names) {
    if (Object.hasOwn(row, name)) {
      return row[name];
    }
  }

  return "";
}

function parseCsvLine(line) {
  const values = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(currentValue);
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  values.push(currentValue);
  return values;
}

function parseCsvRecords(csvText) {
  const records = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    const nextCharacter = csvText[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentValue);
      currentValue = "";

      if (currentRow.some((value) => value !== "")) {
        records.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentValue += character;
  }

  if (currentValue !== "" || currentRow.length > 0) {
    currentRow.push(currentValue);
    records.push(currentRow);
  }

  return records;
}

async function* parseCsvRecordStream(readable) {
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;
  let isFirstChunk = true;

  for await (const rawChunk of readable) {
    const chunk = isFirstChunk ? String(rawChunk).replace(/^\uFEFF/, "") : String(rawChunk);
    isFirstChunk = false;

    for (let index = 0; index < chunk.length; index += 1) {
      const character = chunk[index];
      const nextCharacter = chunk[index + 1];

      if (character === '"') {
        if (inQuotes && nextCharacter === '"') {
          currentValue += '"';
          index += 1;
          continue;
        }

        inQuotes = !inQuotes;
        continue;
      }

      if (character === "," && !inQuotes) {
        currentRow.push(currentValue);
        currentValue = "";
        continue;
      }

      if ((character === "\n" || character === "\r") && !inQuotes) {
        if (character === "\r" && nextCharacter === "\n") {
          index += 1;
        }

        currentRow.push(currentValue);
        currentValue = "";

        if (currentRow.some((value) => value !== "")) {
          yield currentRow;
        }

        currentRow = [];
        continue;
      }

      currentValue += character;
    }
  }

  if (currentValue !== "" || currentRow.length > 0) {
    currentRow.push(currentValue);

    if (currentRow.some((value) => value !== "")) {
      yield currentRow;
    }
  }
}

function mapCsvRowToObject(headers, values) {
  return headers.reduce((row, header, index) => {
    row[header] = values[index] ?? "";
    return row;
  }, {});
}

async function* parseCatalogCsvFileRows(csvPath) {
  let readable;

  try {
    readable = createReadStream(csvPath, { encoding: "utf8" });
  } catch (error) {
    throw new Error("Unable to read catalog CSV file.", { cause: error });
  }

  let headers = null;

  try {
    for await (const values of parseCsvRecordStream(readable)) {
      if (!headers) {
        headers = values;
        continue;
      }

      yield mapCsvRowToObject(headers, values);
    }
  } catch (error) {
    throw new Error("Unable to read catalog CSV file.", { cause: error });
  }
}

export function parseCatalogCsv(csvText) {
  const [headerValues = [], ...rowValues] = parseCsvRecords(String(csvText).replace(/^\uFEFF/, ""));
  const headers = headerValues;

  return rowValues.map((values) =>
    headers.reduce((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {})
  );
}

export function importCatalogCsv(csvText) {
  return normalizeCatalogImportRows(parseCatalogCsv(csvText));
}

export function importCatalogCsvFile(csvPath) {
  try {
    return importCatalogCsv(readFileSync(csvPath, "utf8"));
  } catch (error) {
    throw new Error("Unable to read catalog CSV file.", { cause: error });
  }
}

function normalizeCatalogImportRunInput(input) {
  if (typeof input === "string") {
    return { csvPath: input, databasePath: null };
  }

  return {
    csvPath: input?.csvPath,
    databasePath: input?.databasePath ?? null
  };
}

export function runCatalogImport(input) {
  const { csvPath, databasePath } = normalizeCatalogImportRunInput(input);

  try {
    const result = importCatalogCsvFile(csvPath);

    if (databasePath) {
      try {
        initializeCatalogSqlite(databasePath);
        persistCatalogRecordsToSqlite({ databasePath, records: result.records });
      } catch (error) {
        throw new Error("Unable to write catalog SQLite database.", { cause: error });
      }
    }

    return {
      ok: true,
      csvPath,
      ...(databasePath ? { databasePath } : {}),
      recordCount: result.records.length,
      summary: result.summary,
      failures: result.failures,
      ...(databasePath ? {} : { records: result.records })
    };
  } catch (error) {
    return {
      ok: false,
      csvPath,
      ...(databasePath ? { databasePath } : {}),
      recordCount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function buildDepartmentIdMapFromCatalogCsvFile(csvPath) {
  const departments = new Set();

  for await (const row of parseCatalogCsvFileRows(csvPath)) {
    const department = normalizeString(readField(row, "Department"));

    if (department) {
      departments.add(department);
    }
  }

  return new Map(
    Array.from(departments)
      .sort((left, right) => left.localeCompare(right))
      .map((department, index) => [department, index + 1])
  );
}

export async function runCatalogImportAsync(input) {
  const { csvPath, databasePath } = normalizeCatalogImportRunInput(input);

  if (!databasePath) {
    return runCatalogImport(input);
  }

  try {
    const departmentIds = await buildDepartmentIdMapFromCatalogCsvFile(csvPath);
    try {
      const writer = createCatalogSqliteBulkWriter(databasePath);
      const failures = [];
      let totalRows = 0;
      let importedRows = 0;

      try {
        for await (const row of parseCatalogCsvFileRows(csvPath)) {
          totalRows += 1;

          try {
            const normalizedRecord = normalizeCatalogImportRow(row);
            const record = {
              ...normalizedRecord,
              departmentId: normalizedRecord.department
                ? (departmentIds.get(normalizedRecord.department) ?? null)
                : null
            };

            writer.writeRecord(record);
            importedRows += 1;
          } catch (error) {
            failures.push({
              rowNumber: totalRows,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        writer.commit([]);
      } catch (error) {
        writer.rollback();
        throw error;
      }

      const skippedByReason = failures.reduce((counts, failure) => {
        counts[failure.error] = (counts[failure.error] ?? 0) + 1;
        return counts;
      }, {});

      return {
        ok: true,
        csvPath,
        databasePath,
        recordCount: importedRows,
        summary: {
          totalRows,
          importedRows,
          skippedRows: failures.length,
          hasFailures: failures.length > 0,
          firstSkippedRowNumber: failures[0]?.rowNumber ?? null,
          lastSkippedRowNumber: failures.at(-1)?.rowNumber ?? null,
          skippedByReason
        },
        failures
      };
    } catch (error) {
      throw new Error("Unable to write catalog SQLite database.", { cause: error });
    }
  } catch (error) {
    return {
      ok: false,
      csvPath,
      ...(databasePath ? { databasePath } : {}),
      recordCount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function normalizeCatalogImportRow(row) {
  const objectID = normalizeInteger(readField(row, "Object ID", "ObjectID"));

  if (objectID == null) {
    throw new Error("ObjectID must be a valid integer.");
  }

  return {
    objectNumber: normalizeString(readField(row, "Object Number")),
    isHighlight: normalizeBoolean(readField(row, "Is Highlight")),
    isTimelineWork: normalizeBoolean(readField(row, "Is Timeline Work")),
    isPublicDomain: normalizeBoolean(readField(row, "Is Public Domain", "IsPublicDomain")),
    objectID,
    galleryNumber: normalizeString(readField(row, "Gallery Number")),
    department: normalizeString(readField(row, "Department")),
    accessionYear: normalizeString(readField(row, "AccessionYear")),
    objectName: normalizeString(readField(row, "Object Name", "ObjectName")),
    title: normalizeString(readField(row, "Title")),
    culture: normalizeString(readField(row, "Culture")),
    period: normalizeString(readField(row, "Period")),
    dynasty: normalizeString(readField(row, "Dynasty")),
    reign: normalizeString(readField(row, "Reign")),
    portfolio: normalizeString(readField(row, "Portfolio")),
    constituentID: normalizeInteger(readField(row, "Constituent ID")),
    artistRole: normalizeString(readField(row, "Artist Role")),
    artistPrefix: normalizeString(readField(row, "Artist Prefix")),
    artistDisplayName: normalizeString(readField(row, "Artist Display Name", "ArtistDisplayName")),
    artistDisplayBio: normalizeString(readField(row, "Artist Display Bio")),
    artistSuffix: normalizeString(readField(row, "Artist Suffix")),
    artistAlphaSort: normalizeString(readField(row, "Artist Alpha Sort")),
    artistNationality: normalizeString(readField(row, "Artist Nationality")),
    artistBeginDate: normalizeString(readField(row, "Artist Begin Date")),
    artistEndDate: normalizeString(readField(row, "Artist End Date")),
    artistGender: normalizeString(readField(row, "Artist Gender")),
    artistULANURL: normalizeString(readField(row, "Artist ULAN URL")),
    artistWikidataURL: normalizeString(readField(row, "Artist Wikidata URL")),
    objectDate: normalizeString(readField(row, "Object Date", "ObjectDate")),
    objectBeginDate: normalizeInteger(readField(row, "Object Begin Date")),
    objectEndDate: normalizeInteger(readField(row, "Object End Date")),
    medium: normalizeString(readField(row, "Medium")),
    dimensions: normalizeString(readField(row, "Dimensions")),
    creditLine: normalizeString(readField(row, "Credit Line")),
    geographyType: normalizeString(readField(row, "Geography Type")),
    city: normalizeString(readField(row, "City")),
    state: normalizeString(readField(row, "State")),
    county: normalizeString(readField(row, "County")),
    country: normalizeString(readField(row, "Country")),
    region: normalizeString(readField(row, "Region")),
    subregion: normalizeString(readField(row, "Subregion")),
    locale: normalizeString(readField(row, "Locale")),
    locus: normalizeString(readField(row, "Locus")),
    excavation: normalizeString(readField(row, "Excavation")),
    river: normalizeString(readField(row, "River")),
    classification: normalizeString(readField(row, "Classification")),
    rightsAndReproduction: normalizeString(readField(row, "Rights and Reproduction")),
    objectURL: normalizeString(readField(row, "Link Resource", "ObjectURL")),
    objectWikidataURL: normalizeString(readField(row, "Object Wikidata URL")),
    metadataDate: normalizeString(readField(row, "Metadata Date")),
    repository: normalizeString(readField(row, "Repository")),
    tags: normalizeString(readField(row, "Tags")),
    tagsAATURL: normalizeString(readField(row, "Tags AAT URL")),
    tagsWikidataURL: normalizeString(readField(row, "Tags Wikidata URL")),
    departmentId: null,
    primaryImage: normalizeString(readField(row, "Primary Image", "PrimaryImage")),
    primaryImageSmall: normalizeString(readField(row, "Primary Image Small", "PrimaryImageSmall")),
    hydrationStatus: "pending",
    hydrationError: "",
    hydratedAt: "",
    dimensionsCheckedAt: ""
  };
}

export function normalizeCatalogImportRows(rows) {
  const normalizedRecords = [];
  const failures = [];

  rows.forEach((row, index) => {
    try {
      normalizedRecords.push(normalizeCatalogImportRow(row));
    } catch (error) {
      failures.push({
        rowNumber: index + 1,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const records = finalizeCatalogImportRecords(normalizedRecords);
  const skippedByReason = failures.reduce((counts, failure) => {
    counts[failure.error] = (counts[failure.error] ?? 0) + 1;
    return counts;
  }, {});

  return {
    records,
    summary: {
      totalRows: rows.length,
      importedRows: records.length,
      skippedRows: failures.length,
      hasFailures: failures.length > 0,
      firstSkippedRowNumber: failures[0]?.rowNumber ?? null,
      lastSkippedRowNumber: failures.at(-1)?.rowNumber ?? null,
      skippedByReason
    },
    failures
  };
}

export function finalizeCatalogImportRecords(records) {
  const departmentIds = new Map(
    Array.from(
      new Set(records.map((record) => record.department).filter(Boolean))
    )
      .sort((left, right) => left.localeCompare(right))
      .map((department, index) => [department, index + 1])
  );

  return records.map((record) => ({
    ...record,
    departmentId: record.department ? (departmentIds.get(record.department) ?? null) : null
  }));
}
