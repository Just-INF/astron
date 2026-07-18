import { asc, eq } from "drizzle-orm";
import { db, sql } from "../db/client";
import { emailJobs } from "../db/schema";

const command = process.argv[2] ?? "list";
if (command === "retry") {
  const result = await db
    .update(emailJobs)
    .set({
      status: "pending",
      attempts: 0,
      runAt: new Date(),
      lastError: null,
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(emailJobs.status, "failed"))
    .returning({ id: emailJobs.id });
  console.info(JSON.stringify({ retried: result.length }));
} else {
  const rows = await db
    .select({
      id: emailJobs.id,
      to: emailJobs.to,
      subject: emailJobs.subject,
      attempts: emailJobs.attempts,
      lastError: emailJobs.lastError,
      updatedAt: emailJobs.updatedAt,
    })
    .from(emailJobs)
    .where(eq(emailJobs.status, "failed"))
    .orderBy(asc(emailJobs.updatedAt))
    .limit(100);
  console.info(JSON.stringify({ failed: rows }, null, 2));
}
await sql.end();
