import { sql } from "../db/client";
import { runMediaCleanup } from "../lib/mediaCleanup";

const dryRun = process.argv.includes("--dry-run");
try {
  await runMediaCleanup(dryRun);
} finally {
  await sql.end({ timeout: 5 });
}
