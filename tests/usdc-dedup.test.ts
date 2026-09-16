import { test } from "node:test";
import assert from "node:assert/strict";

// handlers.ts transitively loads config.ts (via the db client), which reads env at import
// time. Set a valid env, then dynamic-import — the pg.Pool ctor does not connect, so no DB
// is required for this pure-function test. (node --test isolates each file in its own process.)
process.env.ARC_CHAIN_ID = "5042";
process.env.ARC_RPC_URL = "http://localhost";
process.env.DATABASE_URL = "postgres://localhost/arc_test";
const { dropNativeMirrors } = await import("../src/indexer/handlers.ts");

// Build a minimal decoded Transfer log shaped like what parseEventLogs yields.
function transfer(tx: string, logIndex: number, from: string, to: string, value: bigint): any {
  return {
    eventName: "Transfer",
    transactionHash: tx,
    logIndex,
    blockNumber: 1n,
    args: { from, to, value },
  };
}

const MIRROR = 10n ** 12n;
const A = "0xaaaa000000000000000000000000000000000000";
const B = "0xbbbb000000000000000000000000000000000000";
const C = "0xcccc000000000000000000000000000000000000";

test("drops the 18-decimal native mirror, keeps the 6-decimal ERC-20 side", () => {
  const erc20 = transfer("0xtx1", 0, A, B, 5_000_000n); // 5 USDC, 6 decimals
  const mirror = transfer("0xtx1", 1, A, B, 5_000_000n * MIRROR); // same movement, 18 decimals
  const out = dropNativeMirrors([erc20, mirror]);
  assert.equal(out.length, 1);
  assert.equal(out[0].args.value, 5_000_000n); // kept the 6-decimal one
});

test("mirror order does not matter (mirror first)", () => {
  const mirror = transfer("0xtx1", 0, A, B, 7_000_000n * MIRROR);
  const erc20 = transfer("0xtx1", 1, A, B, 7_000_000n);
  const out = dropNativeMirrors([mirror, erc20]);
  assert.equal(out.length, 1);
  assert.equal(out[0].args.value, 7_000_000n);
});

test("keeps two genuinely distinct transfers (no 1e12 ratio)", () => {
  const t1 = transfer("0xtx1", 0, A, B, 5_000_000n);
  const t2 = transfer("0xtx1", 1, A, B, 3_000_000n);
  const out = dropNativeMirrors([t1, t2]);
  assert.equal(out.length, 2);
});

test("does not pair a 1e12-ratio movement between DIFFERENT parties", () => {
  const t1 = transfer("0xtx1", 0, A, B, 5_000_000n);
  const t2 = transfer("0xtx1", 1, A, C, 5_000_000n * MIRROR); // different `to`
  const out = dropNativeMirrors([t1, t2]);
  assert.equal(out.length, 2);
});

test("does not pair across different txs", () => {
  const t1 = transfer("0xtx1", 0, A, B, 5_000_000n);
  const t2 = transfer("0xtx2", 0, A, B, 5_000_000n * MIRROR);
  const out = dropNativeMirrors([t1, t2]);
  assert.equal(out.length, 2);
});

test("dedups every pair across many movements in one tx", () => {
  const logs = [
    transfer("0xtx1", 0, A, B, 1_000_000n),
    transfer("0xtx1", 1, A, B, 1_000_000n * MIRROR),
    transfer("0xtx1", 2, B, C, 2_500_000n),
    transfer("0xtx1", 3, B, C, 2_500_000n * MIRROR),
  ];
  const out = dropNativeMirrors(logs);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((l) => l.args.value).sort(), [1_000_000n, 2_500_000n].sort());
});
