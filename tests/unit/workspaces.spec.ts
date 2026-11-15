import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  FRIENDLY,
  mapWorkspaceError,
  withDeadlockRetry,
} from "../../src/features/workspaces/db-errors";
import {
  isKnownTimeZone,
  listTimeZones,
  slugify,
  slugProblem,
  workspaceSchema,
} from "../../src/features/workspaces/schema";
import { effectivePlan, workspaceUsageLabel } from "../../src/lib/plans";

const good = { name: "Acme", description: "", slug: "acme-studio", timeZone: "Europe/London" };

test.describe("slug rules", () => {
  for (const ok of ["abc", "acme-studio", "a1-b2-c3", "x".repeat(40)]) {
    test(`accepts "${ok}"`, () => {
      expect(slugProblem(ok)).toBeNull();
      expect(workspaceSchema.safeParse({ ...good, slug: ok }).success).toBe(true);
    });
  }
  for (const bad of ["", "ab", "x".repeat(41), "Acme", "has space", "under_score", "-start", "end-", "a--b", "é-é-é", "a/b"]) {
    test(`refuses "${bad}"`, () => {
      expect(slugProblem(bad), "live hint").not.toBeNull();
      expect(workspaceSchema.safeParse({ ...good, slug: bad }).success, "server rule").toBe(false);
    });
  }
  test("slugify makes a valid suggestion from a name", () => {
    expect(slugify("Café Ünïon!")).toBe("cafe-union");
    expect(slugify("  My   Great Place  ")).toBe("my-great-place");
    expect(slugify("A".repeat(60))).toHaveLength(40);
    expect(slugProblem(slugify("Acme Studio"))).toBeNull();
    // Too short or empty suggestions are reported by the hint, never silently fixed.
    expect(slugProblem(slugify("!!"))).not.toBeNull();
  });
});

test.describe("workspace schema", () => {
  test("a missing name is refused", () => {
    const r = workspaceSchema.safeParse({ ...good, name: "   " });
    expect(r.success).toBe(false);
  });
  test("a missing or unknown time zone is refused", () => {
    expect(workspaceSchema.safeParse({ ...good, timeZone: "" }).success).toBe(false);
    expect(workspaceSchema.safeParse({ ...good, timeZone: "Mars/Olympus" }).success).toBe(false);
  });
  test("an empty description becomes null; text is trimmed", () => {
    const r = workspaceSchema.parse({ ...good, name: "  Acme  ", description: "  " });
    expect(r.name).toBe("Acme");
    expect(r.description).toBeNull();
  });
  test("over-long name and description are refused", () => {
    expect(workspaceSchema.safeParse({ ...good, name: "n".repeat(101) }).success).toBe(false);
    expect(workspaceSchema.safeParse({ ...good, description: "d".repeat(1001) }).success).toBe(false);
  });
  test("valid zones missing from older runtime lists are accepted; offsets and junk are not", () => {
    for (const ok of ["Asia/Kolkata", "Europe/Kyiv", "Asia/Kathmandu", "Asia/Yangon", "Asia/Ho_Chi_Minh", "GMT", "America/Argentina/Buenos_Aires"]) {
      expect(isKnownTimeZone(ok), ok).toBe(true);
    }
    for (const bad of ["Mars/Olympus", "+02:00", "UTC+2", "", "Europe", "../etc"]) {
      expect(isKnownTimeZone(bad), bad).toBe(false);
    }
  });
  test("the time zone list has real zones and UTC", () => {
    const zones = listTimeZones();
    expect(zones.length).toBeGreaterThan(100);
    expect(isKnownTimeZone("Europe/London")).toBe(true);
    expect(isKnownTimeZone("UTC")).toBe(true);
  });
});

