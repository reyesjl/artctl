import { Link } from "react-router-dom";
import { RouteFrame } from "../components/RouteFrame.jsx";

const adminSections = [
  {
    href: "/admin/curated-groups",
    title: "Curated Groups",
    description: "Manage editorial groups and homepage curation."
  }
];

export function AdminPage() {
  return (
    <RouteFrame title="Admin">
      <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">
        {adminSections.map((section) => (
          <li key={section.href}>
            <Link
              to={section.href}
              className="grid gap-2 border border-border bg-card p-4 text-card-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <strong className="text-base font-semibold">{section.title}</strong>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </RouteFrame>
  );
}
