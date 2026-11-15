import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FRIENDLY, mapResourceError } from "../../src/features/resources/db-errors";
import {
  checkImageBytes,
  detectImageType,
  IMAGE_MESSAGES,
  imageFolder,
  imagePath,
  MAX_IMAGE_BYTES,
} from "../../src/features/resources/image-validation";
import { createResourceSchema, resourceFieldsSchema } from "../../src/features/resources/schema";

const good = { name: "Room A", description: "", slotMinutes: "60", capacity: "4", isAvailable: "on" };
const OWNER = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "22222222-2222-4222-8222-222222222222";
const RANDOM = "33333333-3333-4333-8333-333333333333";

// Minimal files with the structure the checks look for (not necessarily decodable).
const ascii = (t: string) => [...t].map((c) => c.charCodeAt(0));
const padTo = (bytes: number[], n: number) => Uint8Array.from([...bytes, ...new Array(Math.max(0, n - bytes.length)).fill(0)]);
const jpeg = padTo([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, ...ascii("JFIF")], 24);
const png = padTo([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, ...ascii("IHDR")], 40);
const webpWith = (chunk: string, total = 30, riffSize = total - 8) =>
  padTo([...ascii("RIFF"), riffSize & 255, (riffSize >> 8) & 255, (riffSize >> 16) & 255, 0, ...ascii("WEBP"), ...ascii(chunk)], total);
const webp = webpWith("VP8 ");

test.describe("resource schema (RES-04, RES-07, RES-08)", () => {
  test("accepts valid values; the checkbox becomes a boolean", () => {
    const r = resourceFieldsSchema.parse(good);
    expect(r).toMatchObject({ name: "Room A", description: null, slotMinutes: 60, capacity: 4, isAvailable: true });
    expect(resourceFieldsSchema.parse({ ...good, isAvailable: undefined }).isAvailable).toBe(false);
  });
  for (const bad of ["", "0", "4", "-30", "30.5", "abc", "1e2", "1441", "99999999", " "]) {
    test(`slot length "${bad}" is refused`, () => {
      expect(resourceFieldsSchema.safeParse({ ...good, slotMinutes: bad }).success).toBe(false);
    });
  }
  for (const ok of ["5", "1440", "30"]) {
    test(`slot length "${ok}" is accepted`, () => {
      expect(resourceFieldsSchema.safeParse({ ...good, slotMinutes: ok }).success).toBe(true);
    });
  }
  for (const bad of ["", "0", "-1", "1.5", "x", "1001"]) {
    test(`capacity "${bad}" is refused`, () => {
      expect(resourceFieldsSchema.safeParse({ ...good, capacity: bad }).success).toBe(false);
    });
  }
  test("capacity 1 and 1000 are accepted", () => {
    expect(resourceFieldsSchema.safeParse({ ...good, capacity: "1" }).success).toBe(true);
    expect(resourceFieldsSchema.safeParse({ ...good, capacity: "1000" }).success).toBe(true);
  });
  test("a missing name and over-long text are refused", () => {
    expect(resourceFieldsSchema.safeParse({ ...good, name: "  " }).success).toBe(false);
    expect(resourceFieldsSchema.safeParse({ ...good, name: "n".repeat(101) }).success).toBe(false);
    expect(resourceFieldsSchema.safeParse({ ...good, description: "d".repeat(1001) }).success).toBe(false);
  });
  test("create needs a real workspace id", () => {
    expect(createResourceSchema.safeParse({ ...good, workspaceId: "nope" }).success).toBe(false);
    expect(createResourceSchema.safeParse({ ...good, workspaceId: OWNER }).success).toBe(true);
  });
});

