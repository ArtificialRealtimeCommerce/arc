# ARC — Artificial Real-time Commerce

Live observatory for agentic commerce on **Arc mainnet** (Circle's USDC-native L1, chain ID `5042`).

ARC indexes the agent-native standards Arc ships with and exposes them through one public API and one live feed:

| Layer | Standard | What ARC records |
|---|---|---|
| Identities | ERC-8004 Identity + Reputation | agent registrations, agent card URI, feedback |
| Jobs | ERC-8183 | job created → funded → submitted → completed / disputed, with USDC amounts |
| Payments | USDC transfers, x402 | every transfer; tagged `x402` when settled via EIP-3009 authorization in the same tx |

Independent project. Not affiliated with Circle or the Arc network.

## Stack

TypeScript · viem · Hono · Postgres. Two processes from one image: `indexer` (poll head → getLogs → Postgres) and `api` (REST + serves `web/`).

## Run locally

```bash
cp .env.example .env         # fill ARC_RPC_URL, DATABASE_URL, contract addresses
npm install
npm run db:migrate
npm run indexer               # terminal 1
npm run api                   # terminal 2 → http://localhost:3000
```

`web/index.html` runs in demo mode until `/api/payments` responds; then it switches to the real feed automatically.

## API

```
GET /api/health
GET /api/stats
GET /api/agents?limit=50
GET /api/agents/:id
GET /api/jobs?status=funded
GET /api/payments?kind=x402
```

## Deploy (Railway)

1. Create a Railway project, add **Postgres**, copy its public `DATABASE_URL`.
2. Add a service from this repo (builds from `Dockerfile`). Set env from `.env.example`. This is the **api** service.
3. Add a second service from the same repo, same env, and override the start command with `node dist/indexer/index.js`. This is the **indexer**.
4. Run `npm run db:migrate` once (Railway shell or locally against the public proxy URL).

Vercel is not needed: the API serves the landing page itself.

## Before pointing at mainnet

- `ARC_CHAIN_ID` is hard-checked to `5042`. The indexer also asks the RPC for its chain ID and refuses anything else. Testnet is `5042002` — do not mix them.
- Contract addresses are **not** hardcoded. Fill them from official deployments and verify the event signatures in `src/abis.ts` against the verified source on Blockscout. See `docs/ARCHITECTURE.md`.
- USDC decimals on Arc need care: native gas and the ERC-20 view can disagree. Amounts are stored raw; format at the edge.

## License

Apache-2.0
