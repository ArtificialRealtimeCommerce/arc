import { parseAbi } from "viem";

// VERIFY BEFORE MAINNET USE.
// These fragments follow the ERC-8004 / ERC-8183 drafts as published. Deployed registries on
// Arc may differ in parameter names or indexing. Diff each event against the verified source on
// Blockscout for the address in .env and adjust here — the indexer keys on these signatures.

export const identityRegistryAbi = parseAbi([
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)",
]);

export const reputationRegistryAbi = parseAbi([
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, int128 score, uint8 decimals, bytes32 indexed tag1, bytes32 tag2, string fileuri, bytes32 filehash)",
  "event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)",
]);

export const jobRegistryAbi = parseAbi([
  "event JobCreated(bytes32 indexed jobId, address indexed client, address indexed provider, uint256 budget)",
  "event JobFunded(bytes32 indexed jobId, uint256 amount)",
  "event JobSubmitted(bytes32 indexed jobId, string deliverableURI)",
  "event JobCompleted(bytes32 indexed jobId, uint256 paidToProvider)",
  "event JobDisputed(bytes32 indexed jobId, address indexed by)",
]);

export const erc20TransferAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  // EIP-3009 — x402 "exact" scheme settles via transferWithAuthorization on USDC.
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
]);
