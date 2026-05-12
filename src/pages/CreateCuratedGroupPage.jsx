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
    <RouteFrame>
      <div aria-level="1" role="heading" className="m-0 text-lg font-semibold">
        Create Curated Group
      </div>
      <p>
        <Link to="/admin/curated-groups">Back to Curated Groups</Link>
      </p>
      <form className="grid gap-2 sm:grid-cols-3" onSubmit={handleCreateGroup}>
        <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="admin-group-slug">
          Group Slug
          <input
            id="admin-group-slug"
            className="min-h-10 appearance-none border border-input border-solid bg-secondary px-3 py-2 text-foreground shadow-none"
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
            className="min-h-10 appearance-none border border-input border-solid bg-secondary px-3 py-2 text-foreground shadow-none"
            name="groupName"
            type="text"
            value={groupNameInput}
            onChange={(event) => setGroupNameInput(event.target.value)}
          />
        </label>
        <button
          aria-label="Create Group"
          className="text-action self-end"
          type="submit"
        >
          [save]
        </button>
      </form>
      {error ? <p>{error}</p> : null}
    </RouteFrame>
  );
}
