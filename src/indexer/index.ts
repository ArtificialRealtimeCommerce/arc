import { createPublicClient, http, parseEventLogs, type Address, type Abi } from "viem";
import { arcMainnet, config } from "../config.js";
import { getState, setState, pool } from "../db/client.js";
import { identityRegistryAbi, reputationRegistryAbi, jobRegistryAbi, erc20TransferAbi } from "../abis.js";
import { handleIdentity, handleReputation, handleJob, handleUsdc } from "./handlers.js";

const client = createPublicClient({ chain: arcMainnet, transport: http(config.rpcUrl) });

const STATE_KEY = "last_indexed_block";

type Module = { name: string; address: Address; abi: Abi; onLogs: (logs: any[]) => Promise<void> };

function modules(): Module[] {
  const c = config.contracts;
  const mods: Module[] = [];
  if (c.identityRegistry) mods.push({ name: "erc8004.identity", address: c.identityRegistry, abi: identityRegistryAbi,
    onLogs: async (logs) => { for (const l of logs) await handleIdentity(l); } });
  if (c.reputationRegistry) mods.push({ name: "erc8004.reputation", address: c.reputationRegistry, abi: reputationRegistryAbi,
    onLogs: async (logs) => { for (const l of logs) await handleReputation(l); } });
  if (c.jobRegistry) mods.push({ name: "erc8183.jobs", address: c.jobRegistry, abi: jobRegistryAbi,
    onLogs: async (logs) => { for (const l of logs) await handleJob(l); } });
  if (c.usdc) mods.push({ name: "usdc.payments", address: c.usdc, abi: erc20TransferAbi, onLogs: handleUsdc });
  return mods;
}

async function resolveStartBlock(): Promise<bigint> {
  const saved = await getState(STATE_KEY);
  if (saved) return BigInt(saved) + 1n;
  if (config.startBlock === "latest") return client.getBlockNumber();
  return BigInt(config.startBlock);
}

// rpc.arc-scan.org caps eth_getLogs at 20 000 RESULTS per query. On a burst a batch can
// blow past it; the RPC rejects the whole query rather than truncating. Detect that class
// of error and bisect the block range until each sub-query fits. A single block never
// exceeds the cap in practice (~55 logs/block), so recursion terminates at from==to.
const CAP_ERROR = /exceed|max results|more than \d+ results|result set too large|response size|too many|limit exceeded/i;

async function getLogsBounded(address: Address, from: bigint, to: bigint): Promise<any[]> {
  try {
    return await client.getLogs({ address, fromBlock: from, toBlock: to });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (from < to && CAP_ERROR.test(msg)) {
      const mid = from + (to - from) / 2n;
      console.warn(`[getLogs] result cap hit for ${from}-${to}; bisecting to ${from}-${mid} / ${mid + 1n}-${to}`);
      const left = await getLogsBounded(address, from, mid);
      const right = await getLogsBounded(address, mid + 1n, to);
      return left.concat(right);
    }
    throw err;
  }
}

async function indexRange(mods: Module[], from: bigint, to: bigint): Promise<void> {
  for (const m of mods) {
    // Fetch the whole [from,to] for this module (bisecting internally if the RPC caps out)
    // so onLogs sees every tx's logs together — required for correct mirror dedup.
    const raw = await getLogsBounded(m.address, from, to);
    if (raw.length === 0) continue;
    const decoded = parseEventLogs({ abi: m.abi, logs: raw, strict: false });
    await m.onLogs(decoded);
    console.log(`[${m.name}] ${decoded.length} logs in ${from}-${to}`);
  }
}

async function main(): Promise<void> {
  const chainId = await client.getChainId();
  if (chainId !== 5042) throw new Error(`RPC reports chain ${chainId}, expected Arc mainnet 5042`);

  const mods = modules();
  if (mods.length === 0) {
    console.warn("No contract addresses configured — indexer has nothing to do. Fill .env.");
  }
  let cursor = await resolveStartBlock();
  console.log(`arc indexer up. modules=${mods.map((m) => m.name).join(",") || "none"} start=${cursor}`);

  for (;;) {
    try {
      const head = await client.getBlockNumber();
      if (head >= cursor) {
        const to = head - cursor + 1n > config.blockBatch ? cursor + config.blockBatch - 1n : head;
        await indexRange(mods, cursor, to);
        await setState(STATE_KEY, to.toString());
        cursor = to + 1n;
        if (cursor <= head) continue; // still catching up — no sleep
      }
    } catch (err) {
      console.error("indexer tick failed:", (err as Error).message);
      await new Promise((r) => setTimeout(r, 2000));
    }
    await new Promise((r) => setTimeout(r, config.pollIntervalMs));
  }
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
