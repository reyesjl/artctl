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

test("help sections use compact internal spacing and clear vertical separation", () => {
  const stylesPath = path.resolve(process.cwd(), "src/styles.css");
  const styles = readFileSync(stylesPath, "utf8");
  const helpSectionBlock = styles.match(/\.help-section\s*\{[^}]+\}/)?.[0] ?? "";

  expect(helpSectionBlock).toContain(".help-section {");
  expect(helpSectionBlock).toContain("gap: 8px;");
  expect(helpSectionBlock).toContain("margin-top: 24px;");
});

test("help page typography uses a larger title and base-sized body copy", () => {
  const stylesPath = path.resolve(process.cwd(), "src/styles.css");
  const styles = readFileSync(stylesPath, "utf8");
  const helpPageBlock = styles.match(/\.help-page\s*\{[^}]+\}/)?.[0] ?? "";
  const helpTitleBlock = styles.match(/\.help-page-manual\s*\{[^}]+\}/)?.[0] ?? "";

  expect(helpPageBlock).toContain(".help-page {");
  expect(helpPageBlock).toContain("font-size: 16px;");
  expect(helpTitleBlock).toContain(".help-page-manual {");
  expect(helpTitleBlock).toContain("font-size: 20px;");
});

test("help section headers are bolded for scanability", () => {
  const stylesPath = path.resolve(process.cwd(), "src/styles.css");
  const styles = readFileSync(stylesPath, "utf8");
  const helpSectionTitleBlock = styles.match(/\.help-section-title\s*\{[^}]+\}/)?.[0] ?? "";

  expect(helpSectionTitleBlock).toContain(".help-section-title {");
  expect(helpSectionTitleBlock).toContain("font-weight: 700;");
});
