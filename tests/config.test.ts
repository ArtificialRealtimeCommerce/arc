import { test } from "node:test";
import assert from "node:assert/strict";

test("refuses non-mainnet chain id", async () => {
  process.env.ARC_CHAIN_ID = "5042002";
  process.env.ARC_RPC_URL = "http://localhost";
  process.env.DATABASE_URL = "postgres://x";
  await assert.rejects(() => import("../src/config.ts"), /must be 5042/);
});
