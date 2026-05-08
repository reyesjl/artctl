const metApiBaseUrl = "https://collectionapi.metmuseum.org/public/collection/v1";

function normalizeSearchResult(object) {
  return {
    objectId: object.objectID,
    title: object.title,
    artist: object.artistDisplayName || object.culture || "Unknown",
    date: object.objectDate || "Date unknown",
    imageUrl: object.primaryImageSmall || object.primaryImage || ""
  };
}

export function createMetApiClient({ fetchImpl = fetch } = {}) {
  return {
    async searchCollection(query) {
      const searchUrl = new URL(`${metApiBaseUrl}/search`);
      searchUrl.searchParams.set("hasImages", "true");
      searchUrl.searchParams.set("q", query);

      const searchResponse = await fetchImpl(searchUrl);
      const searchPayload = await searchResponse.json();
      const objectIds = searchPayload.objectIDs?.slice(0, 12) ?? [];

      if (objectIds.length === 0) {
        return { query, results: [] };
      }

      const objectPayloads = await Promise.all(
        objectIds.map(async (objectId) => {
          const objectResponse = await fetchImpl(`${metApiBaseUrl}/objects/${objectId}`);
          return objectResponse.json();
        })
      );

      return {
        query,
        results: objectPayloads
          .filter((object) => object?.objectID && object?.title)
          .map(normalizeSearchResult)
      };
    }
  };
}
