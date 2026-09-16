import { defineChain, type Address } from "viem";

// All env reads go through these helpers. Values pasted from dashboards (e.g. Railway)
// routinely carry stray leading/trailing whitespace or newlines; every helper trims first
// so a valid value never crashes with a misleading "invalid" error. A value that is empty
// or whitespace-only is treated as "not set" (falls back, or throws "missing").

function env(name: string, fallback?: string): string {
  const raw = process.env[name]?.trim();
  const v = raw ? raw : fallback; // undefined / "" / whitespace-only -> fallback
  if (v === undefined || v.trim() === "") throw new Error(`Missing required env: ${name}`);
  return v.trim();
}

function intEnv(name: string, fallback: string, min = Number.MIN_SAFE_INTEGER): number {
  const raw = env(name, fallback);
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer; got "${raw}"`);
  if (n < min) throw new Error(`${name} must be >= ${min}; got ${n}`);
  return n;
}

function bigintEnv(name: string, fallback: string, min = 0n): bigint {
  const raw = env(name, fallback);
  let n: bigint;
  try {
    n = BigInt(raw);
  } catch {
    throw new Error(`${name} must be an integer; got "${raw}"`);
  }
  if (n < min) throw new Error(`${name} must be >= ${min}; got ${n}`);
  return n;
}

function optionalAddress(name: string): Address | undefined {
  const v = process.env[name]?.trim();
  if (!v) return undefined; // unset / empty / whitespace-only -> not configured
  // Validation stays strict: still require 0x + 40 hex — only whitespace is forgiven.
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${name} is not a valid address: ${v}`);
  return v as Address;
}

function startBlockEnv(): string {
  const v = env("START_BLOCK", "latest");
  if (v === "latest") return v;
  try {
    const n = BigInt(v);
    if (n < 0n) throw new Error("negative");
    return n.toString();
  } catch {
    throw new Error(`START_BLOCK must be "latest" or a non-negative integer; got "${v}"`);
  }
}

export const ARC_CHAIN_ID = intEnv("ARC_CHAIN_ID", "5042");
if (ARC_CHAIN_ID !== 5042) {
  // Refuse to run against testnet (5042002) or anything else by mistake.
  throw new Error(`ARC_CHAIN_ID must be 5042 (Arc mainnet); got ${ARC_CHAIN_ID}`);
}

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [env("ARC_RPC_URL")] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://arc-mainnet.cloud.blockscout.com" },
  },
});
// NOTE: native USDC on Arc has a decimals quirk between native gas accounting and the
// ERC-20 view — verify against Circle docs before rendering amounts (see docs/ARCHITECTURE.md).

export const config = {
  rpcUrl: env("ARC_RPC_URL"),
  databaseUrl: env("DATABASE_URL"),
  contracts: {
    identityRegistry: optionalAddress("ERC8004_IDENTITY_REGISTRY"),
    reputationRegistry: optionalAddress("ERC8004_REPUTATION_REGISTRY"),
    jobRegistry: optionalAddress("ERC8183_JOB_REGISTRY"),
    usdc: optionalAddress("USDC_ADDRESS"),
  },
  startBlock: startBlockEnv(),
  // Arc is dense (~55 logs/block) and rpc.arc-scan.org caps eth_getLogs at 20 000
  // RESULTS (not block-range). 20 blocks ≈ 1100 logs — well under the cap with headroom
  // for bursts. Raise via BLOCK_BATCH env; the indexer also auto-bisects on cap errors.
  blockBatch: bigintEnv("BLOCK_BATCH", "20", 1n),
  pollIntervalMs: intEnv("POLL_INTERVAL_MS", "800", 0),
  port: intEnv("PORT", "3000", 1),
};
