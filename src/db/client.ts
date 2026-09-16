import pg from "pg";
import { config } from "../config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 8 });

export async function getState(key: string): Promise<string | null> {
  const r = await pool.query("select value from indexer_state where key = $1", [key]);
  return r.rows[0]?.value ?? null;
}

export async function setState(key: string, value: string): Promise<void> {
  await pool.query(
    `insert into indexer_state (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, value],
  );
}
