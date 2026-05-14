import { Link } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

export function AdminPage() {
  return (
    <RouteFrame>
      <div aria-level="1" role="heading" className="m-0 text-lg font-semibold">
        Admin
      </div>
      <ul className="grid list-none gap-4 p-0">
        <li className="grid gap-1">
          <Link to="/admin/curated-groups" className="text-action">
            [curated groups]
          </Link>
          <p className="text-sm text-muted-foreground">
            Manage editorial groups and homepage curation.
          </p>
        </li>
        <li className="grid gap-1">
          <Link to="/admin/study-notes" className="text-action">
            [study notes]
          </Link>
          <p className="text-sm text-muted-foreground">
            Inspect and manage persisted study notes.
          </p>
        </li>
        <li className="grid gap-1">
          <Link to="/admin/suggestions" className="text-action">
            [artwork suggestions]
          </Link>
          <p className="text-sm text-muted-foreground">
            Read and delete submitted artwork suggestions.
          </p>
        </li>
      </ul>
    </RouteFrame>
  );
}
