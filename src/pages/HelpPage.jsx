function HelpSection({ title, children }) {
  return (
    <section className="help-section">
      <p className="help-section-title">── {title} ──</p>
      {children}
    </section>
  );
}

export function HelpPage() {
  return (
    <main className="app-main">
      <article className="help-page">
        <h1 className="sr-only">Help</h1>
        <div className="help-page-header">
          <p className="help-page-manual">ARTCTL</p>
          <p className="help-page-subtitle">Public-domain artwork explorer</p>
        </div>

        <HelpSection title="Gallery">
          <p className="help-page-copy">
            Browse highlighted public-domain artworks in a quiet, minimal interface designed for
            visual exploration.
          </p>
          <p className="help-page-copy">
            The gallery surfaces only works with available imagery and adapts subtly to the
            currently selected theme.
          </p>
          <p className="help-page-copy">Suggested searches:</p>
          <p className="help-page-copy">sunflowers · armor · monet · ukiyo-e · cats</p>
        </HelpSection>

        <HelpSection title="Search">
          <p className="help-page-copy">
            Search across artists, titles, cultures, materials, periods, and collection metadata.
          </p>
          <p className="help-page-copy">
            Search state is preserved in the URL so collections and discoveries can be revisited or
            shared directly.
          </p>
        </HelpSection>

        <HelpSection title="Help">
          <p className="help-page-copy">
            ARTCTL is designed as a lightweight artwork browser inspired by terminal systems,
            archival interfaces, and modern museum software.
          </p>
          <p className="help-page-copy">
            The interface emphasizes focus, fast navigation, and high-resolution public-domain
            imagery.
          </p>
        </HelpSection>

        <HelpSection title="Themes">
          <p className="help-page-copy">
            Switch between built-in visual themes inspired by terminal systems, archival software,
            and modern display environments.
          </p>
          <p className="help-page-copy">
            Your selected theme persists across gallery, search, help, and artwork views.
          </p>
        </HelpSection>

        <HelpSection title="Collection Source">
          <p className="help-page-copy">
            ARTCTL is an independent project and is not affiliated with or endorsed by the
            Metropolitan Museum of Art.
          </p>
          <p className="help-page-copy">
            The current collection source is the Metropolitan Museum Open Access API, selected for
            its large catalog of public-domain artworks and high-resolution imagery.
          </p>
          <p className="help-page-copy">
            Only works marked as public domain and containing available imagery are displayed within
            ARTCTL.
          </p>
        </HelpSection>
      </article>
    </main>
  );
}
