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

/**
 * USDC transfers. If the same tx also emitted AuthorizationUsed (EIP-3009), we tag the
 * transfer as x402 — that is the settlement path x402's "exact" scheme uses.
 */
export async function handleUsdc(logs: DecodedLog[]): Promise<void> {
  const x402Txs = new Set(
    logs.filter((l) => l.eventName === "AuthorizationUsed").map((l) => l.transactionHash),
  );
  for (const log of logs) {
    if (log.eventName !== "Transfer") continue;
    const a = log.args as { from: string; to: string; value: bigint };
    await pool.query(
      `insert into payments (tx, log_index, block, from_addr, to_addr, value, kind)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (tx, log_index) do nothing`,
      [log.transactionHash, log.logIndex, log.blockNumber, a.from.toLowerCase(), a.to.toLowerCase(),
       a.value.toString(), x402Txs.has(log.transactionHash) ? "x402" : "transfer"],
    );
  }
}
