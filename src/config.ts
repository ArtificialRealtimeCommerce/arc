import { defineChain, type Address } from "viem";

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env: ${name}`);
  return v;
}

function optionalAddress(name: string): Address | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${name} is not a valid address: ${v}`);
  return v as Address;
}

export const ARC_CHAIN_ID = Number(env("ARC_CHAIN_ID", "5042"));
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
  startBlock: env("START_BLOCK", "latest"),
  // Arc is dense (~55 logs/block) and rpc.arc-scan.org caps eth_getLogs at 20 000
  // RESULTS (not block-range). 20 blocks ≈ 1100 logs — well under the cap with headroom
  // for bursts. Raise via BLOCK_BATCH env; the indexer also auto-bisects on cap errors.
  blockBatch: BigInt(env("BLOCK_BATCH", "20")),
  pollIntervalMs: Number(env("POLL_INTERVAL_MS", "800")),
  port: Number(env("PORT", "3000")),
};
