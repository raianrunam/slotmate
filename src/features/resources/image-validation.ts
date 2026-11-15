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

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0) {
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** The image type from the file's first bytes, or null when it is not JPG, PNG or WebP. */
export function detectImageType(bytes: Uint8Array): DetectedImage | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes.length >= 8 && startsWith(bytes, PNG)) {
    return { ext: "png", contentType: "image/png" };
  }
  // WebP: "RIFF" + 4 size bytes + "WEBP"
  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { ext: "webp", contentType: "image/webp" };
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
 * The Storage path of a new image: <owner_id>/<resource_id>/<random>.<ext>
 * (dev-log note 35). The file name is generated here, never taken from the
 * owner; both ids must be lowercase hyphenated UUIDs.
 */
export function imagePath(ownerId: string, resourceId: string, randomId: string, ext: DetectedImage["ext"]): string {
  for (const id of [ownerId, resourceId, randomId]) {
    if (!UUID.test(id)) throw new Error("Invalid id for an image path.");
  }
  return `${ownerId}/${resourceId}/${randomId}.${ext}`;
}

/** The folder that holds all of one resource's files. */
export function imageFolder(ownerId: string, resourceId: string): string {
  if (!UUID.test(ownerId) || !UUID.test(resourceId)) throw new Error("Invalid id for an image folder.");
  return `${ownerId}/${resourceId}`;
}
