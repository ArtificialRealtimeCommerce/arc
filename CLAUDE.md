# CLAUDE.md — ARC observatory

Read README.md and docs/ARCHITECTURE.md first.

Conventions
- Chain is Arc mainnet 5042 only. Never add testnet fallbacks; the config throws on purpose.
- Contract addresses live in env, never in code.
- Writes are idempotent (`on conflict do nothing`). Keep it that way; the indexer restarts freely.
- Amounts are stored raw. Format only in the API response or the web layer.
- When you find one bug, audit for adjacent ones and fix them together — do not offer "fix now or later".
- One OpenSpec task group per session. Typecheck + tests must pass before a commit.

Commands: `npm run typecheck`, `npm test`, `npm run build`, `npm run indexer`, `npm run api`.
