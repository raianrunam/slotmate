import { expect, test } from "@playwright/test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Final-review guard: nothing unfinished may be visible to a visitor or an owner.
// (The owner found a "Placeholder" notice and fake-clickable buttons on the live landing page.)

const SRC = path.join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const rel = (f: string) => path.relative(process.cwd(), f).replaceAll("\\", "/");
const tsx = walk(SRC).filter((f) => f.endsWith(".tsx"));

test("the /design reference page and the PlaceholderNotice component are gone", () => {
  expect(existsSync(path.join(SRC, "app", "design"))).toBe(false);
  expect(existsSync(path.join(SRC, "components", "placeholder-notice.tsx"))).toBe(false);
  const users = tsx.filter((f) => /PlaceholderNotice|placeholder-notice/.test(readFileSync(f, "utf8")));
  expect(users.map(rel)).toEqual([]);
});

test("no screen text says Placeholder, a phase number, draft, lorem or 'not available yet'", () => {
  // Text between tags or inside a string, not comments: strip comments first.
  const bad = /Placeholder\.|built in Phase|Phase \d+\)|lorem ipsum|not available yet|coming soon|still being built/i;
  const offenders = tsx.filter((f) => {
    const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    return bad.test(code);
  });
  expect(offenders.map(rel)).toEqual([]);
});
