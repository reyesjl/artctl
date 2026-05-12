import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

export function AdminGalleryPage({
  apiBaseUrl = "",
  fetchImpl = fetch,
  title = "Homepage Gallery"
}) {
  const { groupSlug = "homepage" } = useParams();
  const [results, setResults] = useState([]);
  const [objectIdInput, setObjectIdInput] = useState("");
  const [draggedObjectId, setDraggedObjectId] = useState(null);
  const [dropTargetObjectId, setDropTargetObjectId] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("loading");
  const [pageTitle, setPageTitle] = useState(title);

  const galleryApiPath =
    groupSlug === "homepage"
      ? `${apiBaseUrl}/api/admin/gallery`
      : `${apiBaseUrl}/api/admin/gallery?groupSlug=${encodeURIComponent(groupSlug)}`;

  useEffect(() => {
    let cancelled = false;

    async function loadAdminGallery() {
      setStatus("loading");
      setError("");

      try {
        const [galleryResponse, groupsResponse] = await Promise.all([
          fetchImpl(galleryApiPath),
          fetchImpl(`${apiBaseUrl}/api/admin/curated-groups`)
        ]);
        const [galleryData, groupsData] = await Promise.all([
          galleryResponse.json(),
          groupsResponse.json()
        ]);

        if (cancelled) {
          return;
        }

        if (!galleryResponse.ok || !groupsResponse.ok) {
          setResults([]);
          setError(
            galleryData.error || groupsData.error || "Unable to load admin gallery."
          );
          setStatus("error");
          return;
        }

        setResults(galleryData.results ?? []);
        setPageTitle(
          (groupsData.results ?? []).find((group) => group.slug === groupSlug)?.name ?? title
        );
        setStatus("success");
      } catch (loadError) {
        if (!cancelled) {
          setResults([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to load admin gallery.");
          setStatus("error");
        }
      }
    }

    loadAdminGallery();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, fetchImpl, galleryApiPath, groupSlug, title]);

  async function handleSubmit(event) {
    event.preventDefault();

    const objectIds = objectIdInput
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (objectIds.length === 0) {
      return;
    }

    setError("");

    try {
      const addedItems = [];

      for (const objectId of objectIds) {
        const response = await fetchImpl(`${apiBaseUrl}/api/admin/gallery`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ objectId, groupSlug })
        });
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Unable to add to admin gallery.");
          return;
        }

        addedItems.push(data.item);
      }

      setObjectIdInput("");
      setResults((currentResults) => [...currentResults, ...addedItems]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add to admin gallery.");
    }
  }

  async function handleRemove(objectId) {
    setError("");

    try {
      const removeApiPath =
        groupSlug === "homepage"
          ? `${apiBaseUrl}/api/admin/gallery/${objectId}`
          : `${apiBaseUrl}/api/admin/gallery/${objectId}?groupSlug=${encodeURIComponent(groupSlug)}`;
      const response = await fetchImpl(removeApiPath, { method: "DELETE" });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to remove from admin gallery.");
        return;
      }

      setResults((currentResults) =>
        currentResults
          .filter((item) => item.objectId !== objectId)
          .map((item, index) => ({
            ...item,
            position: index + 1
          }))
      );
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : "Unable to remove from admin gallery."
      );
    }
  }

  async function handleDrop(targetObjectId) {
    if (draggedObjectId == null || draggedObjectId === targetObjectId) {
      setDraggedObjectId(null);
      setDropTargetObjectId(null);
      return;
    }

    setError("");

    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/admin/gallery/reorder`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          objectId: draggedObjectId,
          targetObjectId,
          groupSlug
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to reorder admin gallery.");
        return;
      }

      setResults(data.results ?? []);
    } catch (dropError) {
      setError(dropError instanceof Error ? dropError.message : "Unable to reorder admin gallery.");
    } finally {
      setDraggedObjectId(null);
      setDropTargetObjectId(null);
    }
  }

  async function handleHydrate(objectId) {
    setError("");

    try {
      const hydrateApiPath =
        groupSlug === "homepage"
          ? `${apiBaseUrl}/api/admin/gallery/${objectId}/hydrate`
          : `${apiBaseUrl}/api/admin/gallery/${objectId}/hydrate?groupSlug=${encodeURIComponent(groupSlug)}`;
      const response = await fetchImpl(hydrateApiPath, { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to hydrate admin gallery item.");
        return;
      }

      setResults((currentResults) =>
        currentResults.map((item) =>
          item.objectId === objectId
            ? {
                ...item,
                ...data.item
              }
            : item
        )
      );
    } catch (hydrateError) {
      setError(
        hydrateError instanceof Error
          ? hydrateError.message
          : "Unable to hydrate admin gallery item."
      );
    }
  }

  return (
    <RouteFrame maxWidthClassName="max-w-7xl">
      <div aria-level="1" role="heading" className="m-0 text-lg font-semibold">
        {pageTitle}
      </div>
      <form className="grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={handleSubmit}>
        <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="admin-gallery-object-id">
          Object ID
          <input
            id="admin-gallery-object-id"
            className="min-h-10 appearance-none border border-input border-solid bg-secondary px-3 py-2 text-foreground shadow-none"
            name="objectId"
            type="text"
            value={objectIdInput}
            onChange={(event) => setObjectIdInput(event.target.value)}
          />
        </label>
        <button
          aria-label="Add to Gallery"
          className="text-action self-end"
          type="submit"
        >
          [add]
        </button>
      </form>
      {status === "loading" ? <p>Loading curated gallery…</p> : null}
      {status === "error" ? <p>{error}</p> : null}
      {status === "success" && results.length === 0 ? <p>No curated gallery entries yet.</p> : null}
      {status === "success" && results.length > 0 ? (
        <>
          <p>Drag a card onto another card to reorder the curated gallery.</p>
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-4">
            {results.map((item) => (
              <li
                key={item.objectId}
                className={[
                  "overflow-hidden border border-border bg-card text-card-foreground",
                  dropTargetObjectId === item.objectId ? "admin-gallery-drop-target" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                draggable
                onDragStart={() => setDraggedObjectId(item.objectId)}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draggedObjectId != null && draggedObjectId !== item.objectId) {
                    setDropTargetObjectId(item.objectId);
                  }
                }}
                onDragLeave={() => {
                  if (dropTargetObjectId === item.objectId) {
                    setDropTargetObjectId(null);
                  }
                }}
                onDrop={() => {
                  void handleDrop(item.objectId);
                }}
              >
                {item.imageUrl ? (
                  <img
                    className="block aspect-[4/3] w-full object-cover"
                    src={item.imageUrl}
                    alt={item.title}
                  />
                ) : (
                  <div className="block aspect-[4/3] w-full bg-muted" />
                )}
                <div className="grid gap-1 p-3">
                  <p className="text-xs text-muted-foreground">
                    {dropTargetObjectId === item.objectId ? "Drop here" : "Drag to reorder"}
                  </p>
                  <strong>{item.title}</strong>
                  <p>{item.artist}</p>
                  <p>{`${item.position} · ${item.objectId} · ${item.hydrationStatus}`}</p>
                  {item.hydrationStatus !== "hydrated" ? (
                    <button
                      aria-label={`Hydrate ${item.title}`}
                      className="text-action justify-self-start"
                      type="button"
                      onClick={() => handleHydrate(item.objectId)}
                    >
                      [hydrate]
                    </button>
                  ) : null}
                  <button
                    aria-label={`Remove ${item.title}`}
                    className="text-action justify-self-start"
                    type="button"
                    onClick={() => handleRemove(item.objectId)}
                  >
                    [remove]
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </RouteFrame>
  );
}
