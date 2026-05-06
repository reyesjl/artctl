import path from "node:path";
import { createArtctlApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const distDir = path.resolve(process.cwd(), "dist");
const spaHtmlPath = path.join(distDir, "index.html");

const app = createArtctlApp({
  spaHtmlPath,
  staticDir: distDir
});

app.listen(port, () => {
  console.log(`ARTCTL server listening on http://localhost:${port}`);
});
