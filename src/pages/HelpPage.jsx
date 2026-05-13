import { useEffect, useState } from "react";

const HELP_SECTIONS = [
  { id: "why-artctl-exists", title: "WHY ARTCTL EXISTS" },
  { id: "study-works", title: "STUDY WORKS" },
  { id: "curated-gallery", title: "CURATED GALLERY" },
  { id: "search", title: "SEARCH" },
  { id: "system-design", title: "SYSTEM DESIGN" },
  { id: "themes", title: "THEMES" },
  { id: "collection-source", title: "COLLECTION SOURCE" },
  { id: "about-me", title: "ABOUT ME" }
];

const WHY_POINTS = [
  "visual analysis",
  "historical context",
  "medium and technique",
  "comparison across periods and cultures",
  "deliberate exploration instead of algorithmic feeds"
];

const STUDY_POINTS = [
  "observation",
  "context",
  "technique",
  "composition",
  "material analysis",
  "historical framing"
];

const CURATED_POINTS = [
  "artists",
  "periods",
  "visual themes",
  "techniques",
  "moods",
  "historical relationships"
];

const SEARCH_POINTS = [
  "artists",
  "titles",
  "materials",
  "periods",
  "cultures",
  "classifications",
  "object metadata"
];

const THEME_POINTS = [
  "terminal systems",
  "archival software",
  "museum catalog interfaces",
  "old display hardware"
];

function getActiveSectionFromHash() {
  if (typeof window === "undefined" || !window.location.hash) {
    return HELP_SECTIONS[0].id;
  }

  const sectionId = window.location.hash.slice(1);
  return HELP_SECTIONS.some((section) => section.id === sectionId)
    ? sectionId
    : HELP_SECTIONS[0].id;
}

function HelpSection({ id, title, children }) {
  return (
    <section id={id} className="space-y-2 scroll-mt-6">
      <div className="text-primary text-xs">── {title} ──</div>
      {children}
    </section>
  );
}

function Row({ label, desc }) {
  return (
    <div className="flex gap-4 text-xs">
      <span className="text-accent shrink-0 w-40 sm:w-48">{label}</span>
      <span className="text-muted-foreground">{desc}</span>
    </div>
  );
}

function ExampleBlock({ lines }) {
  return (
    <div className="space-y-1.5 border border-border bg-card px-3 py-2">
      {lines.map((line) => (
        <div key={line} className="text-xs">
          <span className="text-muted-foreground">{">"} </span>
          {line}
        </div>
      ))}
    </div>
  );
}

