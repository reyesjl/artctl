## Problem Statement

ARTCTL needs a focused MVP definition for a simple client-rendered art inspection app. The previous PRD was built around SSR, crawlability, canonical routes, local corpus management, and broader platform concerns that do not match the current product direction. Without a new PRD, implementation will drift back toward unnecessary complexity instead of staying centered on the actual user flow: browse a gallery, search The Met, open a work, inspect it closely, switch analysis views, and understand how to use the app.

## Solution

Build ARTCTL as a React single-page application powered by Vite, with a separate Express backend that serves ARTCTL-specific API endpoints and integrates with The Met Collection API. The app is explicitly Met-only in MVP. The homepage is a live gallery of highlighted public-domain Met works with deterministic ordering and backend-owned shuffle. Search is a dedicated route backed live by The Met API through Express. Work viewer routes are client-rendered, image-first, and support pan/zoom plus browser-side analysis modes for close inspection. The interface is minimal, terminal-style, and themeable through a dedicated themes route.

## Style guidelines
This repo uses the default style guidelines. See `docs/agents/style-guidelines.md`.

## User Stories

1. As a visitor, I want the app to open directly into a gallery, so that I can start exploring immediately.
2. As a visitor, I want the homepage to clearly state that it shows The Met's highlighted works, so that the source and curation rule are obvious.
3. As a visitor, I want the homepage gallery to use a deterministic order, so that the collection feels coherent and repeatable.
4. As a visitor, I want to load more works in-place, so that gallery browsing feels continuous inside the app.
5. As a visitor, I want a shuffle action that starts a new gallery order, so that I can re-explore the same eligible pool differently.
6. As a visitor, I want the shuffled gallery order to remain stable within my session, so that returning from a work does not break my place.
7. As a visitor, I want opening a work to use normal link behavior, so that navigation remains robust and understandable.
8. As a visitor, I want browser back to return me to my prior gallery or search state, so that inspection does not interrupt browsing flow.
9. As a visitor, I want each work to have a real route, so that refresh and direct entry work normally.
10. As a visitor, I want a dedicated search page, so that I can look beyond the homepage gallery.
11. As a visitor, I want search to require a query before results are fetched, so that the app does not pretend to support generic faceted browsing.
12. As a visitor, I want search state to persist in the URL, so that refresh and return preserve my exact results context.
13. As a visitor, I want a small number of useful museum-native filters, so that search stays simple.
14. As a visitor, I want every search result to open into the same viewer flow, so that ARTCTL feels like one product rather than a partial wrapper.
15. As a visitor, I want the viewer to show the best available image for a work, so that close inspection is worthwhile.
16. As a visitor, I want pan and zoom in the viewer, so that I can inspect a work in detail.
17. As a visitor, I want to switch among a small set of analysis views, so that I can study structure and detail in different ways.
18. As a visitor, I want analysis views to be computed in the browser, so that the app stays visually interactive without requiring a server-side image pipeline.
19. As a visitor, I want the viewer to include compact work metadata and a Met link, so that I can understand what I am seeing and reach the museum source.
20. As a visitor, I want a help page that explains how to use the app, what it is for, and where the works come from.
21. As a visitor, I want a dedicated themes page, so that I can preview and choose among built-in terminal-adjacent themes.
22. As a returning visitor, I want my chosen theme to persist locally, so that the app respects my visual preference.
23. As a visitor, I want the app shell navigation to stay visible on every route, so that I can move cleanly among gallery, search, help, and themes.
24. As a keyboard user, I want number-key shortcuts for viewer modes, so that the terminal-style UI has meaningful keyboard support.
25. As a maintainer, I want the Express backend to shield the client from Met API inconsistencies and response quirks, so that the React app stays simple and stable.

## Product Surfaces

- `/` is the homepage gallery.
- `/search` is the live Met-backed search surface.
- `/works/:objectId` is the viewer and detail route for a single Met object.
- `/help` explains usage, purpose, provenance, and analysis views.
- `/themes` is the theme preview and selection surface.

## Implementation Decisions

- Product architecture:
  - ARTCTL is a React SPA built with Vite.
  - Express is a separate backend deployable.
  - The React client talks only to Express.
  - Express talks to The Met Collection API and exposes ARTCTL-specific endpoints.
  - The app is explicitly Met-only in MVP.

- App shell and navigation:
  - The persistent top-level navigation is `Gallery`, `Search`, `Help`, and `Themes`.
  - The app shell remains visible on all routes, including viewer routes.
  - The gallery is the homepage at `/`; there is no separate marketing landing page.

- Homepage gallery:
  - The homepage gallery is sourced live from The Met.
  - Eligibility requires highlighted, public-domain works with usable images.
  - Express fetches the eligible ID pool first, then hydrates object details in batches for the requested gallery page.
  - Deterministic ordering is Met object ID ascending.
  - The UI uses incremental `Load More`.
  - Each batch contains 24 works.
  - Shuffle replaces the current gallery from the top with a newly seeded order.
  - Shuffle is reproducible within the current session.
  - The homepage URL carries the current gallery extent and shuffle seed, including at least `page` and `shuffle`.
  - If the upstream request fails, the homepage shows a failure state with retry rather than cached fallback content.