test.describe("database error mapping", () => {
  test("each known database error becomes a fixed friendly message", () => {
    expect(mapWorkspaceError({ code: "P0001", message: "workspace_limit_reached" })).toMatchObject({ kind: "limit", message: FRIENDLY.limit });
    expect(mapWorkspaceError({ code: "P0001", message: "invalid_time_zone" })).toMatchObject({ kind: "time_zone", field: "timeZone" });
    expect(mapWorkspaceError({ code: "23505", message: 'duplicate key value violates unique constraint "workspaces_slug_key"' })).toMatchObject({ kind: "slug_taken", field: "slug", message: "That address is taken. Try another one." });
    expect(mapWorkspaceError({ code: "P0001", message: "not_owner" }).kind).toBe("not_allowed");
    expect(mapWorkspaceError({ code: "42501", message: "permission denied for table workspaces" }).kind).toBe("not_allowed");
    expect(mapWorkspaceError({ code: "23514", message: "violates check constraint" }).kind).toBe("invalid_values");
    expect(mapWorkspaceError({ code: "40P01", message: "deadlock detected" }).kind).toBe("deadlock");
  });
  test("raw database text never appears in the message", () => {
    for (const raw of [
      'duplicate key value violates unique constraint "workspaces_slug_key"',
      "permission denied for table workspaces",
      "deadlock detected",
      "something unexpected: secret detail",
    ]) {
      const mapped = mapWorkspaceError({ code: "XX000", message: raw });
      expect(mapped.message).not.toContain(raw);
      expect(mapped.message).not.toMatch(/constraint|permission denied|deadlock|secret/i);
    }
    expect(mapWorkspaceError({ message: "boom" }).kind).toBe("unknown");
  });
});

test.describe("deadlock retry (Q10)", () => {
  test("retries once on 40P01 and returns the second result", async () => {
    let calls = 0;
    const result = await withDeadlockRetry(async () => {
      calls++;
      return calls === 1 ? { error: { code: "40P01" } } : { error: null };
    });
    expect(calls).toBe(2);
    expect(result.error).toBeNull();
  });
  test("gives up after the one retry", async () => {
    let calls = 0;
    const result = await withDeadlockRetry(async () => {
      calls++;
      return { error: { code: "40P01" } };
    });
    expect(calls).toBe(2);
    expect(result.error?.code).toBe("40P01");
  });
  test("does not retry other errors or success", async () => {
    let calls = 0;
    await withDeadlockRetry(async () => {
      calls++;
      return { error: { code: "23505" } };
    });
    await withDeadlockRetry(async () => {
      calls++;
      return { error: null };
    });
    expect(calls).toBe(2);
  });
});

test.describe("plan rule repeated in the app (DB7, Q12)", () => {
  test("Pro only when plan is pro AND status is active or trialing", () => {
    expect(effectivePlan({ plan: "pro", status: "active" })).toBe("pro");
    expect(effectivePlan({ plan: "pro", status: "trialing" })).toBe("pro");
    expect(effectivePlan({ plan: "pro", status: "past_due" })).toBe("free");
    expect(effectivePlan({ plan: "pro", status: "canceled" })).toBe("free");
    expect(effectivePlan({ plan: "pro", status: null })).toBe("free");
    expect(effectivePlan({ plan: "free", status: "active" })).toBe("free");
    expect(effectivePlan(null)).toBe("free");
  });
  test("usage label", () => {
    expect(workspaceUsageLabel(1, 1)).toBe("1 of 1 workspaces");
    expect(workspaceUsageLabel(0, 5)).toBe("0 of 5 workspaces");
  });
});

test.describe("source guards for the workspaces feature", () => {
  const dir = path.join(process.cwd(), "src/features/workspaces");
  const read = (f: string) => readFileSync(path.join(dir, f), "utf8");
  const actions = read("actions.ts");

  test("actions file is a server-only 'use server' file", () => {
    expect(actions.trimStart().startsWith('"use server"')).toBe(true);
    expect(actions).toMatch(/import "server-only"/);
  });

  test("every exported action calls requireOwner() before anything else", () => {
    const bodies = [...actions.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}\n/g)];
    expect(bodies.map((m) => m[1]).sort()).toEqual(["createWorkspace", "deleteWorkspace", "updateWorkspace"]);
    for (const [, name, body] of bodies) {
      expect(body.trimStart(), `${name} starts with the owner check`).toMatch(/^(const owner = )?await requireOwner\(\);/);
    }
  });

  test("no secret key or admin client, and no raw database error text is returned", () => {
    for (const f of ["actions.ts", "queries.ts", "db-errors.ts"]) {
      expect(read(f), f).not.toMatch(/SUPABASE_SECRET_KEY|service_role|createAdminClient/i);
    }
    expect(actions).not.toMatch(/message:\s*(result|error)\.error\.message/);
    expect(actions).not.toMatch(/\.error\.message/);
  });

  test("the delete button asks for confirmation before submitting", () => {
    const button = read("components/delete-workspace-button.tsx");
    expect(button).toMatch(/<ConfirmDialog/);
    expect(button).toMatch(/onConfirm=\{\(\) => formRef\.current\?\.requestSubmit\(\)\}/);
    // The only form is the hidden one next to the dialog: no submit button outside it.
    expect(button).not.toMatch(/type="submit"/);
  });
});
