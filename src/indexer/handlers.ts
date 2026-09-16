import type { Log } from "viem";
import { pool } from "../db/client.js";

type Args = Record<string, unknown>;
type DecodedLog = Log & { eventName: string; args: Args };

export async function handleIdentity(log: DecodedLog): Promise<void> {
  if (log.eventName !== "Registered") return;
  const a = log.args as { agentId: bigint; agentURI: string; owner: string };
  await pool.query(
    `insert into agents (agent_id, owner, agent_uri, registered_block, registered_tx)
     values ($1, $2, $3, $4, $5) on conflict (agent_id) do nothing`,
    [a.agentId.toString(), a.owner.toLowerCase(), a.agentURI, log.blockNumber, log.transactionHash],
  );
}

export async function handleReputation(log: DecodedLog): Promise<void> {
  if (log.eventName !== "NewFeedback") return;
  const a = log.args as {
    agentId: bigint; clientAddress: string; score: bigint; decimals: number;
    tag1: string; tag2: string; fileuri: string;
  };
  await pool.query(
    `insert into feedback (agent_id, client, score, tag1, tag2, file_uri, block, tx, log_index)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (tx, log_index) do nothing`,
    [a.agentId.toString(), a.clientAddress.toLowerCase(), a.score.toString(), a.tag1, a.tag2,
     a.fileuri, log.blockNumber, log.transactionHash, log.logIndex],
  );
}

export async function handleJob(log: DecodedLog): Promise<void> {
  const a = log.args as Args;
  const jobId = String(a.jobId);
  const block = log.blockNumber;
  switch (log.eventName) {
    case "JobCreated":
      await pool.query(
        `insert into jobs (job_id, client, provider, budget, created_block, created_tx, updated_block)
         values ($1,$2,$3,$4,$5,$6,$5) on conflict (job_id) do nothing`,
        [jobId, String(a.client).toLowerCase(), String(a.provider).toLowerCase(),
         (a.budget as bigint).toString(), block, log.transactionHash],
      );
      break;
    case "JobFunded":
      await pool.query(
        `update jobs set funded = funded + $2, status = 'funded', updated_block = $3 where job_id = $1`,
        [jobId, (a.amount as bigint).toString(), block],
      );
      break;
    case "JobSubmitted":
      await pool.query(
        `update jobs set status = 'submitted', deliverable_uri = $2, updated_block = $3 where job_id = $1`,
        [jobId, String(a.deliverableURI), block],
      );
      break;
    case "JobCompleted":
      await pool.query(
        `update jobs set status = 'completed', paid = $2, updated_block = $3 where job_id = $1`,
        [jobId, (a.paidToProvider as bigint).toString(), block],
      );
      break;
    case "JobDisputed":
      await pool.query(`update jobs set status = 'disputed', updated_block = $2 where job_id = $1`, [jobId, block]);
      break;
  }
}

// Arc double-emission quirk: every USDC movement emits TWO Transfer logs in one tx
// from the system contract 0x3600…0000 — the 6-decimal ERC-20 Transfer and an
// 18-decimal "native mirror" of the SAME movement (identical from/to, value scaled by
// 1e12). MIRROR_SCALE is that 10^(18-6) ratio.
const MIRROR_SCALE = 10n ** 12n;

type Transfer = { from: string; to: string; value: bigint };

/**
 * Drop the 18-decimal native mirrors, keeping only the 6-decimal ERC-20 side so
 * payments/volume are not double-counted. Within each tx we pair Transfers that share
 * from/to where one value == the other × 1e12, and discard the larger (18-decimal) log.
 * A tx never spans a block, and the indexer never splits a block across getLogs calls,
 * so every mirror pair is guaranteed to be present together here. Idempotent across
 * restarts: the same 6-decimal log_index survives each time. See docs/ARCHITECTURE.md.
 */
export function dropNativeMirrors(transfers: DecodedLog[]): DecodedLog[] {
  const byTx = new Map<string, DecodedLog[]>();
  for (const t of transfers) {
    const g = byTx.get(t.transactionHash!) ?? [];
    g.push(t);
    byTx.set(t.transactionHash!, g);
  }
  const skip = new Set<DecodedLog>();
  for (const group of byTx.values()) {
    for (const small of group) {
      if (skip.has(small)) continue;
      const s = small.args as Transfer;
      if (s.value <= 0n) continue; // 0-value pair is ambiguous and irrelevant to volume
      for (const big of group) {
        if (big === small || skip.has(big)) continue;
        const b = big.args as Transfer;
        if (
          b.value === s.value * MIRROR_SCALE &&
          b.from.toLowerCase() === s.from.toLowerCase() &&
          b.to.toLowerCase() === s.to.toLowerCase()
        ) {
          skip.add(big); // `big` is the 18-decimal native mirror of `small`
          break; // one movement has exactly one mirror
        }
      }
    }
  }
  return transfers.filter((t) => !skip.has(t));
}

/**
 * USDC payments. We record only the deduped 6-decimal ERC-20 Transfers (raw 6-decimal
 * units — format with 6 decimals downstream). If the same tx also emitted
 * AuthorizationUsed (EIP-3009), the payment is tagged x402 — the settlement path x402's
 * "exact" scheme uses. x402 tagging keys on the tx hash, so it is unaffected by dedup.
 */
export async function handleUsdc(logs: DecodedLog[]): Promise<void> {
  const x402Txs = new Set(
    logs.filter((l) => l.eventName === "AuthorizationUsed").map((l) => l.transactionHash),
  );
  const transfers = dropNativeMirrors(logs.filter((l) => l.eventName === "Transfer"));
  for (const log of transfers) {
    const a = log.args as Transfer;
    await pool.query(
      `insert into payments (tx, log_index, block, from_addr, to_addr, value, kind)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (tx, log_index) do nothing`,
      [log.transactionHash, log.logIndex, log.blockNumber, a.from.toLowerCase(), a.to.toLowerCase(),
       a.value.toString(), x402Txs.has(log.transactionHash) ? "x402" : "transfer"],
    );
  }
}
