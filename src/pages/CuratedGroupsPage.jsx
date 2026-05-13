import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

function getCuratedGroupActionClassName(variant = "default") {
  if (variant === "delete") {
    return "text-action text-muted-foreground hover:text-destructive";
  }

  return "text-action text-muted-foreground hover:text-primary";
}

export function CuratedGroupsPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("loading");
  const [pendingFeatureSlug, setPendingFeatureSlug] = useState("");
  const [pendingDeleteSlug, setPendingDeleteSlug] = useState("");
  const [pendingSaveSlug, setPendingSaveSlug] = useState("");
  const [editingSlug, setEditingSlug] = useState("");
  const [editingName, setEditingName] = useState("");
  const [confirmingDeleteSlug, setConfirmingDeleteSlug] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadGroups() {
      setStatus("loading");
      setError("");

      try {
        const response = await fetchImpl(`${apiBaseUrl}/api/admin/curated-groups`);
        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setGroups([]);
          setError(data.error || "Unable to load curated groups.");
          setStatus("error");
          return;
        }

        setGroups(data.results ?? []);
        setStatus("success");
      } catch (loadError) {
        if (!cancelled) {
          setGroups([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to load curated groups.");
          setStatus("error");
        }
      }
    }

    loadGroups();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, fetchImpl]);

  async function handleFeatureGroup(groupSlug) {
    setPendingFeatureSlug(groupSlug);
    setError("");

    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/admin/curated-groups/${groupSlug}/feature`, {
        method: "PATCH"
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to feature curated group.");
        return;
      }

      setGroups((currentGroups) =>
        currentGroups.map((group) => ({
          ...group,
          isHomepageFeatured: group.slug === data.group.slug
        }))
      );
    } catch (featureError) {
      setError(
        featureError instanceof Error ? featureError.message : "Unable to feature curated group."
      );
    } finally {
      setPendingFeatureSlug("");
    }
  }

  function startEditingGroup(group) {
    setEditingSlug(group.slug);
    setEditingName(group.name);
    setError("");
  }

  function cancelEditingGroup() {
    setEditingSlug("");
    setEditingName("");
  }

  function handleEditKeyDown(event, group) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditingGroup();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      handleSaveGroup(group);
    }
  }

  function startDeleteConfirmation(groupSlug) {
    setConfirmingDeleteSlug(groupSlug);
    setError("");
  }

  function cancelDeleteConfirmation() {
    setConfirmingDeleteSlug("");
  }

  async function handleSaveGroup(group) {
    const name = editingName.trim();

    if (!name) {
      return;
    }

    setPendingSaveSlug(group.slug);
    setError("");

    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/admin/curated-groups/${group.slug}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to update curated group.");
        return;
      }

      setGroups((currentGroups) =>
        currentGroups.map((currentGroup) =>
          currentGroup.slug === group.slug ? data.group : currentGroup
        )
      );
      setEditingSlug("");
      setEditingName("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update curated group.");
    } finally {
      setPendingSaveSlug("");
    }
  }

  async function handleDeleteGroup(groupSlug) {
    setPendingDeleteSlug(groupSlug);
    setError("");

    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/admin/curated-groups/${groupSlug}`, {
        method: "DELETE"
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to delete curated group.");
        return;
      }

      setGroups((currentGroups) => currentGroups.filter((group) => group.slug !== groupSlug));
      setConfirmingDeleteSlug("");

      if (editingSlug === groupSlug) {
        setEditingSlug("");
        setEditingName("");
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete curated group."
      );
    } finally {
      setPendingDeleteSlug("");
    }
  }

  return (
    <RouteFrame>
      <div aria-level="1" role="heading" className="m-0 text-lg font-semibold">
        Curated Groups
      </div>
      <p>
        <Link aria-label="Create Group" className="text-action" to="/admin/curated-groups/new">
          [add]
        </Link>
      </p>
      {status === "loading" ? <p>Loading curated groups…</p> : null}
      {status === "error" ? <p>{error}</p> : null}
      {status === "success" && groups.length === 0 ? <p>No curated groups yet.</p> : null}
      {status === "success" && groups.length > 0 ? (
        <div className="grid gap-1">
          {groups.map((group) => (
            <div key={group.slug} className="flex items-center gap-3">
              <button
                aria-label={`Feature ${group.name}`}
                className={getCuratedGroupActionClassName("default")}
                type="button"
                onClick={() => handleFeatureGroup(group.slug)}
                disabled={group.isHomepageFeatured || pendingFeatureSlug === group.slug}
              >
                {group.isHomepageFeatured ? "[f]" : "[ ]"}
              </button>
              {editingSlug === group.slug ? (
                <div className="flex-1 border border-border bg-card">
                  <div className="border-b border-border px-3 py-1 text-xs text-muted-foreground">
                    {pendingSaveSlug === group.slug
                      ? "> saving curated group..."
                      : "> edit curated group (esc to cancel)"}
                  </div>
                  <input
                    aria-label="Group Name"
                    id={`group-name-${group.slug}`}
                    className="w-full bg-transparent px-3 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                    name="groupName"
                    type="text"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => handleEditKeyDown(event, group)}
                    autoFocus
                  />
                </div>
              ) : (
                <>
                  <Link
                    className={group.isHomepageFeatured ? "text-primary" : undefined}
                    to={`/admin/curated-groups/${group.slug}`}
                  >
                    {group.name}
                  </Link>
                  {group.slug === "homepage" ? null : (
                    <div className="ml-auto flex items-center justify-end gap-3">
                      <button
                        aria-label={`Edit ${group.name}`}
                        className={getCuratedGroupActionClassName("default")}
                        type="button"
                        onClick={() => startEditingGroup(group)}
                      >
                        [edit]
                      </button>
                      {confirmingDeleteSlug === group.slug ? (
                        <>
                          <button
                            aria-label={`Confirm delete ${group.name}`}
                            className={getCuratedGroupActionClassName("delete")}
                            type="button"
                            onClick={() => handleDeleteGroup(group.slug)}
                            disabled={pendingDeleteSlug === group.slug}
                          >
                            {pendingDeleteSlug === group.slug ? "[deleting]" : "[confirm delete]"}
                          </button>
                          <button
                            aria-label={`Cancel delete ${group.name}`}
                            className={getCuratedGroupActionClassName("default")}
                            type="button"
                            onClick={cancelDeleteConfirmation}
                            disabled={pendingDeleteSlug === group.slug}
                          >
                            [cancel]
                          </button>
                        </>
                      ) : (
                        <button
                          aria-label={`Delete ${group.name}`}
                          className={getCuratedGroupActionClassName("delete")}
                          type="button"
                          onClick={() => startDeleteConfirmation(group.slug)}
                        >
                          [delete]
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </RouteFrame>
  );
}
