import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

export function CreateCuratedGroupPage({ apiBaseUrl = "", fetchImpl = fetch }) {
  const navigate = useNavigate();
  const [groupNameInput, setGroupNameInput] = useState("");
  const [error, setError] = useState("");

  async function handleCreateGroup(event) {
    event.preventDefault();

    const name = groupNameInput.trim();

    if (!name) {
      return;
    }

    setError("");

    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/admin/curated-groups`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name })
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
      <form className="border border-border bg-card" onSubmit={handleCreateGroup}>
        <div className="border-b border-border px-3 py-1 text-xs text-muted-foreground">
          &gt; add curated group
        </div>
        <input
          aria-label="Group Name"
          id="admin-group-name"
          className="w-full bg-transparent px-3 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          name="groupName"
          type="text"
          value={groupNameInput}
          onChange={(event) => setGroupNameInput(event.target.value)}
          autoFocus
        />
      </form>
      {error ? <p>{error}</p> : null}
    </RouteFrame>
  );
}
