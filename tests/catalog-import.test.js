import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createTrackedTempDir } from "./temp-dir.js";
import {
  importCatalogCsv,
  importCatalogCsvFile,
  parseCatalogCsv,
  normalizeCatalogImportRow,
  normalizeCatalogImportRows,
  finalizeCatalogImportRecords
} from "../server/catalog-import.js";

describe("catalog import", () => {
  test("importCatalogCsv returns an empty import result for an empty CSV input", () => {
    expect(importCatalogCsv("")).toEqual({
      records: [],
      summary: {
        totalRows: 0,
        importedRows: 0,
        skippedRows: 0,
        hasFailures: false,
        firstSkippedRowNumber: null,
        lastSkippedRowNumber: null,
        skippedByReason: {}
      },
      failures: []
    });
  });

  test("importCatalogCsv parses, normalizes, finalizes, and summarizes a CSV batch", () => {
    expect(
      importCatalogCsv(
        "Object ID,Department,Title,Is Public Domain\n" +
          "1,European Paintings,Work 1,True\n" +
          "bad-id,European Paintings,Broken row,False\n" +
          "2,Arms and Armor,Work 2,False\n"
      )
    ).toEqual({
      records: [
        expect.objectContaining({
          objectID: 1,
          title: "Work 1",
          department: "European Paintings",
          departmentId: 2,
          isPublicDomain: true
        }),
        expect.objectContaining({
          objectID: 2,
          title: "Work 2",
          department: "Arms and Armor",
          departmentId: 1,
          isPublicDomain: false
        })
      ],
      summary: {
        totalRows: 3,
        importedRows: 2,
        skippedRows: 1,
        hasFailures: true,
        firstSkippedRowNumber: 2,
        lastSkippedRowNumber: 2,
        skippedByReason: {
          "ObjectID must be a valid integer.": 1
        }
      },
      failures: [
        {
          rowNumber: 2,
          error: "ObjectID must be a valid integer."
        }
      ]
    });
  });

  test("importCatalogCsvFile reads CSV text from disk and returns the import result", () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-import-"));
    const csvPath = path.join(tempDir, "sample.csv");

    writeFileSync(
      csvPath,
      "Object ID,Department,Title,Is Public Domain\n" +
        "1,European Paintings,Work 1,True\n" +
        "bad-id,European Paintings,Broken row,False\n",
      "utf8"
    );

    expect(importCatalogCsvFile(csvPath)).toEqual({
      records: [
        expect.objectContaining({
          objectID: 1,
          title: "Work 1",
          department: "European Paintings",
          departmentId: 1,
          isPublicDomain: true
        })
      ],
      summary: {
        totalRows: 2,
        importedRows: 1,
        skippedRows: 1,
        hasFailures: true,
        firstSkippedRowNumber: 2,
        lastSkippedRowNumber: 2,
        skippedByReason: {
          "ObjectID must be a valid integer.": 1
        }
      },
      failures: [
        {
          rowNumber: 2,
          error: "ObjectID must be a valid integer."
        }
      ]
    });
  });

  test("importCatalogCsvFile imports a real subset extracted from MetObjects.csv", () => {
    const tempDir = createTrackedTempDir(path.join(os.tmpdir(), "artctl-import-"));
    const csvPath = path.join(tempDir, "metobjects-subset.csv");
    const metObjectsCsv = readFileSync(path.resolve("metropolitan/MetObjects.csv"), "utf8");
    const subsetCsv =
      metObjectsCsv.split(/\r?\n/).slice(0, 4).join("\n") + "\n";

    writeFileSync(csvPath, subsetCsv, "utf8");

    expect(importCatalogCsvFile(csvPath)).toEqual({
      records: [
        expect.objectContaining({
          objectID: 1,
          title: "One-dollar Liberty Head Coin",
          department: "The American Wing",
          departmentId: 1,
          isPublicDomain: false
        }),
        expect.objectContaining({
          objectID: 2,
          title: "Ten-dollar Liberty Head Coin",
          artistDisplayName: "Christian Gobrecht",
          department: "The American Wing",
          departmentId: 1,
          isPublicDomain: false
        }),
        expect.objectContaining({
          objectID: 3,
          title: "Two-and-a-Half Dollar Coin",
          objectDate: "1909–27",
          department: "The American Wing",
          departmentId: 1,
          isPublicDomain: false
        })
      ],
      summary: {
        totalRows: 3,
        importedRows: 3,
        skippedRows: 0,
        hasFailures: false,
        firstSkippedRowNumber: null,
        lastSkippedRowNumber: null,
        skippedByReason: {}
      },
      failures: []
    });
  });

  test("importCatalogCsvFile preserves harder real MetObjects.csv fields from a checked-in subset fixture", () => {
    expect(importCatalogCsvFile(path.resolve("tests/fixtures/metobjects-real-subset.csv"))).toEqual({
      records: [
        expect.objectContaining({
          objectID: 4926,
          title: "Mantel",
          medium: "Wood, composition ornament",
          dimensions:
            '60 5/8 in. × 88 in. × 9 3/4 in. (154 × 223.5 × 24.8 cm)\n' +
            '9 3/4" Depth with harware\n' +
            '7 3/4" Depth without hardware',
          creditLine: "Gift of Mrs. Francis P. Garvan, 1966",
          department: "The American Wing",
          departmentId: 1,
          isPublicDomain: true
        }),
        expect.objectContaining({
          objectID: 5046,
          title: 'The "Shipwreck Medal"',
          artistDisplayName: "Salathiel Ellis",
          medium: "Bronze",
          creditLine: "Gift of William H. Huntington, 1883",
          department: "The American Wing",
          departmentId: 1,
          isPublicDomain: true
        })
      ],
      summary: {
        totalRows: 2,
        importedRows: 2,
        skippedRows: 0,
        hasFailures: false,
        firstSkippedRowNumber: null,
        lastSkippedRowNumber: null,
        skippedByReason: {}
      },
      failures: []
    });
  });

  test("importCatalogCsvFile throws a stable error when the CSV file cannot be read", () => {
    expect(() => importCatalogCsvFile("/definitely/missing/metobjects.csv")).toThrow(
      "Unable to read catalog CSV file."
    );
  });

  test("parseCatalogCsv reads the header row and returns CSV row objects", () => {
    expect(
      parseCatalogCsv(
        "\uFEFFObject Number,Is Public Domain,Object ID,Title,Artist Display Name\n" +
          "43.50.4,True,436524,Sunflowers,Vincent van Gogh\n" +
          "1979.486.1,False,1,One-dollar Liberty Head Coin,James Barton Longacre\n"
      )
    ).toEqual([
      {
        "Object Number": "43.50.4",
        "Is Public Domain": "True",
        "Object ID": "436524",
        Title: "Sunflowers",
        "Artist Display Name": "Vincent van Gogh"
      },
      {
        "Object Number": "1979.486.1",
        "Is Public Domain": "False",
        "Object ID": "1",
        Title: "One-dollar Liberty Head Coin",
        "Artist Display Name": "James Barton Longacre"
      }
    ]);
  });

  test("parseCatalogCsv preserves quoted fields that contain commas", () => {
    expect(
      parseCatalogCsv(
        "Object ID,Title,Artist Display Bio,Credit Line\n" +
          '1,"Sunflowers, late version","Dutch, Zundert 1853-1890 Auvers-sur-Oise","Gift of Someone, 1979"\n'
      )
    ).toEqual([
      {
        "Object ID": "1",
        Title: "Sunflowers, late version",
        "Artist Display Bio": "Dutch, Zundert 1853-1890 Auvers-sur-Oise",
        "Credit Line": "Gift of Someone, 1979"
      }
    ]);
  });

  test("parseCatalogCsv preserves empty fields including quoted empties and trailing blanks", () => {
    expect(
      parseCatalogCsv(
        "Object ID,Title,Artist Prefix,Artist Suffix,Tags\n" +
          '1,Sunflowers,"","",\n'
      )
    ).toEqual([
      {
        "Object ID": "1",
        Title: "Sunflowers",
        "Artist Prefix": "",
        "Artist Suffix": "",
        Tags: ""
      }
    ]);
  });

  test("parseCatalogCsv preserves multiline quoted fields", () => {
    expect(
      parseCatalogCsv(
        "Object ID,Title,Credit Line\n" +
          '1,Sunflowers,"Gift of Someone\n' +
          'and Someone Else, 1979"\n'
      )
    ).toEqual([
      {
        "Object ID": "1",
        Title: "Sunflowers",
        "Credit Line": "Gift of Someone\nand Someone Else, 1979"
      }
    ]);
  });

  test("parseCatalogCsv preserves escaped double quotes inside quoted fields", () => {
    expect(
      parseCatalogCsv(
        "Object ID,Title,Credit Line\n" +
          '1,"He said ""Sunflowers""","Gift of ""Someone"", 1979"\n'
      )
    ).toEqual([
      {
        "Object ID": "1",
        Title: 'He said "Sunflowers"',
        "Credit Line": 'Gift of "Someone", 1979'
      }
    ]);
  });

  test("normalizeCatalogImportRow converts a Met CSV row into a catalog record shape", () => {
    expect(
      normalizeCatalogImportRow({
        "Object Number": " 43.50.4 ",
        "Is Highlight": " True ",
        "Is Timeline Work": " False ",
        "Is Public Domain": "True",
        "Object ID": "436524",
        "Gallery Number": " 825 ",
        Department: " European Paintings ",
        AccessionYear: " 1888 ",
        "Object Name": " Painting ",
        Title: " Sunflowers ",
        Culture: " ",
        Period: " ",
        Dynasty: " ",
        Reign: " ",
        Portfolio: " ",
        "Constituent ID": " 16152 ",
        "Artist Role": " Painter ",
        "Artist Prefix": " ",
        "Artist Display Name": " Vincent van Gogh ",
        "Artist Display Bio": "Dutch, Zundert 1853–1890 Auvers-sur-Oise",
        "Artist Suffix": " ",
        "Artist Alpha Sort": "Gogh, Vincent van",
        "Artist Nationality": "Dutch",
        "Artist Begin Date": "1853      ",
        "Artist End Date": "1890      ",
        "Artist Gender": " ",
        "Artist ULAN URL": "http://vocab.getty.edu/page/ulan/500115588",
        "Artist Wikidata URL": "https://www.wikidata.org/wiki/Q5582",
        Culture: " ",
        ObjectDate: " 1887 ",
        "Object Begin Date": "1887",
        "Object End Date": "1887",
        Medium: " Oil on canvas ",
        Dimensions: "92.1 x 73 cm",
        "Credit Line": "Bequest of Miss Adelaide Milton de Groot (1876-1967), 1967",
        "Geography Type": " ",
        City: " ",
        State: " ",
        County: " ",
        Country: " ",
        Region: " ",
        Subregion: " ",
        Locale: " ",
        Locus: " ",
        Excavation: " ",
        River: " ",
        Classification: "Paintings",
        "Rights and Reproduction": " ",
        "Link Resource": " https://www.metmuseum.org/art/collection/search/436524 ",
        "Object Wikidata URL": "https://www.wikidata.org/wiki/Q19911650",
        "Metadata Date": "2024-01-01T00:00:00.000Z",
        Repository: "Metropolitan Museum of Art, New York, NY",
        Tags: "Sunflowers|Still Life",
        "Tags AAT URL": "http://vocab.getty.edu/aat/300132399|http://vocab.getty.edu/aat/300033618",
        "Tags Wikidata URL": "https://www.wikidata.org/wiki/Q171497|https://www.wikidata.org/wiki/Q170571"
      })
    ).toEqual({
      objectNumber: "43.50.4",
      isHighlight: true,
      isTimelineWork: false,
      isPublicDomain: true,
      objectID: 436524,
      galleryNumber: "825",
      accessionYear: "1888",
      title: "Sunflowers",
      artistDisplayName: "Vincent van Gogh",
      culture: "",
      objectDate: "1887",
      objectBeginDate: 1887,
      objectEndDate: 1887,
      objectName: "Painting",
      medium: "Oil on canvas",
      department: "European Paintings",
      period: "",
      dynasty: "",
      reign: "",
      portfolio: "",
      constituentID: 16152,
      artistRole: "Painter",
      artistPrefix: "",
      artistDisplayBio: "Dutch, Zundert 1853–1890 Auvers-sur-Oise",
      artistSuffix: "",
      artistAlphaSort: "Gogh, Vincent van",
      artistNationality: "Dutch",
      artistBeginDate: "1853",
      artistEndDate: "1890",
      artistGender: "",
      artistULANURL: "http://vocab.getty.edu/page/ulan/500115588",
      artistWikidataURL: "https://www.wikidata.org/wiki/Q5582",
      dimensions: "92.1 x 73 cm",
      creditLine: "Bequest of Miss Adelaide Milton de Groot (1876-1967), 1967",
      geographyType: "",
      city: "",
      state: "",
      county: "",
      country: "",
      region: "",
      subregion: "",
      locale: "",
      locus: "",
      excavation: "",
      river: "",
      classification: "Paintings",
      rightsAndReproduction: "",
      objectURL: "https://www.metmuseum.org/art/collection/search/436524",
      objectWikidataURL: "https://www.wikidata.org/wiki/Q19911650",
      metadataDate: "2024-01-01T00:00:00.000Z",
      repository: "Metropolitan Museum of Art, New York, NY",
      tags: "Sunflowers|Still Life",
      tagsAATURL: "http://vocab.getty.edu/aat/300132399|http://vocab.getty.edu/aat/300033618",
      tagsWikidataURL: "https://www.wikidata.org/wiki/Q171497|https://www.wikidata.org/wiki/Q170571",
      departmentId: null,
      primaryImage: "",
      primaryImageSmall: ""
    });
  });

  test("normalizeCatalogImportRow throws when ObjectID is not a valid integer", () => {
    expect(() =>
      normalizeCatalogImportRow({
        "Object ID": "not-a-number",
        Title: "Broken row"
      })
    ).toThrow("ObjectID must be a valid integer.");
  });

  test("normalizeCatalogImportRows keeps valid rows and reports malformed-row failures", () => {
    expect(
      normalizeCatalogImportRows([
        {
          "Object ID": "436524",
          Title: "Sunflowers",
          "Artist Display Name": "Vincent van Gogh",
          Department: "European Paintings",
          "Is Public Domain": "True"
        },
        {
          "Object ID": "not-a-number",
          Title: "Broken row"
        }
      ])
    ).toEqual({
      records: [
        {
          objectID: 436524,
          objectNumber: "",
          isHighlight: false,
          isTimelineWork: false,
          title: "Sunflowers",
          artistDisplayName: "Vincent van Gogh",
          culture: "",
          objectDate: "",
          objectBeginDate: null,
          objectEndDate: null,
          objectName: "",
          medium: "",
          department: "European Paintings",
          period: "",
          dynasty: "",
          reign: "",
          portfolio: "",
          galleryNumber: "",
          accessionYear: "",
          constituentID: null,
          artistRole: "",
          artistPrefix: "",
          artistDisplayBio: "",
          artistSuffix: "",
          artistAlphaSort: "",
          artistNationality: "",
          artistBeginDate: "",
          artistEndDate: "",
          artistGender: "",
          artistULANURL: "",
          artistWikidataURL: "",
          dimensions: "",
          creditLine: "",
          geographyType: "",
          city: "",
          state: "",
          county: "",
          country: "",
          region: "",
          subregion: "",
          locale: "",
          locus: "",
          excavation: "",
          river: "",
          classification: "",
          rightsAndReproduction: "",
          objectURL: "",
          objectWikidataURL: "",
          metadataDate: "",
          repository: "",
          tags: "",
          tagsAATURL: "",
          tagsWikidataURL: "",
          departmentId: 1,
          isPublicDomain: true,
          primaryImage: "",
          primaryImageSmall: ""
        }
      ],
      summary: {
        totalRows: 2,
        importedRows: 1,
        skippedRows: 1,
        hasFailures: true,
        firstSkippedRowNumber: 2,
        lastSkippedRowNumber: 2,
        skippedByReason: {
          "ObjectID must be a valid integer.": 1
        }
      },
      failures: [
        {
          rowNumber: 2,
          error: "ObjectID must be a valid integer."
        }
      ]
    });
  });

  test("normalizeCatalogImportRows groups skipped rows by failure reason", () => {
    expect(
      normalizeCatalogImportRows([
        {
          "Object ID": "not-a-number",
          Title: "Broken row 1"
        },
        {
          "Object ID": "also-bad",
          Title: "Broken row 2"
        }
      ])
    ).toEqual({
      records: [],
      summary: {
        totalRows: 2,
        importedRows: 0,
        skippedRows: 2,
        hasFailures: true,
        firstSkippedRowNumber: 1,
        lastSkippedRowNumber: 2,
        skippedByReason: {
          "ObjectID must be a valid integer.": 2
        }
      },
      failures: [
        {
          rowNumber: 1,
          error: "ObjectID must be a valid integer."
        },
        {
          rowNumber: 2,
          error: "ObjectID must be a valid integer."
        }
      ]
    });
  });

  test("normalizeCatalogImportRows reports a clean summary for a fully valid batch", () => {
    expect(
      normalizeCatalogImportRows([
        {
          "Object ID": "1",
          Title: "Work 1",
          Department: "European Paintings",
          "Is Public Domain": "True"
        },
        {
          "Object ID": "2",
          Title: "Work 2",
          Department: "Arms and Armor",
          "Is Public Domain": "False"
        }
      ])
    ).toEqual({
      records: [
        expect.objectContaining({
          objectID: 1,
          title: "Work 1",
          department: "European Paintings",
          departmentId: 2,
          isPublicDomain: true
        }),
        expect.objectContaining({
          objectID: 2,
          title: "Work 2",
          department: "Arms and Armor",
          departmentId: 1,
          isPublicDomain: false
        })
      ],
      summary: {
        totalRows: 2,
        importedRows: 2,
        skippedRows: 0,
        hasFailures: false,
        firstSkippedRowNumber: null,
        lastSkippedRowNumber: null,
        skippedByReason: {}
      },
      failures: []
    });
  });

  test("finalizeCatalogImportRecords derives stable departmentIds from department names", () => {
    expect(
      finalizeCatalogImportRecords([
        {
          objectID: 1,
          title: "Work 1",
          department: "European Paintings",
          departmentId: null
        },
        {
          objectID: 2,
          title: "Work 2",
          department: "Arms and Armor",
          departmentId: null
        },
        {
          objectID: 3,
          title: "Work 3",
          department: "European Paintings",
          departmentId: null
        },
        {
          objectID: 4,
          title: "Work 4",
          department: "",
          departmentId: null
        }
      ])
    ).toEqual([
      {
        objectID: 1,
        title: "Work 1",
        department: "European Paintings",
        departmentId: 2
      },
      {
        objectID: 2,
        title: "Work 2",
        department: "Arms and Armor",
        departmentId: 1
      },
      {
        objectID: 3,
        title: "Work 3",
        department: "European Paintings",
        departmentId: 2
      },
      {
        objectID: 4,
        title: "Work 4",
        department: "",
        departmentId: null
      }
    ]);
  });
});
