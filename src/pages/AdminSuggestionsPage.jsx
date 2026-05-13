import { useEffect, useState } from "react";
import { RouteFrame } from "../components/RouteFrame.jsx";

export function AdminSuggestionsPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadSuggestions() {
      setStatus("loading");
      setError("");

      try {
        const response = await fetchImpl(`${apiBaseUrl}/api/admin/suggestions`);
        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setSuggestions([]);
          setError(data.error || "Unable to load artwork suggestions.");
          setStatus("error");
          return;
        }

        setSuggestions(data.results ?? []);
        setStatus("success");
      } catch (loadError) {
        if (!cancelled) {
          setSuggestions([]);
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load artwork suggestions."
          );
          setStatus("error");
        }
      }
    }

    loadSuggestions();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, fetchImpl]);

  async function handleDeleteSuggestion(id) {
    setError("");

    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/admin/suggestions/${id}`, {
        method: "DELETE"
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to delete artwork suggestion.");
        return;
      }

      setSuggestions((currentSuggestions) =>
        currentSuggestions.filter((suggestion) => suggestion.id !== id)
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete artwork suggestion."
      );
    }
  }

  return (
    <RouteFrame>
      <div aria-level="1" role="heading" className="m-0 text-lg font-semibold">
        Artwork Suggestions
      </div>
      {status === "loading" ? <p>Loading artwork suggestions…</p> : null}
      {status === "error" ? <p>{error}</p> : null}
      {status === "success" && suggestions.length === 0 ? <p>No artwork suggestions yet.</p> : null}
      {status === "success" && suggestions.length > 0 ? (
        <div className="grid gap-3">
          {suggestions.map((suggestion) => (
            <div key={suggestion.id} className="grid gap-1 border border-border bg-card p-3">
              <strong>{suggestion.workName}</strong>
              <p className="text-sm text-muted-foreground">{suggestion.artist}</p>
              {suggestion.creditorName ? <p>{suggestion.creditorName}</p> : null}
              <button
                type="button"
                aria-label={`Delete suggestion for ${suggestion.workName}`}
                className="justify-self-start text-action"
                onClick={() => {
                  void handleDeleteSuggestion(suggestion.id);
                }}
              >
                [delete]
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </RouteFrame>
  );
}
