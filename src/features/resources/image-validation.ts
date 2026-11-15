// Checks for an uploaded resource image (RES-05, D9, S1). Pure: no server
// imports, so it is unit tested. The real file type is decided from the first
// bytes of the file (its "signature" or "magic bytes"), NOT from the file name
// or the type the browser claims, because both can be faked.

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB (the bucket limit is the same number)

export const IMAGE_MESSAGES = {
  missing: "Choose an image file to upload.",
  tooLarge: "That image is larger than 2 MB. Choose a smaller one.",
  badType: "That file is not a JPG, PNG or WebP image. Choose a real image file.",
} as const;

export interface DetectedImage {
  /** Used for the stored file name and for the Storage content type. */
  ext: "jpg" | "png" | "webp";
  contentType: "image/jpeg" | "image/png" | "image/webp";
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = [0x49, 0x48, 0x44, 0x52]; // "IHDR"
const WEBP_CHUNKS = [
  [0x56, 0x50, 0x38, 0x20], // "VP8 "
  [0x56, 0x50, 0x38, 0x4c], // "VP8L"
  [0x56, 0x50, 0x38, 0x58], // "VP8X"
];

// Smallest sizes a real file of each type can have. Anything shorter is a
// truncated or made-up file, whatever its first bytes say.
const MIN_JPEG_BYTES = 20;
const MIN_PNG_BYTES = 33; // 8 signature + 25 for the IHDR chunk
const MIN_WEBP_BYTES = 20; // 12 RIFF header + 8 chunk header

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0) {
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** The image type from the file's first bytes, or null when it is not JPG, PNG or WebP. */
export function detectImageType(bytes: Uint8Array): DetectedImage | null {
  // JPEG: FF D8 FF, then a marker byte (APPn, DQT, SOF..., COM: C0 to FE). The
  // marker byte rules out most text and binary files that merely start with FF D8 FF.
  if (bytes.length >= MIN_JPEG_BYTES && startsWith(bytes, [0xff, 0xd8, 0xff]) && bytes[3] >= 0xc0 && bytes[3] <= 0xfe) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  // PNG: the 8-byte signature, then the first chunk must be IHDR (length 13).
  if (
    bytes.length >= MIN_PNG_BYTES &&
    startsWith(bytes, PNG) &&
    startsWith(bytes, [0x00, 0x00, 0x00, 0x0d], 8) &&
    startsWith(bytes, IHDR, 12)
  ) {
    return { ext: "png", contentType: "image/png" };
  }
  // WebP: "RIFF", a size that fits inside the file, "WEBP", then a VP8, VP8L or VP8X chunk.
  if (
    bytes.length >= MIN_WEBP_BYTES &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8) &&
    WEBP_CHUNKS.some((chunk) => startsWith(bytes, chunk, 12))
  ) {
    const riffSize = bytes[4] + bytes[5] * 256 + bytes[6] * 65536 + bytes[7] * 16777216;
    // The declared size counts everything after the 8-byte RIFF header; it may not be
    // larger than the file (a cut-off file), and must at least hold "WEBP" + a chunk header.
    if (riffSize >= 12 && riffSize + 8 <= bytes.length) {
      return { ext: "webp", contentType: "image/webp" };
    }
  }
  return null;
}

export type ImageCheck =
  | { ok: true; image: DetectedImage }
  | { ok: false; message: string };

/** Size AND signature check on the real bytes. */
export function checkImageBytes(bytes: Uint8Array): ImageCheck {
  if (bytes.length === 0) return { ok: false, message: IMAGE_MESSAGES.missing };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, message: IMAGE_MESSAGES.tooLarge };
  const image = detectImageType(bytes);
  if (!image) return { ok: false, message: IMAGE_MESSAGES.badType };
  return { ok: true, image };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The Storage path of a new image: <resource_id>/<random>.<ext>
 * (dev-log note 35; the owner id left the path in migration 8). The file name is generated here, never taken from the
 * owner; both ids must be lowercase hyphenated UUIDs. The folder is the resource id alone.
 */
export function imagePath(resourceId: string, randomId: string, ext: DetectedImage["ext"]): string {
  for (const id of [resourceId, randomId]) {
    if (!UUID.test(id)) throw new Error("Invalid id for an image path.");
  }
  return `${resourceId}/${randomId}.${ext}`;
}

/** The folder that holds all of one resource's files. */
export function imageFolder(resourceId: string): string {
  if (!UUID.test(resourceId)) throw new Error("Invalid id for an image folder.");
  return resourceId;
}
