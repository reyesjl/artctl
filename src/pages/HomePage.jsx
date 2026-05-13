import { useEffect, useState } from "react";
import { ExternalLink, ImagePlus, Share2 } from "lucide-react";
import { Link } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";
import { shareCurrentPage } from "../lib/share.js";

function isArtistSummary(item) {
  return typeof item?.artistSlug === "string";
}

function GalleryCard({ item }) {
  const [imageFailed, setImageFailed] = useState(false);
  const title = isArtistSummary(item) ? item.artist : item.title;
  const meta = isArtistSummary(item) ? `${item.workCount} works` : item.artist;
  const href = isArtistSummary(item) ? `/artists/${item.artistSlug}` : `/works/${item.objectId}`;
  const key = isArtistSummary(item) ? item.artistSlug : item.objectId;

  return (
    <li
      key={key}
      className="gallery-card overflow-hidden border border-solid border-border bg-card transition-colors hover:border-primary focus-within:border-primary active:border-primary"
    >
      <Link className="block h-full" to={href}>
        <figure className="gallery-card-media m-0 bg-secondary">
          {item.imageUrl && !imageFailed ? (
            <img
              className="gallery-card-image block aspect-[4/3] w-full object-cover"
              src={item.imageUrl}
              alt={title}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="gallery-card-image gallery-card-image-placeholder block aspect-[4/3] w-full bg-muted" />
          )}
        </figure>
        <div className="gallery-card-copy grid gap-1 p-3">
          <strong className="gallery-card-title line-clamp-2 text-sm text-foreground">{title}</strong>
          <p className="gallery-card-meta text-xs text-muted-foreground">{meta}</p>
        </div>
      </Link>
    </li>
  );
}

