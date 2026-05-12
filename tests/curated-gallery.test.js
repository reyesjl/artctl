import { describe, expect, test } from "vitest";
import {
  loadCuratedArtistGroups,
  loadCuratedArtistIndex,
  loadCuratedGalleryPage
} from "../server/curated-gallery.js";

describe("curated gallery", () => {
  test("loadCuratedGalleryPage normalizes seeded records into gallery cards", () => {
    expect(
      loadCuratedGalleryPage({
        records: [
          {
            objectID: 436121,
            title: "The Great Wave off Kanagawa",
            artistDisplayName: "",
            culture: "Japanese",
            isPublicDomain: true,
            primaryImage: "",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"
          }
        ],
        batchSize: 24
      })
    ).toEqual({
      results: [
        {
          objectId: 436121,
          title: "The Great Wave off Kanagawa",
          artist: "Japanese",
          imageUrl: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"
        }
      ]
    });
  });

  test("loadCuratedGalleryPage returns the default curated corpus in deterministic order and shape", () => {
    expect(loadCuratedGalleryPage()).toEqual({
      results: [
        {
          objectId: 436524,
          title: "Sunflowers",
          artist: "Vincent van Gogh",
          imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DP-41223-001.jpg"
        },
        {
          objectId: 333780,
          title: "Charles V spearing a bull in the ring at Valladolid, plate 10 from \"La Tauromaquia\"",
          artist: "Francisco Goya",
          imageUrl: "https://images.metmuseum.org/CRDImages/dp/web-large/DP817512.jpg"
        },
        {
          objectId: 334627,
          title: "St. Jerome Reading",
          artist: "Rembrandt",
          imageUrl: "https://images.metmuseum.org/CRDImages/dp/web-large/DP814405.jpg"
        },
        {
          objectId: 339645,
          title: "Landscape",
          artist: "Camille Pissarro",
          imageUrl: "https://images.metmuseum.org/CRDImages/dp/web-large/DP807941.jpg"
        },
        {
          objectId: 196442,
          title: "Study in the Nude for The Little Fourteen-Year-Old Dancer",
          artist: "Edgar Degas",
          imageUrl: "https://images.metmuseum.org/CRDImages/es/web-large/ES7551.jpg"
        },
        {
          objectId: 334173,
          title: "Bathers Under a Bridge (recto); Study after Houdon's Ecorché (verso)",
          artist: "Paul Cézanne",
          imageUrl: "https://images.metmuseum.org/CRDImages/dp/web-large/DP805572.jpg"
        },
        {
          objectId: 334638,
          title: "A Cat Curled Up, Sleeping",
          artist: "Édouard Manet",
          imageUrl: "https://images.metmuseum.org/CRDImages/dp/web-large/DP807593.jpg"
        },
        {
          objectId: 36483,
          title: "New Year's Day at the Ōgiya Brothel, Yoshiwara",
          artist: "Katsushika Hokusai",
          imageUrl: "https://images.metmuseum.org/CRDImages/as/web-large/DP317443.jpg"
        },
        {
          objectId: 36461,
          title: "Sudden Shower over Shin-Ohashi Bridge and Atake (Ohashi Atake no yudachi), from the series One Hundred Famous Views of Edo (Meisho Edo hyakkei)",
          artist: "Utagawa Hiroshige",
          imageUrl: "https://images.metmuseum.org/CRDImages/as/web-large/DP121525.jpg"
        },
        {
          objectId: 193491,
          title: "Female Nude Seen from Behind",
          artist: "Albrecht Dürer",
          imageUrl: "https://images.metmuseum.org/CRDImages/es/web-large/DP-29446-001.jpg"
        },
        {
          objectId: 11109,
          title: "The Bather",
          artist: "Winslow Homer",
          imageUrl: "https://images.metmuseum.org/CRDImages/ad/web-large/DP-21449-001.jpg"
        },
        {
          objectId: 12127,
          title: "Madame X (Virginie Amelie Avegno Gautreau)",
          artist: "John Singer Sargent",
          imageUrl: "https://images.metmuseum.org/CRDImages/ad/web-large/DP-29006-001.jpg"
        },
        {
          objectId: 500001,
          title: "Curated Van Gogh Work 2",
          artist: "Vincent van Gogh",
          imageUrl: "https://images.metmuseum.org/CRDImages/seed/web-large/vincent-van-gogh-500001.jpg"
        },
        {
          objectId: 500002,
          title: "Curated Van Gogh Work 3",
          artist: "Vincent van Gogh",
          imageUrl: "https://images.metmuseum.org/CRDImages/seed/web-large/vincent-van-gogh-500002.jpg"
        },
        {
          objectId: 500003,
          title: "Curated Van Gogh Work 4",
          artist: "Vincent van Gogh",
          imageUrl: "https://images.metmuseum.org/CRDImages/seed/web-large/vincent-van-gogh-500003.jpg"
        },
        {
          objectId: 500004,
          title: "Curated Van Gogh Work 5",
          artist: "Vincent van Gogh",
          imageUrl: "https://images.metmuseum.org/CRDImages/seed/web-large/vincent-van-gogh-500004.jpg"
        },
        {
          objectId: 500005,
          title: "Curated Van Gogh Work 6",
          artist: "Vincent van Gogh",
          imageUrl: "https://images.metmuseum.org/CRDImages/seed/web-large/vincent-van-gogh-500005.jpg"
        },
        {
          objectId: 500006,
          title: "Curated Van Gogh Work 7",
          artist: "Vincent van Gogh",
          imageUrl: "https://images.metmuseum.org/CRDImages/seed/web-large/vincent-van-gogh-500006.jpg"
        },
        {
          objectId: 500007,
          title: "Curated Van Gogh Work 8",
          artist: "Vincent van Gogh",
          imageUrl: "https://images.metmuseum.org/CRDImages/seed/web-large/vincent-van-gogh-500007.jpg"
        },
        {
          objectId: 500008,
          title: "Curated Van Gogh Work 9",
          artist: "Vincent van Gogh",
          imageUrl: "https://images.metmuseum.org/CRDImages/seed/web-large/vincent-van-gogh-500008.jpg"
        },
        {
          objectId: 500009,
          title: "Curated Van Gogh Work 10",
          artist: "Vincent van Gogh",
          imageUrl: "https://images.metmuseum.org/CRDImages/seed/web-large/vincent-van-gogh-500009.jpg"
        },
        {
          objectId: 500010,
          title: "Curated Van Gogh Work 11",
          artist: "Vincent van Gogh",
          imageUrl: "https://images.metmuseum.org/CRDImages/seed/web-large/vincent-van-gogh-500010.jpg"
        },
        {
          objectId: 500011,
          title: "Curated Van Gogh Work 12",
          artist: "Vincent van Gogh",
          imageUrl: "https://images.metmuseum.org/CRDImages/seed/web-large/vincent-van-gogh-500011.jpg"
        },
        {
          objectId: 500012,
          title: "Curated Van Gogh Work 13",
          artist: "Vincent van Gogh",
          imageUrl: "https://images.metmuseum.org/CRDImages/seed/web-large/vincent-van-gogh-500012.jpg"
        }
      ]
    });
  });

  test("loadCuratedArtistGroups caps each artist at 50 works while preserving seed order", () => {
    const monetRecords = Array.from({ length: 51 }, (_, index) => {
      const objectId = 800000 + index;

      return {
        objectID: objectId,
        title: `Water Lilies ${index + 1}`,
        artistDisplayName: "Claude Monet",
        culture: "",
        isPublicDomain: true,
        primaryImage: "",
        primaryImageSmall: `https://images.metmuseum.org/CRDImages/test/web-large/${objectId}.jpg`
      };
    });

    expect(
      loadCuratedArtistGroups({
        records: [
          ...monetRecords,
          {
            objectID: 810000,
            title: "Sunflowers",
            artistDisplayName: "Vincent van Gogh",
            culture: "",
            isPublicDomain: true,
            primaryImage: "",
            primaryImageSmall: "https://images.metmuseum.org/CRDImages/test/web-large/810000.jpg"
          }
        ],
        worksPerArtist: 50
      })
    ).toEqual({
      artists: [
        {
          artist: "Claude Monet",
          works: [
            {
              objectId: 800000,
              title: "Water Lilies 1",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800000.jpg"
            },
            {
              objectId: 800001,
              title: "Water Lilies 2",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800001.jpg"
            },
            {
              objectId: 800002,
              title: "Water Lilies 3",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800002.jpg"
            },
            {
              objectId: 800003,
              title: "Water Lilies 4",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800003.jpg"
            },
            {
              objectId: 800004,
              title: "Water Lilies 5",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800004.jpg"
            },
            {
              objectId: 800005,
              title: "Water Lilies 6",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800005.jpg"
            },
            {
              objectId: 800006,
              title: "Water Lilies 7",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800006.jpg"
            },
            {
              objectId: 800007,
              title: "Water Lilies 8",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800007.jpg"
            },
            {
              objectId: 800008,
              title: "Water Lilies 9",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800008.jpg"
            },
            {
              objectId: 800009,
              title: "Water Lilies 10",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800009.jpg"
            },
            {
              objectId: 800010,
              title: "Water Lilies 11",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800010.jpg"
            },
            {
              objectId: 800011,
              title: "Water Lilies 12",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800011.jpg"
            },
            {
              objectId: 800012,
              title: "Water Lilies 13",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800012.jpg"
            },
            {
              objectId: 800013,
              title: "Water Lilies 14",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800013.jpg"
            },
            {
              objectId: 800014,
              title: "Water Lilies 15",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800014.jpg"
            },
            {
              objectId: 800015,
              title: "Water Lilies 16",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800015.jpg"
            },
            {
              objectId: 800016,
              title: "Water Lilies 17",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800016.jpg"
            },
            {
              objectId: 800017,
              title: "Water Lilies 18",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800017.jpg"
            },
            {
              objectId: 800018,
              title: "Water Lilies 19",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800018.jpg"
            },
            {
              objectId: 800019,
              title: "Water Lilies 20",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800019.jpg"
            },
            {
              objectId: 800020,
              title: "Water Lilies 21",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800020.jpg"
            },
            {
              objectId: 800021,
              title: "Water Lilies 22",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800021.jpg"
            },
            {
              objectId: 800022,
              title: "Water Lilies 23",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800022.jpg"
            },
            {
              objectId: 800023,
              title: "Water Lilies 24",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800023.jpg"
            },
            {
              objectId: 800024,
              title: "Water Lilies 25",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800024.jpg"
            },
            {
              objectId: 800025,
              title: "Water Lilies 26",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800025.jpg"
            },
            {
              objectId: 800026,
              title: "Water Lilies 27",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800026.jpg"
            },
            {
              objectId: 800027,
              title: "Water Lilies 28",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800027.jpg"
            },
            {
              objectId: 800028,
              title: "Water Lilies 29",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800028.jpg"
            },
            {
              objectId: 800029,
              title: "Water Lilies 30",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800029.jpg"
            },
            {
              objectId: 800030,
              title: "Water Lilies 31",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800030.jpg"
            },
            {
              objectId: 800031,
              title: "Water Lilies 32",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800031.jpg"
            },
            {
              objectId: 800032,
              title: "Water Lilies 33",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800032.jpg"
            },
            {
              objectId: 800033,
              title: "Water Lilies 34",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800033.jpg"
            },
            {
              objectId: 800034,
              title: "Water Lilies 35",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800034.jpg"
            },
            {
              objectId: 800035,
              title: "Water Lilies 36",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800035.jpg"
            },
            {
              objectId: 800036,
              title: "Water Lilies 37",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800036.jpg"
            },
            {
              objectId: 800037,
              title: "Water Lilies 38",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800037.jpg"
            },
            {
              objectId: 800038,
              title: "Water Lilies 39",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800038.jpg"
            },
            {
              objectId: 800039,
              title: "Water Lilies 40",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800039.jpg"
            },
            {
              objectId: 800040,
              title: "Water Lilies 41",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800040.jpg"
            },
            {
              objectId: 800041,
              title: "Water Lilies 42",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800041.jpg"
            },
            {
              objectId: 800042,
              title: "Water Lilies 43",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800042.jpg"
            },
            {
              objectId: 800043,
              title: "Water Lilies 44",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800043.jpg"
            },
            {
              objectId: 800044,
              title: "Water Lilies 45",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800044.jpg"
            },
            {
              objectId: 800045,
              title: "Water Lilies 46",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800045.jpg"
            },
            {
              objectId: 800046,
              title: "Water Lilies 47",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800046.jpg"
            },
            {
              objectId: 800047,
              title: "Water Lilies 48",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800047.jpg"
            },
            {
              objectId: 800048,
              title: "Water Lilies 49",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800048.jpg"
            },
            {
              objectId: 800049,
              title: "Water Lilies 50",
              artist: "Claude Monet",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/800049.jpg"
            }
          ]
        },
        {
          artist: "Vincent van Gogh",
          works: [
            {
              objectId: 810000,
              title: "Sunflowers",
              artist: "Vincent van Gogh",
              imageUrl: "https://images.metmuseum.org/CRDImages/test/web-large/810000.jpg"
            }
          ]
        }
      ]
    });
  });

  test("loadCuratedArtistGroups exposes the default curated corpus as 12 artists with 50 works each", () => {
    const result = loadCuratedArtistGroups();

    expect(result.artists).toHaveLength(12);
    expect(result.artists.every((artistGroup) => Array.isArray(artistGroup.works))).toBe(true);
    expect(result.artists.every((artistGroup) => artistGroup.works.length === 50)).toBe(true);
    expect(result.artists.flatMap((artistGroup) => artistGroup.works)).toHaveLength(600);
  });

  test("loadCuratedArtistIndex uses the requested curated artist list in order", () => {
    expect(loadCuratedArtistIndex()).toEqual({
      results: [
        {
          artist: "Vincent van Gogh",
          artistSlug: "vincent-van-gogh",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/436524/preview",
          workCount: 50
        },
        {
          artist: "Francisco Goya",
          artistSlug: "francisco-goya",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/333780/preview",
          workCount: 50
        },
        {
          artist: "Rembrandt",
          artistSlug: "rembrandt",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/334627/preview",
          workCount: 50
        },
        {
          artist: "Camille Pissarro",
          artistSlug: "camille-pissarro",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/339645/preview",
          workCount: 50
        },
        {
          artist: "Edgar Degas",
          artistSlug: "edgar-degas",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/196442/preview",
          workCount: 50
        },
        {
          artist: "Paul Cézanne",
          artistSlug: "paul-cezanne",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/334173/preview",
          workCount: 50
        },
        {
          artist: "Édouard Manet",
          artistSlug: "edouard-manet",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/334638/preview",
          workCount: 50
        },
        {
          artist: "Katsushika Hokusai",
          artistSlug: "katsushika-hokusai",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/36483/preview",
          workCount: 50
        },
        {
          artist: "Utagawa Hiroshige",
          artistSlug: "utagawa-hiroshige",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/36461/preview",
          workCount: 50
        },
        {
          artist: "Albrecht Dürer",
          artistSlug: "albrecht-durer",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/193491/preview",
          workCount: 50
        },
        {
          artist: "Winslow Homer",
          artistSlug: "winslow-homer",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/11109/preview",
          workCount: 50
        },
        {
          artist: "John Singer Sargent",
          artistSlug: "john-singer-sargent",
          imageUrl: "https://collectionapi.metmuseum.org/api/collection/v1/iiif/12127/preview",
          workCount: 50
        }
      ]
    });
  });
});