function InlineExample({ label, children }) {
  return (
    <div className="border border-border bg-card px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function HelpPage() {
  const [activeSection, setActiveSection] = useState(getActiveSectionFromHash);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveSection(getActiveSectionFromHash());
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return (
    <main className="app-main">
      <div className="lg:grid lg:grid-cols-[12rem_minmax(0,42rem)] lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-4 border border-border bg-card px-3 py-3 font-mono text-xs">
            <div className="mb-2 text-muted-foreground">sections</div>
            <nav aria-label="help sections" className="space-y-1">
              {HELP_SECTIONS.map((section) => {
                const isActive = section.id === activeSection;

                return (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    aria-current={isActive ? "location" : undefined}
                    className={`block transition-colors hover:text-foreground ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    [{section.title.toLowerCase()}]
                  </a>
                );
              })}
            </nav>
          </div>
        </aside>

        <article className="help-page max-w-2xl space-y-6 font-mono text-sm">
          <div aria-level="1" role="heading" className="sr-only m-0">
            Help
          </div>

          <div className="space-y-1">
            <div className="help-page-manual text-primary font-bold text-base">ARTCTL</div>
            <div className="help-page-subtitle text-muted-foreground text-xs">
              Quiet software for studying public-domain art.
            </div>
            <p className="help-page-copy text-xs text-muted-foreground">
              ARTCTL combines curated galleries, structured observation, and
              machine-assisted interpretation to help people slow down and look
              carefully.
            </p>
            <p className="help-page-copy text-xs text-muted-foreground">
              Built from a locally indexed collection of public-domain museum
              works.
            </p>
          </div>

          <HelpSection id="why-artctl-exists" title="WHY ARTCTL EXISTS">
            <p className="text-xs text-muted-foreground">
              Most art interfaces are optimized for scrolling.
            </p>
            <p className="text-xs text-muted-foreground">
              ARTCTL was built to support observation.
            </p>
            <div className="space-y-1.5">
              {WHY_POINTS.map((item) => (
                <Row key={item} label="[•]" desc={item} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              The interface is intentionally minimal so the artwork remains
              primary.
            </p>
          </HelpSection>

          <HelpSection id="study-works" title="STUDY WORKS">
            <p className="text-xs text-muted-foreground">
              Each artwork can be explored through structured viewing modes
              designed to surface different layers of a piece.
            </p>
            <p className="text-xs text-muted-foreground">
              The <span className="text-foreground">[study it]</span> system
              returns:
            </p>
            <div className="space-y-1.5">
              {STUDY_POINTS.map((item) => (
                <Row key={item} label="[•]" desc={item} />
              ))}
            </div>
            <InlineExample label="quote: ">
              Machine observation is not connoisseurship.
            </InlineExample>
            <p className="text-xs text-muted-foreground">
              The goal is not automated expertise. The goal is to help users
              learn how to look more carefully.
            </p>
          </HelpSection>

          <HelpSection id="curated-gallery" title="CURATED GALLERY">
            <p className="text-xs text-muted-foreground">
              The homepage gallery is manually curated.
            </p>
            <p className="text-xs text-muted-foreground">
              Selections rotate regularly and are organized around:
            </p>
            <div className="space-y-1.5">
              {CURATED_POINTS.map((item) => (
                <Row key={item} label="[•]" desc={item} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Future plans include guest-curated collections from artists,
              researchers, and other contributors.
            </p>
          </HelpSection>

          <HelpSection id="search" title="SEARCH">
            <p className="text-xs text-muted-foreground">
              Search across 400,000+ public-domain works indexed from museum
              collection data.
            </p>
            <div className="space-y-1.5">
              {SEARCH_POINTS.map((item) => (
                <Row key={item} label="[•]" desc={item} />
              ))}
            </div>
            <ExampleBlock
              lines={["goya", "ukiyo-e", "cats", "armor", "sunflowers"]}
            />
          </HelpSection>

          <HelpSection id="system-design" title="SYSTEM DESIGN">
            <div className="space-y-1.5">
              <Row
                label="[local index]"
                desc="ARTCTL maintains a local collection database built from museum object data exports."
              />
              <Row
                label="[metadata]"
                desc="Artwork metadata is indexed locally for fast exploration and filtering."
              />
              <Row
                label="[hydration]"
                desc="Public-domain image records are hydrated progressively through museum object APIs and persisted within the system."
              />
              <Row
                label="[result]"
                desc="This architecture keeps browsing fast while supporting large-scale collections and long-term curation."
              />
            </div>
          </HelpSection>

          <HelpSection id="themes" title="THEMES">
            <p className="text-xs text-muted-foreground">
              Themes are inspired by:
            </p>
            <div className="space-y-1.5">
              {THEME_POINTS.map((item) => (
                <Row key={item} label="[•]" desc={item} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Theme state persists across the application.
            </p>
          </HelpSection>

          <HelpSection id="collection-source" title="COLLECTION SOURCE">
            <p className="text-xs text-muted-foreground">
              ARTCTL is an independent project and is not affiliated with the
              Metropolitan Museum of Art.
            </p>
            <p className="text-xs text-muted-foreground">
              Current collection data and public-domain imagery are sourced from{" "}
              <a
                href="https://metmuseum.github.io/"
                target="_blank"
                rel="noreferrer"
                className="text-foreground"
              >
                the Metropolitan Museum Open Access Collection API
              </a>
              .
            </p>
            <p className="text-xs text-muted-foreground">
              Only public-domain works with available imagery are displayed.
            </p>
          </HelpSection>

          <HelpSection id="about-me" title="ABOUT ME">
            <p className="text-xs text-muted-foreground">
              I am a software engineer with 10+ years of experience in
              full-stack work.
            </p>
            <p className="text-xs text-muted-foreground">
              In the age of AI, I still enjoy the fundamental aspects of
              software engineering and believe they are more important now than
              ever before.
            </p>
            <p className="text-xs text-muted-foreground">
              I built ARTCTL with a terminal UI to show that simple things done
              really well can make for good software and be useful and make
              people happy.
            </p>
            <p className="text-xs text-muted-foreground">
              ARTCTL is one of a few side projects I have been working on. You
              can also see{" "}
              <a
                href="https://taskctl.net"
                target="_blank"
                rel="noreferrer"
                className="text-foreground"
              >
                taskctl.net
              </a>
              , a quiet terminal-style task manager for focused planning and
              execution.
            </p>
          </HelpSection>

          <div aria-hidden="true" className="help-scroll-spacer h-screen" />
        </article>
      </div>
    </main>
  );
}