export function HomePage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [results, setResults] = useState([]);
  const [emptyState, setEmptyState] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("loading");
  const [isTaskNoticeVisible, setIsTaskNoticeVisible] = useState(true);
  const [isSuggestionModalOpen, setIsSuggestionModalOpen] = useState(false);
  const [suggestionArtist, setSuggestionArtist] = useState("");
  const [suggestionWorkName, setSuggestionWorkName] = useState("");
  const [suggestionCreditorName, setSuggestionCreditorName] = useState("");
  const [suggestionError, setSuggestionError] = useState("");
  const [suggestionStatus, setSuggestionStatus] = useState("idle");

  useEffect(() => {
    let cancelled = false;

    async function loadGallery() {
      setStatus("loading");
      setError("");

      try {
        const response = await fetchImpl(`${apiBaseUrl}/api/gallery`);
        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setResults([]);
          setEmptyState(null);
          setError(data.error || "Unable to load gallery.");
          setStatus("error");
          return;
        }

        setResults(data.results ?? []);
        setEmptyState(data.emptyState ?? null);
        setStatus("success");
      } catch (error) {
        if (!cancelled) {
          setResults([]);
          setEmptyState(null);
          setError(error instanceof Error ? error.message : "Unable to load gallery.");
          setStatus("error");
        }
      }
    }

    loadGallery();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, fetchImpl]);

  async function handleSuggestionSubmit(event) {
    event.preventDefault();
    setSuggestionError("");
    setSuggestionStatus("submitting");

    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/suggestions`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          artist: suggestionArtist,
          workName: suggestionWorkName,
          creditorName: suggestionCreditorName
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setSuggestionError(data.error || "Unable to submit suggestion.");
        setSuggestionStatus("idle");
        return;
      }

      setSuggestionArtist("");
      setSuggestionWorkName("");
      setSuggestionCreditorName("");
      setSuggestionStatus("idle");
      setIsSuggestionModalOpen(false);
    } catch (submitError) {
      setSuggestionError(
        submitError instanceof Error ? submitError.message : "Unable to submit suggestion."
      );
      setSuggestionStatus("idle");
    }
  }

  return (
    <RouteFrame maxWidthClassName="max-w-7xl">
      <section
        aria-label="Gallery notice"
        className="grid gap-2 border border-border bg-card p-3 text-sm text-foreground"
      >
        <p className="m-0">
          The homepage gallery rotates weekly from a gallery of 400k+ works.
        </p>
        <div className="flex flex-wrap items-center gap-5">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-primary"
            onClick={() => {
              void shareCurrentPage({
                title: "ARTCTL",
                text: "Explore this week’s ARTCTL gallery."
              });
            }}
          >
            <span>[Send to a Friend]</span>
            <Share2 className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-primary"
            onClick={() => {
              setSuggestionError("");
              setIsSuggestionModalOpen(true);
            }}
          >
            <span>[Suggest Art Work]</span>
            <ImagePlus className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </section>
      {isSuggestionModalOpen ? (
        <>
          <button
            type="button"
            aria-label="Close suggestion backdrop"
            className="fixed inset-0 z-40 bg-background/60"
            onClick={() => {
              setIsSuggestionModalOpen(false);
            }}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Suggest Art Work"
            className="fixed inset-x-3 top-20 z-50 mx-auto w-full max-w-md"
          >
            <form
              className="border border-border bg-card text-card-foreground px-3 py-3 space-y-2 text-sm font-mono"
              onSubmit={handleSuggestionSubmit}
            >
              <div>suggest art work</div>
              <label htmlFor="suggestion-artist" className="sr-only">
                Artist
              </label>
              <input
                id="suggestion-artist"
                name="artist"
                type="text"
                placeholder="artist"
                value={suggestionArtist}
                onChange={(event) => setSuggestionArtist(event.target.value)}
                className="w-full bg-transparent border border-border px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <label htmlFor="suggestion-work-name" className="sr-only">
                Work Name
              </label>
              <input
                id="suggestion-work-name"
                name="workName"
                type="text"
                placeholder="work name"
                value={suggestionWorkName}
                onChange={(event) => setSuggestionWorkName(event.target.value)}
                className="w-full bg-transparent border border-border px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <label htmlFor="suggestion-creditor-name" className="sr-only">
                Creditor Name
              </label>
              <input
                id="suggestion-creditor-name"
                name="creditorName"
                type="text"
                placeholder="creditor name (optional)"
                value={suggestionCreditorName}
                onChange={(event) => setSuggestionCreditorName(event.target.value)}
                className="w-full bg-transparent border border-border px-2 py-1 text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {suggestionError ? (
                <div role="alert" className="text-destructive">
                  {suggestionError}
                </div>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="text-muted-foreground hover:text-foreground"
                  disabled={suggestionStatus === "submitting"}
                >
                  [submit]
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setIsSuggestionModalOpen(false);
                  }}
                >
                  [cancel]
                </button>
              </div>
            </form>
          </section>
        </>
      ) : null}
      {status === "loading" ? <p>Loading gallery…</p> : null}
      {status === "error" ? <p>{error}</p> : null}
      {status === "success" && results.length === 0 && emptyState ? (
        <div className="grid gap-2">
          <p>{emptyState.title}</p>
          <p>{emptyState.message}</p>
        </div>
      ) : null}
      {status === "success" ? (
        <>
          <ul
            className="gallery-grid mt-4 grid list-none gap-4 p-0 sm:grid-cols-4"
            hidden={results.length === 0}
          >
            {results.map((item) => (
              <GalleryCard key={isArtistSummary(item) ? item.artistSlug : item.objectId} item={item} />
            ))}
          </ul>
          {isTaskNoticeVisible ? (
            <section
              aria-label="Task notice"
              className="mt-4 grid gap-2 border border-border bg-card p-3 text-sm text-foreground"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-1">
                  <p className="m-0 text-xs text-muted-foreground">[Related Project]</p>
                  <p className="m-0">A minimal task system for overloaded minds.</p>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss task notice"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => {
                    setIsTaskNoticeVisible(false);
                  }}
                >
                  [x]
                </button>
              </div>
              <a
                href="https://taskctl.net"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary"
              >
                <span>[taskctl.net]</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </section>
          ) : null}
        </>
      ) : null}
    </RouteFrame>
  );
}
