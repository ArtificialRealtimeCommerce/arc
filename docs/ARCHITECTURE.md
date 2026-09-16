# Architecture

## Processes

```
RPC (Arc 5042) ──getLogs──▶ indexer ──▶ Postgres ◀── api ──▶ web/ + /api/*
```

- **indexer** (`src/indexer/index.ts`): keeps a single cursor `last_indexed_block` in `indexer_state`. Each tick it fetches logs per configured contract for `[cursor, min(head, cursor+BLOCK_BATCH-1)]`, decodes with viem, writes with `on conflict do nothing` (idempotent, safe to restart), then advances the cursor. While catching up it does not sleep.
- **api** (`src/api/server.ts`): read-only Hono server. Also serves `web/` so one Railway service is enough for the public site.

## Why start from head, no backfill

Same reasoning as earlier projects: backfilling from genesis over a free-tier RPC is not realistic (log-range caps, datacenter-IP blocks). Start at head on launch day, backfill later behind a keyed RPC if it matters. `START_BLOCK` accepts a number when you do.

## Modules are optional

Each contract address in `.env` enables one module. Blank = skipped. So ARC can ship on day one with only `USDC_ADDRESS` set (payments feed) and add ERC-8004 / ERC-8183 as their canonical Arc deployments are confirmed.

## Open verification items (do these before trusting numbers)

1. **Event signatures** in `src/abis.ts` follow the ERC-8004 / ERC-8183 drafts. Diff against the verified source of the actual Arc deployments; parameter names and `indexed` flags change the topic hash.
2. **x402 detection** relies on `AuthorizationUsed` (EIP-3009) being emitted by the USDC contract in the same tx as the `Transfer`. If Arc's native USDC precompile emits differently, the `kind` tag will silently stay `transfer`. Check one known x402 tx on Blockscout first.
3. **USDC decimals**: Arc's native gas accounting and the ERC-20 interface may not agree on decimals. Values are stored raw (`numeric`); `web/index.html` currently formats with 6 — change once confirmed.
4. **RPC caps**: `BLOCK_BATCH=50` is conservative. Measure the real cap (bracketed methodology applies here too) and raise it.

## Later

- x402 gating on `/api/*` (free during launch).
- ERC-8004 agent-card fetch + validation (Provenalt already does this on Base — port, don't rebuild).
- Websocket `/api/stream` for the tape instead of polling.
