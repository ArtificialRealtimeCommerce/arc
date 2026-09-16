import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "./client.js";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, "schema.sql"), "utf8");

try {
  await pool.query(sql);
  console.log("schema applied");
} catch (err) {
  console.error("migration failed:", (err as Error).message);
  await pool.end();
  process.exit(1);
} finally {
  await pool.end().catch(() => {});
}
