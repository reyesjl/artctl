import { ProgressiveArtworkImage } from "../components/ProgressiveArtworkImage.jsx";
import { buildArtworkProxyUrl } from "../lib/artwork-image-proxy.js";
import { useSettings } from "../settings-provider.jsx";

const previewArtwork = {
  title: "The Great Wave off Kanagawa",
  imageUrl: "https://images.metmuseum.org/CRDImages/as/original/DP130155.jpg"
};

export function SettingsPage() {
  const { ditherEnabled, setDitherEnabled } = useSettings();

  return (
    <main className="app-main">
      <section className="max-w-xl space-y-4 font-mono">
        <div aria-level="1" role="heading" className="sr-only m-0">
          Settings
        </div>
        <p className="m-0 text-xs text-primary">── settings ──</p>
        <p className="m-0 text-xs text-muted-foreground">
          Control local interface behavior. Your selection is saved locally.
        </p>
        <div className="space-y-1 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className={ditherEnabled ? "text-primary" : "text-foreground"}>
              Dither reconstruction
            </span>
            <button
              type="button"
              aria-label="Dither reconstruction"
              aria-pressed={ditherEnabled}
              className={[
                "font-mono text-[10px] transition-colors hover:text-foreground",
                ditherEnabled ? "text-primary" : "text-muted-foreground"
              ].join(" ")}
              onClick={() => setDitherEnabled((current) => !current)}
            >
              {ditherEnabled ? "[on]" : "[off]"}
            </button>
          </div>
          <p className="m-0 text-[10px] text-muted-foreground">
            Toggle this setting and refresh the page to see the effect. It makes artwork loading slower, so leave it off if you want faster loading.
          </p>
        </div>
        <figure className="space-y-2">
          <div className="overflow-hidden border border-border bg-secondary">
            <ProgressiveArtworkImage
              className="block aspect-[4/3] w-full object-cover"
              src={previewArtwork.imageUrl}
              processingSrc={buildArtworkProxyUrl(previewArtwork.imageUrl)}
              alt="Settings preview artwork"
              sequenceProfile="gallery"
            />
          </div>
          <figcaption className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>{previewArtwork.title}</span>
            <span className={ditherEnabled ? "text-primary" : "text-muted-foreground"}>
              preview: {ditherEnabled ? "dither on" : "dither off"}
            </span>
          </figcaption>
        </figure>
        <p className="m-0 text-[10px] text-muted-foreground/50">
          settings are stored in browser localStorage
        </p>
      </section>
    </main>
  );
}
