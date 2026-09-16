import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { pool, getState } from "../db/client.js";
import { config } from "../config.js";

const app = new Hono();
app.use("/api/*", cors());

// Global error handler: log the full error, return structured JSON instead of a
// bare "Internal Server Error". Applies to every route below.
app.onError((err, c) => {
  console.error(`[api] ${c.req.method} ${c.req.path} failed:`, err);
  return c.json({ error: "internal_error", detail: (err as Error).message }, 500);
});

// Health must never hard-fail on a DB hiccup: it reports DB reachability as a
// field so Railway's healthcheck stays green even when Postgres is momentarily
// unavailable.
app.get("/api/health", async (c) => {
  let db: "ok" | "unavailable" = "ok";
  let lastIndexedBlock: number | null = null;
  try {
    const last = await getState("last_indexed_block");
    lastIndexedBlock = last ? Number(last) : null;
  } catch (err) {
    db = "unavailable";
    console.error("[health] db check failed:", (err as Error).message);
  }
  return c.json({ ok: true, chainId: 5042, db, lastIndexedBlock });
});

app.get("/api/stats", async (c) => {
  const [agents, jobs, payments, x402, volume] = await Promise.all([
    pool.query("select count(*)::int as n from agents"),
    pool.query("select status, count(*)::int as n from jobs group by status"),
    pool.query("select count(*)::int as n from payments"),
    pool.query("select count(*)::int as n from payments where kind = 'x402'"),
    pool.query("select coalesce(sum(value),0)::text as v from payments where kind = 'x402'"),
  ]);
  return c.json({
    agents: agents.rows[0].n,
    jobs: Object.fromEntries(jobs.rows.map((r) => [r.status, r.n])),
    payments: payments.rows[0].n,
    x402Payments: x402.rows[0].n,
    x402VolumeRaw: volume.rows[0].v, // raw units — see decimals note in docs/ARCHITECTURE.md
  });
});

app.get("/api/agents", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const r = await pool.query(
    `select a.agent_id, a.owner, a.agent_uri, a.registered_block, a.registered_tx,
            count(f.id)::int as feedback_count
     from agents a left join feedback f on f.agent_id = a.agent_id
     group by a.agent_id order by a.registered_block desc limit $1`, [limit]);
  return c.json(r.rows);
});

app.get("/api/agents/:id", async (c) => {
  const id = c.req.param("id");
  const a = await pool.query("select * from agents where agent_id = $1", [id]);
  if (a.rowCount === 0) return c.json({ error: "agent not found" }, 404);
  const f = await pool.query("select * from feedback where agent_id = $1 order by block desc limit 100", [id]);
  const j = await pool.query("select * from jobs where provider = $1 order by created_block desc limit 100", [a.rows[0].owner]);
  return c.json({ ...a.rows[0], feedback: f.rows, jobs: j.rows });
});

app.get("/api/jobs", async (c) => {
  const status = c.req.query("status");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const r = status
    ? await pool.query("select * from jobs where status = $1 order by updated_block desc limit $2", [status, limit])
    : await pool.query("select * from jobs order by updated_block desc limit $1", [limit]);
  return c.json(r.rows);
});

app.get("/api/payments", async (c) => {
  const kind = c.req.query("kind");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const r = kind
    ? await pool.query("select * from payments where kind = $1 order by block desc, log_index desc limit $2", [kind, limit])
    : await pool.query("select * from payments order by block desc, log_index desc limit $1", [limit]);
  return c.json(r.rows);
});

// Landing page + static assets
app.use("/*", serveStatic({ root: "./web" }));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`arc api listening on :${info.port}`);
});
