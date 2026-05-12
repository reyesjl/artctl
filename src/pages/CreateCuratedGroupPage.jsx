import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

export function CreateCuratedGroupPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const navigate = useNavigate();
  const [groupSlugInput, setGroupSlugInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState("");
  const [error, setError] = useState("");

  async function handleCreateGroup(event) {
    event.preventDefault();

    const slug = groupSlugInput.trim();
    const name = groupNameInput.trim();

    if (!slug || !name) {
      return;
    }

    setError("");

    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/admin/curated-groups`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ slug, name })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to create curated group.");
        return;
      }

      navigate("/admin/curated-groups");
    } catch (createGroupError) {
      setError(
        createGroupError instanceof Error
          ? createGroupError.message
          : "Unable to create curated group."
      );
    }
  }

  return (
    <RouteFrame title="Create Curated Group">
      <p>
        <Link to="/admin/curated-groups">Back to Curated Groups</Link>
      </p>
      <form className="grid gap-2 sm:grid-cols-3" onSubmit={handleCreateGroup}>
        <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="admin-group-slug">
          Group Slug
          <input
            id="admin-group-slug"
            className="min-h-10 border border-input bg-secondary px-3 py-2 text-foreground"
            name="groupSlug"
            type="text"
            value={groupSlugInput}
            onChange={(event) => setGroupSlugInput(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="admin-group-name">
          Group Name
          <input
            id="admin-group-name"
            className="min-h-10 border border-input bg-secondary px-3 py-2 text-foreground"
            name="groupName"
            type="text"
            value={groupNameInput}
            onChange={(event) => setGroupNameInput(event.target.value)}
          />
        </label>
        <button
          className="min-h-10 self-end rounded-sm border border-input bg-secondary px-3 text-foreground"
          type="submit"
        >
          Create Group
        </button>
      </form>
      {error ? <p>{error}</p> : null}
    </RouteFrame>
  );
}