- Search:
  - Search is a dedicated route at `/search`.
  - The route may render an empty state before a query is submitted.
  - A query is required before results are fetched.
  - Search state lives in the URL, including query, filters, and page.
  - Search uses explicit pages rather than `Load More`.
  - Each search page contains 24 results.
  - Search is live against The Met API through Express rather than backed by a local search corpus.
  - Search remains mostly aligned with The Met API's retrieval behavior, with ARTCTL applying only thin shaping and filtering.
  - MVP search filters are `Department` and `Medium`.
  - `Department` options are fetched from The Met departments endpoint.
  - `Medium` options are curated statically in ARTCTL.
  - Express skips invalid hydrated objects and backfills the requested page when possible.

- Viewer and detail:
  - Each work route uses the Met object ID directly: `/works/:objectId`.
  - Work detail data is fetched through Express, not directly from the browser to The Met.
  - Express returns a thin normalized ARTCTL response shape rather than the raw upstream object payload.
  - A work is considered viewable if either `primaryImage` or `primaryImageSmall` exists.
  - The viewer prefers `primaryImage` and falls back to `primaryImageSmall`.
  - Direct entry to a viewer route must work without prior app history.
  - The viewer is image-first and includes pan/zoom.
  - Browser back/history is the primary exact-return mechanism for gallery and search state restoration.
  - There is no dedicated viewer-local back action in MVP.
  - The viewer includes a compact metadata panel outside the image area.
  - The metadata panel includes title, artist/culture fallback, date, concise object context, and an outbound Met link.
  - The Met link lives inside the metadata panel rather than as a primary CTA.

- Analysis views:
  - Analysis is computed entirely in the browser.
  - MVP analysis views are `Edges`, `Detail`, and `Composition`.
  - Analysis views replace the main image while active rather than overlaying it.
  - Full-resolution analysis is allowed in MVP, with the known risk of slower performance or degraded behavior on some devices.
  - Desktop and laptop are the primary target devices for the full viewer workflow; mobile may be degraded.
  - No timeout- or failure-based layer disabling behavior is required in MVP.
  - Viewer keyboard support is limited to number keys for mode switching:
    - `1` original
    - `2` edges
    - `3` detail
    - `4` composition

- Card design:
  - Gallery and search use the same card-image treatment.
  - Card previews may be cropped to support a tighter, more uniform grid.
  - Card metadata lives below the image area.
  - Each card shows the title plus one secondary line.
  - The secondary line fallback order is `artist -> culture -> date`.

- Help:
  - The help page includes usage guidance, product purpose, and provenance.
  - The help page explains the analysis views.
  - Viewer routes do not need to repeat layer explanations inline.

- Themes:
  - Theme selection happens only on `/themes`.
  - `/themes` is both the live preview surface and the actual selection page.
  - The app shell includes a visible `Themes` link rather than an inline quick picker.
  - Theme selection persists locally in the browser only.
  - Theme is not encoded into gallery, search, or viewer route state.
  - Theme is implemented through shared global tokens across all routes.
  - MVP includes six built-in themes:
    - `Dark`
    - `Light`
    - `Amber`
    - `Blue`
    - `Tan`
    - `Green`
  - Each theme should have a clear, restrained terminal-adjacent identity appropriate for an art-viewing surface.

- Backend responsibility:
  - Express owns deterministic gallery ordering, seeded shuffle, page hydration, search result shaping, filter mapping, and thin response normalization.
  - Express explicitly shields the React client from Met API inconsistencies such as missing images, failed object hydration, and parameter quirks.

## Testing Decisions

- Good tests should target durable ARTCTL behavior rather than framework details.
- Modules and behaviors that should be tested:
  - Homepage gallery ordering, batching, and shuffle behavior.
  - URL-driven restoration of homepage gallery state.
  - Search query, filter, and pagination contracts.
  - Search-page backfilling when hydrated objects are invalid.
  - Thin normalization of Met object payloads into ARTCTL detail responses.
  - Viewer route handling for direct entry and image fallback behavior.
  - Browser-side analysis functions for `Edges`, `Detail`, and `Composition`.
  - Theme persistence and route-global theme application.

## Out of Scope

- SSR of any product surface.
- Canonical-link work, SEO metadata, sitemaps, or search-engine discoverability goals.
- No-JavaScript support.
- SQLite or any other local search corpus source of truth.
- Local normalized multi-source data architecture.
- Future multi-source support in MVP.
- CLI ingestion, refresh, inspect, or operational tooling.
- Analytics or event tracking.
- User accounts, favorites, saved works, or personal history.
- Social features or sharing systems beyond normal route URLs.
- A generic proxy API that mirrors The Met endpoint structure directly.
- Rich search controls beyond query, `Department`, and `Medium`.
- Additional analysis views beyond `Edges`, `Detail`, and `Composition`.
- Graceful performance fallback systems for heavy browser-side analysis.
- User-defined custom themes.

## Further Notes

- ARTCTL is an art inspection tool first, not a general museum website.
- The homepage should begin with the gallery rather than a hero or marketing treatment.
- The terminal-style UI should remain restrained and structural rather than theatrical.
- Theme is one of the primary expressive parts of the product, but it should never overpower the artwork.
- The largest explicit MVP risk is full-resolution browser-side analysis without a graceful degradation path. The PRD should treat that as a conscious tradeoff rather than an accidental implementation detail.
