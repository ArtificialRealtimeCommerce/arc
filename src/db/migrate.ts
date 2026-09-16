import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "./client.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "schema.sql");

if (!existsSync(schemaPath)) {
  console.error(
    `migration failed: schema.sql not found at ${schemaPath}. ` +
      `Ensure the build copies src/db/schema.sql into dist/db/ (see Dockerfile).`,
  );
  await pool.end().catch(() => {});
  process.exit(1);
}

const sql = readFileSync(schemaPath, "utf8");

try {
  await pool.query(sql);
  console.log("schema applied");
} catch (err) {
  console.error("migration failed:", (err as Error).message);
  // exitCode (not exit) so the finally block still closes the pool cleanly; the
  // process then terminates non-zero and the boot chain's `&&` halts the server.
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
