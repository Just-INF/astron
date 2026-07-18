import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { config } from "../lib/config";

export const sql = postgres(config.DATABASE_URL, {
  max: process.env.NODE_ENV === "test" ? 1 : 10,
});
export const db = drizzle(sql, { schema });
export type Database = typeof db;
