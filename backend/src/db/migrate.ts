import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { db, sql } from "./client";

await migrate(db, {
  migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
});
await sql.end();
console.log("Astron");
