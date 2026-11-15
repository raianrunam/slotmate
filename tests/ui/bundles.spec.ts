import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Secrets and server-only code must never reach the browser (A1, A4). The
// production build (made by the web server before the tests run) puts every
// file the browser can download in .next/static. This reads them as text.
// Only file names are reported, never any secret value.

const STATIC_DIR = path.join(process.cwd(), ".next", "static");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const textFiles = () => walk(STATIC_DIR).filter((f) => /\.(js|css|json|map|txt|html)$/.test(f));

test("the client bundles exist and are not empty", () => {
  expect(textFiles().length).toBeGreaterThan(5);
});

test("no secret key value appears in any client file", () => {
  const secret = process.env.SUPABASE_SECRET_KEY;
  expect(secret, "SUPABASE_SECRET_KEY is available to this test (names only)").toBeTruthy();
  const leaks = textFiles()
    .filter((f) => readFileSync(f, "utf8").includes(secret!))
    .map((f) => path.relative(STATIC_DIR, f));
  expect(leaks, "client files containing the secret key").toEqual([]);
});

test("no client file mentions the secret-key name, service_role or a secret key prefix", () => {
  const patterns = [/SUPABASE_SECRET_KEY/, /service_role/, /sb_secret_/];
  const hits: string[] = [];
  for (const f of textFiles()) {
    const text = readFileSync(f, "utf8");
    for (const p of patterns) {
      if (p.test(text)) hits.push(`${path.relative(STATIC_DIR, f)} matches ${p}`);
    }
  }
  expect(hits).toEqual([]);
});

test("no server-only module or Supabase client code is in any client file (A1)", () => {
  // Text that only exists inside our server modules or Supabase's client library.
  const markers = [
    "This module cannot be imported from a Client Component", // the server-only guard
    "Missing or invalid environment variable", // src/lib/env.ts
    "exchangeCodeForSession", // the confirm route / Supabase auth client
    "GoTrueClient", // the Supabase browser auth client
    "signInWithPassword",
    "createServerClient",
    "getClaims",
  ];
  const hits: string[] = [];
  for (const f of textFiles()) {
    const text = readFileSync(f, "utf8");
    for (const m of markers) {
      if (text.includes(m)) hits.push(`${path.relative(STATIC_DIR, f)} contains "${m}"`);
    }
  }
  expect(hits).toEqual([]);
});
