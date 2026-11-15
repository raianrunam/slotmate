import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Source-code guards for the auth design (A1, A3, A4). They read the files in
// src/ as text, so a future change that breaks a rule fails here.

const SRC = path.join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");
const rel = (f: string) => path.relative(process.cwd(), f).replaceAll("\\", "/");

test("every dashboard page uses OwnerGate or requireOwner (A3 layer 2)", () => {
  const pages = files.filter((f) => /src[\\/]app[\\/]dashboard[\\/](.*[\\/])?page\.tsx$/.test(f));
  expect(pages.length, "found the dashboard pages").toBeGreaterThanOrEqual(8);
  const missing = pages.filter((f) => !/<OwnerGate[\s>]|await requireOwner\(/.test(read(f))).map(rel);
  expect(missing, "dashboard pages without an owner check").toEqual([]);
});

test("no browser Supabase client exists anywhere in src/ (A1)", () => {
  const offenders = files.filter((f) => /createBrowserClient/.test(read(f)));
  expect(offenders.map(rel)).toEqual([]);
});

test('no "use client" file imports Supabase or a server-only module (A1)', () => {
  const clientFiles = files.filter((f) => /^\s*["']use client["']/.test(read(f)));
  expect(clientFiles.length).toBeGreaterThan(0);
  const bad: string[] = [];
  for (const f of clientFiles) {
    for (const m of read(f).matchAll(/from\s+["']([^"']+)["']/g)) {
      const spec = m[1];
      if (
        spec.startsWith("@supabase/") ||
        spec === "server-only" ||
        spec.startsWith("next/headers") ||
        spec.startsWith("@/lib/supabase") ||
        spec === "@/lib/auth"
      ) {
        bad.push(`${rel(f)} imports ${spec}`);
      }
    }
  }
  expect(bad).toEqual([]);
});

// Phase 9: the secret key is read in exactly ONE module (the admin connection,
// A4 "place 5": resource image Storage functions and the clean-up before deletes).
test("the secret-key variable name appears only in src/lib/supabase/admin.ts (A4)", () => {
  const offenders = files.filter((f) => /SUPABASE_SECRET_KEY|SERVICE_ROLE/i.test(read(f))).map(rel);
  expect(offenders).toEqual(["src/lib/supabase/admin.ts"]);
});

test("the admin module is server-only and only src/features/resources/images.ts imports it", () => {
  expect(read(path.join(SRC, "lib/supabase/admin.ts"))).toMatch(/^import "server-only"/m);
  const importers = files
    .filter((f) => rel(f) !== "src/lib/supabase/admin.ts")
    .filter((f) => /supabase\/admin["']/.test(read(f)))
    .map(rel);
  expect(importers).toEqual(["src/features/resources/images.ts"]);
  expect(read(path.join(SRC, "features/resources/images.ts"))).toMatch(/^import "server-only"/m);
});

test("no 'use client' file imports the Storage functions or the admin module", () => {
  const bad = files
    .filter((f) => /^\s*["']use client["']/.test(read(f)))
    .filter((f) => /features\/resources\/images|supabase\/admin/.test(read(f)))
    .map(rel);
  expect(bad).toEqual([]);
});

test("modules that touch the login session are marked server-only", () => {
  for (const f of ["src/lib/auth.ts", "src/lib/supabase/server.ts", "src/features/auth/actions.ts"]) {
    expect(read(path.join(process.cwd(), f)), f).toMatch(/import "server-only"/);
  }
});

test("Server Actions file is a 'use server' file", () => {
  expect(read(path.join(SRC, "features/auth/actions.ts")).trimStart().startsWith('"use server"')).toBe(true);
});

test("the only Route Handler is /auth/confirm (A2)", () => {
  const handlers = files.filter((f) => /[\\/]route\.ts$/.test(f)).map(rel);
  expect(handlers).toEqual(["src/app/auth/confirm/route.ts"]);
});

test("passwords and emails are never written to a log", () => {
  const actions = read(path.join(SRC, "features/auth/actions.ts"));
  for (const m of actions.matchAll(/console\.\w+\(([^;]*)\);/g)) {
    // Check the logged values, not the label text (the first string).
    const values = m[1].replace(/^\s*"[^"]*"\s*,?/, "");
    expect(values, "log call").not.toMatch(/password|email|formData|fields|parsed/i);
    expect(values, "log call logs only the error code and status").toMatch(/code: error\.code/);
  }
});

test("the confirm route has no 'next' or free-form redirect", () => {
  const route = read(path.join(SRC, "app/auth/confirm/route.ts"));
  expect(route).not.toMatch(/get\(["']next["']\)/);
  expect(route).not.toMatch(/searchParams\.get\(["'](redirect|redirect_to|url|to)["']\)/);
});
