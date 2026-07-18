import { ne } from "drizzle-orm";
import { db } from "../db/client";
import { mediaAssets } from "../db/schema";
import { config } from "./config";
import { removeOrphanMedia } from "./orphanMedia";

const graceHours = Number(process.env.MEDIA_ORPHAN_GRACE_HOURS ?? 24);
if (!Number.isFinite(graceHours) || graceHours < 1)
  throw new Error("MEDIA_ORPHAN_GRACE_HOURS must be at least 1");

export async function runMediaCleanup(dryRun = false) {
  const rows = await db
    .select({ objectKey: mediaAssets.objectKey })
    .from(mediaAssets)
    .where(ne(mediaAssets.status, "deleted"));
  const removed = await removeOrphanMedia(
    config.LOCAL_MEDIA_DIR,
    rows.map((row) => row.objectKey),
    new Date(Date.now() - graceHours * 3_600_000),
    dryRun,
  );
  console.info(
    JSON.stringify({
      event: "media_orphan_cleanup",
      dryRun,
      graceHours,
      removedCount: removed.length,
      removed,
    }),
  );
  return removed;
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startMediaCleanupWorker() {
  if (timer) return;
  timer = setInterval(
    () =>
      void runMediaCleanup().catch((error) =>
        console.error(
          JSON.stringify({
            level: "error",
            event: "media_orphan_cleanup_failed",
            message: error instanceof Error ? error.message : "Unknown error",
          }),
        ),
      ),
    24 * 3_600_000,
  );
  timer.unref();
}
export function stopMediaCleanupWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
