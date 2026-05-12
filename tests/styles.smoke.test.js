import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

test("global stylesheet no longer ships the unused manual-section rules", () => {
  const stylesPath = path.resolve(process.cwd(), "src/styles.css");
  const styles = readFileSync(stylesPath, "utf8");

  expect(styles).not.toContain(".manual-section");
  expect(styles).toContain("@apply bg-background text-foreground;");
  expect(styles).toMatch(/body\s*\{[\s\S]*"JetBrains Mono"/);
});

test("app prefers JetBrains Mono in both the global stylesheet and Tailwind sans stack", () => {
  const stylesPath = path.resolve(process.cwd(), "src/styles.css");
  const tailwindConfigPath = path.resolve(process.cwd(), "tailwind.config.js");
  const indexHtmlPath = path.resolve(process.cwd(), "index.html");
  const styles = readFileSync(stylesPath, "utf8");
  const tailwindConfig = readFileSync(tailwindConfigPath, "utf8");
  const indexHtml = readFileSync(indexHtmlPath, "utf8");

  expect(styles).toContain('"JetBrains Mono"');
  expect(styles).not.toContain('"IBM Plex Sans"');
  expect(tailwindConfig).toContain('"JetBrains Mono"');
  expect(tailwindConfig).not.toContain('"IBM Plex Sans"');
  expect(indexHtml).toContain("family=JetBrains+Mono");
  expect(indexHtml).not.toContain("family=IBM+Plex+Sans");
});
