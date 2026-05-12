import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

export function CuratedGroupsPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("loading");
  const [pendingFeatureSlug, setPendingFeatureSlug] = useState("");

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
              <Link
                className={group.isHomepageFeatured ? "text-primary" : undefined}
                to={`/admin/curated-groups/${group.slug}`}
              >
                {group.name}
              </Link>
              {group.isHomepageFeatured ? null : (
                <button
                  aria-label={`Feature ${group.name}`}
                  className="text-action"
                  type="button"
                  onClick={() => handleFeatureGroup(group.slug)}
                  disabled={pendingFeatureSlug === group.slug}
                >
                  {pendingFeatureSlug === group.slug ? "[featuring]" : "[feature]"}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </RouteFrame>
  );
}
