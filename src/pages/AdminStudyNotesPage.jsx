import { useEffect, useState } from "react";
import { RouteFrame } from "../components/RouteFrame.jsx";

export function AdminStudyNotesPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [studyNotes, setStudyNotes] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("loading");
  const [refreshingObjectIds, setRefreshingObjectIds] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadStudyNotes() {
      setStatus("loading");
      setError("");

      try {
        const response = await fetchImpl(`${apiBaseUrl}/api/admin/study-notes`);
        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setStudyNotes([]);
          setError(data.error || "Unable to load study notes.");
          setStatus("error");
          return;
        }

        setStudyNotes(data.results ?? []);
        setStatus("success");
      } catch (loadError) {
        if (!cancelled) {
          setStudyNotes([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to load study notes.");
          setStatus("error");
        }
      }
    }

    loadStudyNotes();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, fetchImpl]);

  async function handleRefreshStudyNote(objectId) {
    setError("");
    setRefreshingObjectIds((currentIds) => currentIds.concat(objectId));

    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/admin/works/${objectId}/ai-info/refresh`, {
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to refresh study note.");
        return;
      }

      setStudyNotes((currentStudyNotes) =>
        currentStudyNotes.map((studyNote) =>
          studyNote.objectId === objectId
            ? {
                ...studyNote,
                observe: data.note.observe,
                context: data.note.context,
                technique: data.note.technique,
                sources: data.note.sources,
                updatedAt: new Date().toISOString()
              }
            : studyNote
        )
      );
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh study note.");
    } finally {
      setRefreshingObjectIds((currentIds) => currentIds.filter((id) => id !== objectId));
    }
  }

  return (
    <RouteFrame>
      <div aria-level="1" role="heading" className="m-0 text-lg font-semibold">
        Study Notes
      </div>
      {status === "loading" ? <p>Loading study notes…</p> : null}
      {status === "error" ? <p>{error}</p> : null}
      {status === "success" && studyNotes.length === 0 ? <p>No study notes yet.</p> : null}
      {status === "success" && studyNotes.length > 0 ? (
        <div className="grid gap-3">
          {studyNotes.map((studyNote) => (
            <article
              key={studyNote.objectId}
              className="grid gap-2 border border-border bg-card p-3"
            >
              <div className="grid gap-1">
                <strong>{studyNote.title || `Work ${studyNote.objectId}`}</strong>
                <p className="m-0 text-sm text-muted-foreground">{studyNote.artist}</p>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{studyNote.model}</span>
                <span>{studyNote.promptVersion}</span>
              </div>
              <div className="grid gap-1 text-sm">
                <p className="m-0">{studyNote.observe}</p>
                <p className="m-0">{studyNote.context}</p>
                <p className="m-0">{studyNote.technique}</p>
              </div>
              <button
                type="button"
                className="justify-self-start text-action"
                aria-label={`Refresh study note for ${studyNote.title || `Work ${studyNote.objectId}`}`}
                disabled={refreshingObjectIds.includes(studyNote.objectId)}
                onClick={() => {
                  void handleRefreshStudyNote(studyNote.objectId);
                }}
              >
                {refreshingObjectIds.includes(studyNote.objectId) ? "[refreshing]" : "[refresh]"}
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </RouteFrame>
  );
}
