import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

test("gallery cards use the active theme accent for hover and focus borders", () => {
  const stylesPath = path.resolve(process.cwd(), "src/styles.css");
  const styles = readFileSync(stylesPath, "utf8");

  expect(styles).toContain(".gallery-card:hover,");
  expect(styles).toContain(".gallery-card:focus-within {");
  expect(styles).toContain("border-color: hsl(var(--primary));");
});

test("active nav links use the Cortex-style primary tint treatment", () => {
  const stylesPath = path.resolve(process.cwd(), "src/styles.css");
  const styles = readFileSync(stylesPath, "utf8");
  const activeNavBlock = styles.match(/\.nav-link\.active\s*\{[^}]+\}/)?.[0] ?? "";

  expect(activeNavBlock).toContain(".nav-link.active {");
  expect(activeNavBlock).toContain("color: hsl(var(--primary));");
  expect(activeNavBlock).toContain("background: hsl(var(--primary) / 0.1);");
});
