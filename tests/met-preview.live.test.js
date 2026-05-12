import { describe, expect, test } from "vitest";
import { loadCuratedArtistIndex } from "../server/curated-gallery.js";

const runLiveMetTests = process.env.RUN_LIVE_MET_TESTS === "1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("live Met preview URLs", () => {
  test.runIf(runLiveMetTests)(
    "curated artist preview URLs return fetchable image responses",
    { timeout: 30000 },
    async () => {
      const artistIndex = loadCuratedArtistIndex();

      expect(artistIndex.results).toHaveLength(12);

      for (const artistCard of artistIndex.results) {
        const response = await fetch(artistCard.imageUrl, {
          headers: {
            "User-Agent": "artctl-live-preview-test"
          }
        });

        expect(response.status, artistCard.artist).toBe(200);
        expect(response.headers.get("content-type"), artistCard.artist).toMatch(/^image\//);

        const imageBytes = await response.arrayBuffer();

        expect(imageBytes.byteLength, artistCard.artist).toBeGreaterThan(0);
        await sleep(1000);
      }
    }
  );
});
