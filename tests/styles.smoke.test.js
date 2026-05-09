import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

test("global stylesheet no longer ships the unused manual-section rules", () => {
  const stylesPath = path.resolve(process.cwd(), "src/styles.css");
  const styles = readFileSync(stylesPath, "utf8");

  expect(styles).not.toContain(".manual-section");
});