test.describe("image validation by size and file signature (RES-05, S1)", () => {
  test("recognises JPG, PNG and WebP from the first bytes", () => {
    expect(detectImageType(jpeg)).toEqual({ ext: "jpg", contentType: "image/jpeg" });
    expect(detectImageType(png)).toEqual({ ext: "png", contentType: "image/png" });
    expect(detectImageType(webp)).toEqual({ ext: "webp", contentType: "image/webp" });
    expect(detectImageType(webpWith("VP8L"))).toMatchObject({ ext: "webp" });
    expect(detectImageType(webpWith("VP8X"))).toMatchObject({ ext: "webp" });
  });
  test("stricter structure: marker byte, IHDR, WebP size and chunk, minimum sizes (Phase 9 review finding 8)", () => {
    const cases: [string, Uint8Array][] = [
      ["JPEG signature but marker byte 00", padTo([0xff, 0xd8, 0xff, 0x00], 24)],
      ["JPEG signature but marker byte FF", padTo([0xff, 0xd8, 0xff, 0xff], 24)],
      ["JPEG only 19 bytes", padTo([0xff, 0xd8, 0xff, 0xe0], 19)],
      ["PNG signature but no IHDR chunk", padTo([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, ...ascii("IDAT")], 40)],
      ["PNG signature but wrong first chunk length", padTo([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x01, ...ascii("IHDR")], 40)],
      ["PNG only 32 bytes", png.slice(0, 32)],
      ["WebP with an unknown chunk", webpWith("ABCD")],
      ["WebP whose declared size is larger than the file (cut off)", webpWith("VP8 ", 30, 500)],
      ["WebP whose declared size is too small", webpWith("VP8 ", 30, 4)],
      ["WebP only 19 bytes", webp.slice(0, 19)],
    ];
    for (const [label, bytes] of cases) {
      expect(detectImageType(bytes), label).toBeNull();
      expect(checkImageBytes(bytes).ok, label).toBe(false);
    }
    // Trailing bytes after the declared size are still accepted (some encoders pad).
    expect(detectImageType(webpWith("VP8 ", 40, 22))).toMatchObject({ ext: "webp" });
    // Exactly the minimum sizes pass.
    expect(detectImageType(jpeg.slice(0, 20))).toMatchObject({ ext: "jpg" });
    expect(detectImageType(png.slice(0, 33))).toMatchObject({ ext: "png" });
  });
  test("refuses text, HTML, SVG, GIF, an empty file and a RIFF that is not WebP", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    for (const [label, bytes] of [
      ["plain text renamed .png", enc("this is not a picture at all")],
      ["html", enc("<html><script>alert(1)</script></html>")],
      ["svg", enc('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
      ["gif", enc("GIF89a....")],
      ["riff wave", padTo([0x52, 0x49, 0x46, 0x46, 22, 0, 0, 0, 0x57, 0x41, 0x56, 0x45], 30)],
      ["truncated png", png.slice(0, 5)],
    ] as const) {
      expect(detectImageType(bytes), label).toBeNull();
      expect(checkImageBytes(bytes).ok, label).toBe(false);
    }
    expect(checkImageBytes(new Uint8Array(0))).toEqual({ ok: false, message: IMAGE_MESSAGES.missing });
  });
  test("2 MB is the limit: exactly 2 MB passes, one byte more is refused", () => {
    const at = new Uint8Array(MAX_IMAGE_BYTES);
    at.set(png);
    expect(checkImageBytes(at).ok).toBe(true);
    const over = new Uint8Array(MAX_IMAGE_BYTES + 1);
    over.set(png);
    expect(checkImageBytes(over)).toEqual({ ok: false, message: IMAGE_MESSAGES.tooLarge });
  });
  test("the stored path is <owner>/<resource>/<random>.<ext>, never the owner's file name", () => {
    expect(imagePath(OWNER, RESOURCE, RANDOM, "png")).toBe(`${OWNER}/${RESOURCE}/${RANDOM}.png`);
    expect(imageFolder(OWNER, RESOURCE)).toBe(`${OWNER}/${RESOURCE}`);
    for (const bad of ["../x", "a/b", "", "Z".repeat(36)]) {
      expect(() => imagePath(OWNER, RESOURCE, bad, "png"), bad).toThrow();
      expect(() => imagePath(bad, RESOURCE, RANDOM, "png"), bad).toThrow();
      expect(() => imageFolder(OWNER, bad), bad).toThrow();
    }
  });
});

test.describe("database error mapping for resources", () => {
  test("each known error becomes a fixed friendly message", () => {
    expect(mapResourceError({ message: "resource_limit_reached" })).toMatchObject({ kind: "limit", message: FRIENDLY.limit });
    expect(mapResourceError({ message: "resource_locked" }).kind).toBe("locked");
    for (const m of ["not_owner", "owner_not_found", "resource_not_found", "invalid_path"]) {
      expect(mapResourceError({ message: m }).kind, m).toBe("not_allowed");
    }
    expect(mapResourceError({ code: "42501", message: "x" }).kind).toBe("not_allowed");
    expect(mapResourceError({ code: "23503", message: "x" }).kind).toBe("not_allowed");
    expect(mapResourceError({ code: "23514", message: "x" }).kind).toBe("invalid_values");
    expect(mapResourceError({ code: "40P01", message: "x" }).kind).toBe("deadlock");
  });
  test("raw database text never appears in the message", () => {
    for (const raw of ['new row violates check constraint "resources_capacity_check"', "permission denied for table resources", "secret detail 42"]) {
      const mapped = mapResourceError({ code: "XX000", message: raw });
      expect(mapped.message).not.toContain(raw);
      expect(mapped.message).not.toMatch(/constraint|permission denied|secret/i);
    }
  });
});

test.describe("source guards for the resources feature", () => {
  const dir = path.join(process.cwd(), "src/features/resources");
  const read = (f: string) => readFileSync(path.join(dir, f), "utf8");
  const actions = read("actions.ts");

  test("actions file is a server-only 'use server' file that exports only the six actions", () => {
    expect(actions.trimStart().startsWith('"use server"')).toBe(true);
    expect(actions).toMatch(/import "server-only"/);
    const exported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]).sort();
    expect(exported).toEqual(["createResource", "deleteResource", "removeImage", "updateResource", "uploadResourceImage"]);
  });

  test("every exported action calls requireOwner() first", () => {
    const bodies = [...actions.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}\n/g)];
    expect(bodies).toHaveLength(5);
    for (const [, name, body] of bodies) {
      expect(body.trimStart(), `${name} starts with the owner check`).toMatch(/^(const owner = )?await requireOwner\(\);/);
    }
  });

  test("image actions find the resource with the owner's session and check the lock BEFORE touching Storage", () => {
    for (const name of ["uploadResourceImage", "removeImage"]) {
      const body = actions.slice(actions.indexOf(`export async function ${name}`)).split("\nexport async function ")[0];
      const find = body.indexOf("findOwnedResource(");
      const lock = body.indexOf("resource.locked");
      const storage = Math.max(body.indexOf("saveResourceImage("), body.indexOf("removeResourceImage("));
      expect(find, `${name}: finds the resource`).toBeGreaterThan(-1);
      expect(lock, `${name}: checks the lock`).toBeGreaterThan(find);
      expect(storage, `${name}: Storage comes after both`).toBeGreaterThan(lock);
    }
  });

  test("the upload action validates size and signature before it uploads", () => {
    const body = actions.slice(actions.indexOf("export async function uploadResourceImage"));
    expect(body.indexOf("MAX_IMAGE_BYTES")).toBeGreaterThan(-1);
    expect(body.indexOf("checkImageBytes(")).toBeGreaterThan(-1);
    expect(body.indexOf("checkImageBytes(")).toBeLessThan(body.indexOf("saveResourceImage("));
  });

  test("deletes remove the Storage files BEFORE the database rows (DB15)", () => {
    const del = actions.slice(actions.indexOf("export async function deleteResource"));
    expect(del.indexOf("removeResourceFiles(")).toBeGreaterThan(-1);
    expect(del.indexOf("removeResourceFiles(")).toBeLessThan(del.indexOf('.from("resources").delete()'));
    const ws = readFileSync(path.join(process.cwd(), "src/features/workspaces/actions.ts"), "utf8");
    const wsDel = ws.slice(ws.indexOf("export async function deleteWorkspace"));
    expect(wsDel.indexOf("removeResourceFiles(")).toBeGreaterThan(-1);
    expect(wsDel.indexOf("removeResourceFiles(")).toBeLessThan(wsDel.indexOf('.from("workspaces").delete()'));
  });

  test("the upload stores under a server-made name and the detected content type", () => {
    const images = read("images.ts");
    expect(images).toMatch(/imagePath\(args\.ownerId, args\.resourceId, randomUUID\(\), args\.image\.ext\)/);
    expect(images).toMatch(/contentType: args\.image\.contentType/);
    expect(images).not.toMatch(/file\.name|\.name\b.*upload/);
  });

  test("no raw database error text is returned from the actions", () => {
    expect(actions).not.toMatch(/\.error\.message/);
  });
});
