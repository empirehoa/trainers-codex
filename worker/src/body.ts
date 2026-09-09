// Request-body guards shared by every route — a LEAF module (no imports), so
// node:test can load it directly and route modules can import it without
// dragging in the router.
//
// Two classes of bug these prevent (2026-09 audit, B-5 / B-6):
//   - JSON.parse happily returns null / arrays / strings / numbers; a handler
//     that then dereferences `body.sessionId` throws a TypeError, which the
//     500 handler used to echo verbatim to the client.
//   - `req.formData()` buffers the whole body before any size check can run.
//     A Content-Length pre-check refuses oversized uploads before a byte of
//     the body is read.

/**
 * Parse a JSON request body and require a plain object. Returns null for
 * malformed JSON and for any non-object JSON value (null, [], "str", 42).
 */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

export type MultipartGuard =
  | { ok: true }
  | { ok: false; status: 400; code: 'multipart_required' }
  | { ok: false; status: 413; code: 'payload_too_large'; maxBytes: number };

/** 12 MB print file + multipart framing headroom. */
export const UPLOAD_MAX_BYTES = 13 * 1024 * 1024;

/**
 * Pre-flight a multipart upload WITHOUT reading the body: the request must
 * declare multipart/form-data, and a declared Content-Length above `maxBytes`
 * is refused outright. Browsers always set Content-Length for FormData bodies;
 * a chunked upload without one still hits the per-part size checks after
 * formData() and Cloudflare's own request-body cap.
 */
export function guardMultipart(req: Request, maxBytes: number = UPLOAD_MAX_BYTES): MultipartGuard {
  const ct = req.headers.get('content-type') || '';
  if (!/^multipart\/form-data\s*(;|$)/i.test(ct)) {
    return { ok: false, status: 400, code: 'multipart_required' };
  }
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, code: 'payload_too_large', maxBytes };
  }
  return { ok: true };
}

export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

/**
 * Identify an image by its magic bytes. Returns null for anything that is not
 * PNG / JPEG / WebP — including SVG, HTML, and images whose multipart
 * Content-Type header lies about them.
 */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46   // RIFF
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) { // WEBP
    return 'image/webp';
  }
  return null;
}

/**
 * Re-wrap an uploaded blob with the Content-Type its bytes actually declare.
 * Returns null when the bytes are not a supported raster image. Everything
 * downstream (moderation, R2 httpMetadata, the model call) reads `.type` from
 * the returned blob, so a client-supplied MIME never reaches storage.
 */
export async function normalizeImageBlob(blob: Blob): Promise<Blob | null> {
  const buf = await blob.arrayBuffer();
  const type = sniffImageType(new Uint8Array(buf));
  if (!type) return null;
  return new Blob([buf], { type });
}
