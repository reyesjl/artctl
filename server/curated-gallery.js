import { curatedGalleryRecords } from "./curated-gallery-records.js";

export const defaultCuratedGalleryBatchSize = 24;
export const defaultCuratedArtistCount = 12;

function normalizeArtist(record) {
  return record.artistDisplayName || record.culture || "Unknown";
}

function isViewableCuratedRecord(record) {
  return (
    record?.objectID &&
    record?.title &&
    Boolean(record.primaryImageSmall || record.primaryImage) &&
    record.isPublicDomain !== false
  );
}

function normalizeCuratedGalleryRecord(record) {
  return {
    objectId: record.objectID,
    title: record.title,
    artist: normalizeArtist(record),
    imageUrl: record.primaryImageSmall || record.primaryImage || ""
  };
}

function buildIiifPreviewUrl(objectId) {
  return `https://collectionapi.metmuseum.org/api/collection/v1/iiif/${objectId}/preview`;
}

function slugifyArtist(artist) {
  return artist
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function loadCuratedGalleryPage({
  records = curatedGalleryRecords,
  batchSize = defaultCuratedGalleryBatchSize
} = {}) {
  return {
    results: records
      .filter(isViewableCuratedRecord)
      .map(normalizeCuratedGalleryRecord)
      .slice(0, batchSize)
  };
}

export function loadCuratedArtistGroups({
  records = curatedGalleryRecords,
  worksPerArtist = 50
} = {}) {
  const groupedArtists = new Map();

  for (const record of records) {
    if (!isViewableCuratedRecord(record)) {
      continue;
    }

    const normalizedRecord = normalizeCuratedGalleryRecord(record);
    const artistGroup = groupedArtists.get(normalizedRecord.artist) ?? {
      artist: normalizedRecord.artist,
      works: []
    };

    if (artistGroup.works.length < worksPerArtist) {
      artistGroup.works.push(normalizedRecord);
    }

    groupedArtists.set(normalizedRecord.artist, artistGroup);
  }

  return {
    artists: Array.from(groupedArtists.values())
  };
}

export function loadCuratedArtistIndex({
  records = curatedGalleryRecords,
  artistCount = defaultCuratedArtistCount,
  worksPerArtist = 50
} = {}) {
  return {
    results: loadCuratedArtistGroups({ records, worksPerArtist })
      .artists
      .slice(0, artistCount)
      .map((artistGroup) => ({
        artist: artistGroup.artist,
        artistSlug: slugifyArtist(artistGroup.artist),
        imageUrl: artistGroup.works[0]?.objectId
          ? buildIiifPreviewUrl(artistGroup.works[0].objectId)
          : "",
        workCount: artistGroup.works.length
      }))
  };
}

export function loadCuratedArtistGallery({
  artistSlug,
  records = curatedGalleryRecords,
  worksPerArtist = 50
} = {}) {
  const artistGroup = loadCuratedArtistGroups({ records, worksPerArtist }).artists.find(
    (group) => slugifyArtist(group.artist) === artistSlug
  );

  if (!artistGroup) {
    return null;
  }

  return {
    artist: artistGroup.artist,
    artistSlug,
    results: artistGroup.works
  };
}
