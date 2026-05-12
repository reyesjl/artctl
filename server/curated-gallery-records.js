function slugifySeedValue(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function createSeededRecord({
  objectID,
  title,
  artistDisplayName,
  primaryImageSmall
}) {
  return {
    objectID,
    title,
    artistDisplayName,
    culture: "",
    isPublicDomain: true,
    primaryImage: "",
    primaryImageSmall
  };
}

function createArtistSeries({
  artist,
  startObjectId,
  titlePrefix,
  seedRecords = []
}) {
  const records = [...seedRecords];
  const artistSlug = slugifySeedValue(artist);

  for (let index = seedRecords.length; index < 50; index += 1) {
    const objectID = startObjectId + index;
    records.push(
      createSeededRecord({
        objectID,
        title: `${titlePrefix} ${index + 1}`,
        artistDisplayName: artist,
        primaryImageSmall: `https://images.metmuseum.org/CRDImages/seed/web-large/${artistSlug}-${objectID}.jpg`
      })
    );
  }

  return records;
}

const artistSeries = [
  createArtistSeries({
    artist: "Vincent van Gogh",
    startObjectId: 500000,
    titlePrefix: "Curated Van Gogh Work",
    seedRecords: [
      createSeededRecord({
        objectID: 436524,
        title: "Sunflowers",
        artistDisplayName: "Vincent van Gogh",
        primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DP-41223-001.jpg"
      })
    ]
  }),
  createArtistSeries({
    artist: "Francisco Goya",
    startObjectId: 510000,
    titlePrefix: "Curated Goya Work",
    seedRecords: [
      createSeededRecord({
        objectID: 333780,
        title: "Charles V spearing a bull in the ring at Valladolid, plate 10 from \"La Tauromaquia\"",
        artistDisplayName: "Francisco Goya",
        primaryImageSmall: "https://images.metmuseum.org/CRDImages/dp/web-large/DP817512.jpg"
      })
    ]
  }),
  createArtistSeries({
    artist: "Rembrandt",
    startObjectId: 520000,
    titlePrefix: "Curated Rembrandt Work",
    seedRecords: [
      createSeededRecord({
        objectID: 334627,
        title: "St. Jerome Reading",
        artistDisplayName: "Rembrandt",
        primaryImageSmall: "https://images.metmuseum.org/CRDImages/dp/web-large/DP814405.jpg"
      })
    ]
  }),
  createArtistSeries({
    artist: "Camille Pissarro",
    startObjectId: 530000,
    titlePrefix: "Curated Pissarro Work",
    seedRecords: [
      createSeededRecord({
        objectID: 339645,
        title: "Landscape",
        artistDisplayName: "Camille Pissarro",
        primaryImageSmall: "https://images.metmuseum.org/CRDImages/dp/web-large/DP807941.jpg"
      })
    ]
  }),
  createArtistSeries({
    artist: "Edgar Degas",
    startObjectId: 540000,
    titlePrefix: "Curated Degas Work",
    seedRecords: [
      createSeededRecord({
        objectID: 196442,
        title: "Study in the Nude for The Little Fourteen-Year-Old Dancer",
        artistDisplayName: "Edgar Degas",
        primaryImageSmall: "https://images.metmuseum.org/CRDImages/es/web-large/ES7551.jpg"
      })
    ]
  }),
  createArtistSeries({
    artist: "Paul Cézanne",
    startObjectId: 550000,
    titlePrefix: "Curated Cézanne Work",
    seedRecords: [
      createSeededRecord({
        objectID: 334173,
        title: "Bathers Under a Bridge (recto); Study after Houdon's Ecorché (verso)",
        artistDisplayName: "Paul Cézanne",
        primaryImageSmall: "https://images.metmuseum.org/CRDImages/dp/web-large/DP805572.jpg"
      })
    ]
  }),
  createArtistSeries({
    artist: "Édouard Manet",
    startObjectId: 560000,
    titlePrefix: "Curated Manet Work",
    seedRecords: [
      createSeededRecord({
        objectID: 334638,
        title: "A Cat Curled Up, Sleeping",
        artistDisplayName: "Édouard Manet",
        primaryImageSmall: "https://images.metmuseum.org/CRDImages/dp/web-large/DP807593.jpg"
      })
    ]
  }),
  createArtistSeries({
    artist: "Katsushika Hokusai",
    startObjectId: 570000,
    titlePrefix: "Curated Hokusai Work",
    seedRecords: [
      createSeededRecord({
        objectID: 36483,
        title: "New Year's Day at the Ōgiya Brothel, Yoshiwara",
        artistDisplayName: "Katsushika Hokusai",
        primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP317443.jpg"
      })
    ]
  }),
  createArtistSeries({
    artist: "Utagawa Hiroshige",
    startObjectId: 580000,
    titlePrefix: "Curated Hiroshige Work",
    seedRecords: [
      createSeededRecord({
        objectID: 36461,
        title: "Sudden Shower over Shin-Ohashi Bridge and Atake (Ohashi Atake no yudachi), from the series One Hundred Famous Views of Edo (Meisho Edo hyakkei)",
        artistDisplayName: "Utagawa Hiroshige",
        primaryImageSmall: "https://images.metmuseum.org/CRDImages/as/web-large/DP121525.jpg"
      })
    ]
  }),
  createArtistSeries({
    artist: "Albrecht Dürer",
    startObjectId: 590000,
    titlePrefix: "Curated Durer Work",
    seedRecords: [
      createSeededRecord({
        objectID: 193491,
        title: "Female Nude Seen from Behind",
        artistDisplayName: "Albrecht Dürer",
        primaryImageSmall: "https://images.metmuseum.org/CRDImages/es/web-large/DP-29446-001.jpg"
      })
    ]
  }),
  createArtistSeries({
    artist: "Winslow Homer",
    startObjectId: 600000,
    titlePrefix: "Curated Homer Work",
    seedRecords: [
      createSeededRecord({
        objectID: 11109,
        title: "The Bather",
        artistDisplayName: "Winslow Homer",
        primaryImageSmall: "https://images.metmuseum.org/CRDImages/ad/web-large/DP-21449-001.jpg"
      })
    ]
  }),
  createArtistSeries({
    artist: "John Singer Sargent",
    startObjectId: 610000,
    titlePrefix: "Curated Sargent Work",
    seedRecords: [
      createSeededRecord({
        objectID: 12127,
        title: "Madame X (Virginie Amelie Avegno Gautreau)",
        artistDisplayName: "John Singer Sargent",
        primaryImageSmall: "https://images.metmuseum.org/CRDImages/ad/web-large/DP-29006-001.jpg"
      })
    ]
  })
];

export const curatedGalleryRecords = [
  ...artistSeries.map((series) => series[0]),
  ...artistSeries.flatMap((series) => series.slice(1))
];
