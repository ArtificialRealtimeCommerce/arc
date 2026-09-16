# Architecture

## Processes

```
RPC (Arc 5042) ──getLogs──▶ indexer ──▶ Postgres ◀── api ──▶ web/ + /api/*
```

- **indexer** (`src/indexer/index.ts`): keeps a single cursor `last_indexed_block` in `indexer_state`. Each tick it fetches logs per configured contract for `[cursor, min(head, cursor+BLOCK_BATCH-1)]`, decodes with viem, writes with `on conflict do nothing` (idempotent, safe to restart), then advances the cursor. While catching up it does not sleep.
- **api** (`src/api/server.ts`): read-only Hono server. Also serves `web/` so one Railway service is enough for the public site.

## Arc mainnet USDC — verified quirks

USDC on Arc mainnet is the system contract **`0x3600000000000000000000000000000000000000`** (proxy; ERC-20 `symbol` = `USDC`, ERC-20 `decimals` = **6**). Set `USDC_ADDRESS` to this. Two chain quirks are handled in `src/indexer/handlers.ts`:

1. **Double-emission (`dropNativeMirrors`).** Every USDC movement emits the *same* `Transfer` **twice in one tx** from `0x3600…0000`: once as the 6-decimal ERC-20 event, and once as an 18-decimal **native mirror** of the identical movement (same `from`/`to`, `value` scaled by `10^12`). This is **one** payment, not two. **Dedup strategy: keep only the 6-decimal ERC-20 side, drop the 18-decimal mirror.** We pair Transfers within a tx that share `from`/`to` where `value_big == value_small × 1e12` and discard the larger log. Because a tx never spans a block and the indexer never splits a block across `getLogs` calls, both halves of every pair are always present together for deduping. Consequence: `payments.value` is stored raw in **6-decimal** units, so volume aggregation and display both format with **6 decimals** (matches `web/`).

2. **Decimals: 18 (native gas) vs 6 (ERC-20).** Values are stored raw (`numeric`). Because dedup keeps only the 6-decimal ERC-20 log, everything downstream (`sum(value)`, `x402VolumeRaw`, web formatting) is consistently 6-decimal. Do **not** mix in the 18-decimal mirror.

3. **`eth_getLogs` result cap = 20 000 results per query** (a *result* cap on `rpc.arc-scan.org`, not a block-range cap). Arc is dense (~55 logs/block, ~1100 Transfers per 20 blocks). `BLOCK_BATCH` defaults to **20** (≈1100 logs, ample headroom) and is env-tunable up to ~300 before the cap bites. On a burst, `getLogsBounded` catches the cap error and **bisects the block range recursively** until each sub-query fits — no data is silently dropped.

## Why start from head, no backfill

Same reasoning as earlier projects: backfilling from genesis over a free-tier RPC is not realistic (log-range caps, datacenter-IP blocks). Start at head on launch day, backfill later behind a keyed RPC if it matters. `START_BLOCK` accepts a number when you do.

## Modules are optional

Each contract address in `.env` enables one module. Blank = skipped. So ARC can ship on day one with only `USDC_ADDRESS` set (payments feed) and add ERC-8004 / ERC-8183 as their canonical Arc deployments are confirmed.

## Open verification items (do these before trusting numbers)

1. **Event signatures** in `src/abis.ts` follow the ERC-8004 / ERC-8183 drafts. Diff against the verified source of the actual Arc deployments; parameter names and `indexed` flags change the topic hash.
2. **x402 detection** relies on `AuthorizationUsed` (EIP-3009) being emitted by the USDC contract in the same tx as the `Transfer`. If Arc's native USDC precompile emits differently, the `kind` tag will silently stay `transfer`. Check one known x402 tx on Blockscout first.
3. **USDC decimals**: RESOLVED — see "Arc mainnet USDC — verified quirks" above. ERC-20 decimals = 6; the 18-decimal native mirror is deduped out, so raw stored values and `web/index.html` are both 6-decimal.
4. **RPC caps**: RESOLVED — `eth_getLogs` cap is 20 000 results/query. `BLOCK_BATCH` now defaults to 20 with recursive bisect-on-cap in `getLogsBounded`. Raise `BLOCK_BATCH` toward ~300 only if the RPC's per-second budget allows.

## Later

- x402 gating on `/api/*` (free during launch).
- ERC-8004 agent-card fetch + validation (Provenalt already does this on Base — port, don't rebuild).
- Websocket `/api/stream` for the tape instead of polling.
