import { readFileSync } from "node:fs";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import { createArtctlApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);

async function start() {
  const app = createArtctlApp({ serveSpa: false });
  const vite = await createViteServer({
    appType: "custom",
    server: { middlewareMode: true }
  });

  app.use(vite.middlewares);

  app.get(/^\/(?!api).*/, async (request, response, next) => {
    try {
      const templatePath = path.resolve(process.cwd(), "index.html");
      const template = readFileSync(templatePath, "utf8");
      const html = await vite.transformIndexHtml(request.originalUrl, template);

      response.status(200).type("html").send(html);
    } catch (error) {
      next(error);
    }
  });

  app.listen(port, () => {
    console.log(`ARTCTL dev server listening on http://localhost:${port}`);
  });
}

start();
