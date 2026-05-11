function HelpSection({ title, children }) {
  return (
    <section className="help-section mt-6 grid gap-2 first:mt-0">
      <p className="help-section-title m-0 text-base font-bold text-primary">
        ── {title} ──
      </p>
      {children}
    </section>
  );
}

export function HelpPage() {
  return (
    <main className="app-main">
      <article className="help-page grid max-w-[672px] gap-4 text-base">
        <h1 className="sr-only">Help</h1>
        <div className="help-page-header grid gap-2">
          <p className="help-page-manual m-0 text-xl font-bold text-primary">
            ARTCTL
          </p>
          <p className="help-page-subtitle m-0 text-muted-foreground">
            Public-domain artwork explorer
          </p>
        </div>

        <HelpSection title="Gallery">
          <p className="help-page-copy m-0 text-muted-foreground">
            Browse highlighted public-domain artworks in a quiet, minimal interface designed for
            visual exploration.
          </p>
          <p className="help-page-copy m-0 text-muted-foreground">
            The gallery surfaces only works with available imagery and adapts subtly to the
            currently selected theme.
          </p>
          <p className="help-page-copy m-0 text-muted-foreground">
            Suggested searches:
          </p>
          <p className="help-page-copy m-0 text-muted-foreground">
            sunflowers · armor · monet · ukiyo-e · cats
          </p>
        </HelpSection>

        <HelpSection title="Search">
          <p className="help-page-copy m-0 text-muted-foreground">
            Search across artists, titles, cultures, materials, periods, and collection metadata.
          </p>
          <p className="help-page-copy m-0 text-muted-foreground">
            Search state is preserved in the URL so collections and discoveries can be revisited or
            shared directly.
          </p>
        </HelpSection>

        <HelpSection title="Help">
          <p className="help-page-copy m-0 text-muted-foreground">
            ARTCTL is designed as a lightweight artwork browser inspired by terminal systems,
            archival interfaces, and modern museum software.
          </p>
          <p className="help-page-copy m-0 text-muted-foreground">
            The interface emphasizes focus, fast navigation, and high-resolution public-domain
            imagery.
          </p>
        </HelpSection>

        <HelpSection title="Themes">
          <p className="help-page-copy m-0 text-muted-foreground">
            Switch between built-in visual themes inspired by terminal systems, archival software,
            and modern display environments.
          </p>
          <p className="help-page-copy m-0 text-muted-foreground">
            Your selected theme persists across gallery, search, help, and artwork views.
          </p>
        </HelpSection>

        <HelpSection title="Collection Source">
          <p className="help-page-copy m-0 text-muted-foreground">
            ARTCTL is an independent project and is not affiliated with or endorsed by the
            Metropolitan Museum of Art.
          </p>
          <p className="help-page-copy m-0 text-muted-foreground">
            The current collection source is the Metropolitan Museum Open Access API, selected for
            its large catalog of public-domain artworks and high-resolution imagery.
          </p>
          <p className="help-page-copy m-0 text-muted-foreground">
            Only works marked as public domain and containing available imagery are displayed within
            ARTCTL.
          </p>
        </HelpSection>
      </article>
    </main>
  );
}
