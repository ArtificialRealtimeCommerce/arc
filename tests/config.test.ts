import { test } from "node:test";
import assert from "node:assert/strict";

// Each scenario re-evaluates config.ts fresh via a unique import query so module caching
// doesn't leak state between cases.
function setEnv(overrides: Record<string, string | undefined>): void {
  const base: Record<string, string | undefined> = {
    ARC_CHAIN_ID: "5042",
    ARC_RPC_URL: "http://localhost",
    DATABASE_URL: "postgres://x",
    USDC_ADDRESS: undefined,
    BLOCK_BATCH: undefined,
    POLL_INTERVAL_MS: undefined,
    PORT: undefined,
    START_BLOCK: undefined,
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

test("refuses non-mainnet chain id", async () => {
  setEnv({ ARC_CHAIN_ID: "5042002" });
  await assert.rejects(() => import("../src/config.ts?case=chain-bad"), /must be 5042/);
});

test("trims surrounding whitespace/newlines on a pasted address", async () => {
  setEnv({ USDC_ADDRESS: "  0x3600000000000000000000000000000000000000\n" });
  const { config } = await import("../src/config.ts?case=addr-trim");
  assert.equal(config.contracts.usdc, "0x3600000000000000000000000000000000000000");
});

test("trims whitespace on required string env (ARC_RPC_URL / DATABASE_URL)", async () => {
  setEnv({ ARC_RPC_URL: "  http://rpc.example  ", DATABASE_URL: "\tpostgres://db\t" });
  const { config } = await import("../src/config.ts?case=str-trim");
  assert.equal(config.rpcUrl, "http://rpc.example");
  assert.equal(config.databaseUrl, "postgres://db");
});

test("still rejects a genuinely invalid address after trimming", async () => {
  setEnv({ USDC_ADDRESS: "  0x3600  " }); // valid-looking but too short once trimmed
  await assert.rejects(() => import("../src/config.ts?case=addr-bad"), /not a valid address/);
});

test("whitespace-only required env is treated as missing", async () => {
  setEnv({ ARC_RPC_URL: "   " });
  await assert.rejects(() => import("../src/config.ts?case=rpc-blank"), /Missing required env: ARC_RPC_URL/);
});

test("whitespace-only optional numeric env falls back to default", async () => {
  setEnv({ BLOCK_BATCH: "  ", POLL_INTERVAL_MS: "\n", PORT: " " });
  const { config } = await import("../src/config.ts?case=num-blank");
  assert.equal(config.blockBatch, 20n);
  assert.equal(config.pollIntervalMs, 800);
  assert.equal(config.port, 3000);
});

test("trims and parses numeric env with stray whitespace", async () => {
  setEnv({ BLOCK_BATCH: " 50 ", POLL_INTERVAL_MS: " 1200 ", PORT: " 8080 " });
  const { config } = await import("../src/config.ts?case=num-trim");
  assert.equal(config.blockBatch, 50n);
  assert.equal(config.pollIntervalMs, 1200);
  assert.equal(config.port, 8080);
});

test("rejects non-integer numeric env instead of silently using NaN", async () => {
  setEnv({ POLL_INTERVAL_MS: "not-a-number" });
  await assert.rejects(() => import("../src/config.ts?case=num-bad"), /POLL_INTERVAL_MS must be an integer/);
});

test("rejects non-integer BLOCK_BATCH", async () => {
  setEnv({ BLOCK_BATCH: "1.5" });
  await assert.rejects(() => import("../src/config.ts?case=batch-bad"), /BLOCK_BATCH must be an integer/);
});

test("START_BLOCK accepts 'latest', a number (trimmed), and rejects garbage", async () => {
  setEnv({ START_BLOCK: "  latest  " });
  const a = await import("../src/config.ts?case=sb-latest");
  assert.equal(a.config.startBlock, "latest");

  setEnv({ START_BLOCK: " 12345 " });
  const b = await import("../src/config.ts?case=sb-num");
  assert.equal(b.config.startBlock, "12345");

  setEnv({ START_BLOCK: "abc" });
  await assert.rejects(() => import("../src/config.ts?case=sb-bad"), /START_BLOCK must be/);
});
