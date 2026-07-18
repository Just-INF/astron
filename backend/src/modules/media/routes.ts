import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { Hono } from "hono";
import { db } from "../../db/client";
import { auditLogs, mediaAssets } from "../../db/schema";
import { requireAuth, requireMembership, type AppVariables } from "../../lib/auth";
import { ApiError } from "../../lib/errors";
import { createId } from "../../lib/ids";
import { deleteMediaFile, readMediaFile, saveMediaFile } from "../../lib/mediaFiles";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_BYTES = 10 * 1024 * 1024;
const extensionsByType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
function matchesFileSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png")
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (mimeType === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (mimeType === "image/avif")
    return ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12));
  return false;
}
export const mediaRoutes = new Hono<{ Variables: AppVariables }>();
mediaRoutes.use("/*", requireAuth);
mediaRoutes.use("/*", requireMembership("media:write"));
mediaRoutes.post("/uploads", async (c) => {
  const mimeType = c.req.header("Content-Type")?.split(";", 1)[0] ?? "";
  if (!allowedTypes.has(mimeType))
    throw new ApiError(
      422,
      "UNSUPPORTED_MEDIA_TYPE",
      "Only JPEG, PNG, WebP, and AVIF images are supported.",
    );
  const declaredSize = Number(c.req.header("Content-Length") ?? 0);
  if (declaredSize > MAX_BYTES)
    throw new ApiError(413, "MEDIA_TOO_LARGE", "Images must be 10 MB or smaller.");
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES)
    throw new ApiError(
      bytes.byteLength === 0 ? 422 : 413,
      bytes.byteLength === 0 ? "EMPTY_MEDIA" : "MEDIA_TOO_LARGE",
      bytes.byteLength === 0
        ? "Choose a non-empty image file."
        : "Images must be 10 MB or smaller.",
    );
  if (!matchesFileSignature(new Uint8Array(bytes), mimeType))
    throw new ApiError(
      422,
      "INVALID_MEDIA_CONTENT",
      "The file content does not match its image type.",
    );
  try {
    const metadata = await sharp(Buffer.from(bytes), {
      limitInputPixels: 40_000_000,
      animated: false,
    }).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 8_000 ||
      metadata.height > 8_000 ||
      metadata.width * metadata.height > 40_000_000
    )
      throw new Error("dimensions");
  } catch {
    throw new ApiError(
      422,
      "INVALID_IMAGE_DIMENSIONS",
      "The image could not be decoded or exceeds 8,000 px / 40 megapixels.",
    );
  }
  const restaurantId = c.req.param("restaurantId")!;
  const id = createId("media");
  const objectKey = `${restaurantId}/${id}.${extensionsByType[mimeType]}`;
  await saveMediaFile(objectKey, bytes);
  const publicUrl = `${new URL(c.req.url).origin}/api/public/media/${id}`;
  await db.insert(mediaAssets).values({
    id,
    restaurantId,
    objectKey,
    publicUrl,
    mimeType,
    byteSize: bytes.byteLength,
    status: "ready",
    uploadedBy: c.get("user").id,
  });
  return c.json({ data: { id, url: publicUrl, mimeType, byteSize: bytes.byteLength } }, 201);
});
mediaRoutes.delete("/media/:mediaId", async (c) => {
  const [asset] = await db
    .update(mediaAssets)
    .set({ status: "deleted", publicUrl: null, updatedAt: new Date() })
    .where(
      and(
        eq(mediaAssets.id, c.req.param("mediaId")),
        eq(mediaAssets.restaurantId, c.req.param("restaurantId")!),
      ),
    )
    .returning();
  if (!asset) throw new ApiError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
  await deleteMediaFile(asset.objectKey);
  await db.insert(auditLogs).values({
    restaurantId: asset.restaurantId,
    actorUserId: c.get("user").id,
    action: "media.deleted",
    entityType: "media",
    entityId: asset.id,
  });
  return c.body(null, 204);
});

export const publicMediaRoutes = new Hono();
publicMediaRoutes.get("/:mediaId", async (c) => {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, c.req.param("mediaId")), eq(mediaAssets.status, "ready")))
    .limit(1);
  if (!asset) throw new ApiError(404, "MEDIA_NOT_FOUND", "Media asset not found.");
  const file = await readMediaFile(asset.objectKey);
  if (!file) throw new ApiError(404, "MEDIA_FILE_NOT_FOUND", "Media file not found.");
  return new Response(file, {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.byteSize),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
});
