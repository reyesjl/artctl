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
          <p className="help-page-manual">ARTCTL(1)</p>
          <p className="help-page-subtitle">Terminal Art Browser — User Manual</p>
        </div>

        <HelpSection title="NAME">
          <p className="help-page-copy">
            ARTCTL — a terminal-style browser for the Metropolitan Museum of Art collection.
            Browse highlights, search the collection, inspect work detail, and switch visual themes.
          </p>
        </HelpSection>

        <HelpSection title="SYNOPSIS">
          <div className="help-page-example">
            <span className="help-page-prompt">&gt; </span>
            browse gallery | search collection | inspect work
          </div>
          <p className="help-page-copy">
            Routes stay lightweight and use the Met-backed Express surface for collection data.
          </p>
        </HelpSection>

        <HelpSection title="EXAMPLES">
          <div className="help-page-examples">
            <div className="help-page-example">
              <span className="help-page-prompt">&gt; </span>
              open /
            </div>
            <div className="help-page-example">
              <span className="help-page-prompt">&gt; </span>
              open /search?q=sunflowers
            </div>
            <div className="help-page-example">
              <span className="help-page-prompt">&gt; </span>
              open /works/436121
            </div>
            <div className="help-page-example">
              <span className="help-page-prompt">&gt; </span>
              open /themes
            </div>
          </div>
        </HelpSection>

        <HelpSection title="GALLERY">
          <p className="help-page-copy">
            Shows highlighted public-domain works in a deterministic order. Hover a card to pick
            up the current theme accent, then open a work for closer inspection.
          </p>
        </HelpSection>

        <HelpSection title="SEARCH">
          <p className="help-page-copy">
            Search submits your query through the Express backend and restores the current query
            from the URL so the same result set can be revisited directly.
          </p>
        </HelpSection>

        <HelpSection title="WORK VIEWER">
          <p className="help-page-copy">
            Viewer shows the preferred Met image when available, then falls back to metadata
            context, date, and the original Met object link.
          </p>
        </HelpSection>

        <HelpSection title="THEMES">
          <p className="help-page-copy">
            Switch between built-in color themes. The current theme is stored in browser
            localStorage and is applied across gallery, search, help, and viewer routes.
          </p>
        </HelpSection>
      </article>
    </main>
  );
}
