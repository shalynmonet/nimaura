import { z } from "zod";
import { isValidNimiqAddress, normalizeAddress, type Network } from "./rules";
import { validatePaymentEvidence, type ExpectedPayment } from "./verification";

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[a-f0-9]{64}$/i).transform((v) => v.toLowerCase());
const address = z.string().transform(normalizeAddress).refine(isValidNimiqAddress);
export const transactionSchema = z.object({ hash, from: address, to: address, value: integer, fee: integer,
  networkId: integer, validityStartHeight: integer, blockNumber: integer.optional(), timestamp: integer.optional(),
  executionResult: z.boolean(), recipientData: z.string().regex(/^(?:[a-f0-9]{2})*$/i).transform((v) => v.toLowerCase()),
});
export const blockSchema = z.object({ number: integer, timestamp: integer, parentHash: hash, network: z.union([integer, z.string()]), type: z.enum(["macro", "micro"]), hash });
export type RpcCoordination = {
  read(key: string): Promise<unknown>; claim(key: string): Promise<string | null>;
  reserve(key: string, cost: number): Promise<number>;
  write(key: string, token: string, payload: unknown, ttlMs: number): Promise<void>;
  defer(key: string, until: number): Promise<void>;
};
export type TrustedRpc = { url: string; authorization?: string | undefined; coordination?: RpcCoordination; requestCount?: number; nextAt?: number; maxRequests?: number; fresh?: boolean };
export class RpcPending extends Error {
  constructor(public retryAfterMs = 10_000) { super(`Verification pending. Check again in ${Math.ceil(retryAfterMs / 1000)} seconds; do not send again.`); }
}
// The configured node does not expose a method at all (e.g. getNetworkId on
// nimiqwatch). Network is then proven strictly by every canonical block.
export class RpcMethodUnsupported extends Error {}
// The precise tested unknown-hash response: HTTP 200, code -32603,
// data "Transaction not found: <hash>". Means pending, never "resend".
export class RpcTransactionNotFound extends Error {}
const UNAVAILABLE = "Nimiq verification unavailable or invalid. Keep this transfer unresolved; do not send again.";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function errorDetails(error: unknown) {
  if (typeof error === "string") return { message: error };
  if (typeof error === "object" && error !== null) {
    const e = error as { code?: unknown; message?: unknown; data?: unknown };
    return { code: e.code, message: e.message, data: e.data };
  }
  return {};
}
// Only server handlers construct this object from configuration. No function accepts a browser URL.
export async function rpc<T>(service: TrustedRpc, method: string, params: unknown[], schema: z.ZodType<T>): Promise<T> {
  const parsed = new URL(service.url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Trusted HTTPS Nimiq service required.");
  const gate = 'nimiq:testnet:shared-outbound';
  const cacheable = method !== 'sendRawTransaction' && !service.fresh;
  const key = `nimiq:testnet:${method}:${JSON.stringify(params)}`;
  const ttl = method === 'getPolicyConstants' || method === 'getMacroBlockBefore' ? 3_600_000 : method === 'getBlockByNumber' ? 120_000 : method === 'getTransactionByHash' ? 5_000 : 1_000;
  if (cacheable && service.coordination) {
    const cached = await service.coordination.read(key);
    if (method === 'getNetworkId' && cached === 'method-unsupported') throw new RpcMethodUnsupported(method);
    if (method === 'getTransactionByHash' && cached === 'transaction-not-found') throw new RpcTransactionNotFound();
    if (cached !== undefined && cached !== null) return schema.parse(cached);
  }
  if ((service.requestCount ?? 0) >= (service.maxRequests ?? 14)) throw new RpcPending();
  const token = cacheable && service.coordination ? await service.coordination.claim(key) : undefined;
  if (cacheable && service.coordination && !token) throw new RpcPending(2000);
  const now = Date.now();
  const slot = service.coordination ? await service.coordination.reserve(gate, method === 'getTransactionsByAddress' ? 2 : 1) : Math.max(now, service.nextAt ?? now);
  if (slot - now > 8000) throw new RpcPending(slot - now);
  if (slot > now) await sleep(slot - now);
  service.nextAt = Date.now() + 750;
  service.requestCount = (service.requestCount ?? 0) + 1;
  let response: Response;
  try {
    response = await fetch(service.url, { method: 'POST', redirect: 'error', headers: {
      'Content-Type': 'application/json', ...(service.authorization ? { Authorization: service.authorization } : {}),
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(8000) });
  } catch { throw new RpcPending(); }
  if (response.status === 429 || response.status >= 500) {
    const retry = response.headers.get('Retry-After');
    const seconds = retry && /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 0;
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    const delay = Math.max(10_000, Number.isFinite(seconds) ? seconds : 0, reset > Date.now() / 1000 ? reset * 1000 - Date.now() : 0);
    await service.coordination?.defer(gate, Date.now() + delay);
    throw new RpcPending(delay);
  }
  if (response.headers.get('x-ratelimit-remaining') === '0') await service.coordination?.defer(gate, Date.now() + 10_000);
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error(UNAVAILABLE); }
  const envelope = z.object({ jsonrpc: z.literal('2.0'), id: z.literal(1), error: z.unknown().optional(), result: z.object({ data: z.unknown() }).optional() }).safeParse(body);
  if (!envelope.success) throw new Error(UNAVAILABLE);
  if (envelope.data.error !== undefined) {
    const { code, message, data } = errorDetails(envelope.data.error);
    if (message === 'Method not allowed') {
      if (method === 'getNetworkId' && token && service.coordination) await service.coordination.write(key, token, 'method-unsupported', 3_600_000);
      throw new RpcMethodUnsupported(method);
    }
    if (method === 'getTransactionByHash' && code === -32603 && data === `Transaction not found: ${params[0]}`) {
      if (token && service.coordination) await service.coordination.write(key, token, 'transaction-not-found', 5000);
      throw new RpcTransactionNotFound();
    }
    throw new Error(UNAVAILABLE);
  }
  if (!response.ok || !envelope.data.result) throw new Error(UNAVAILABLE);
  let result: T;
  try { result = schema.parse(envelope.data.result.data); } catch { throw new Error(UNAVAILABLE); }
  if (token && service.coordination) await service.coordination.write(key, token, result, ttl);
  return result;
}
export function assertRpcNetwork(network: Network, reported: number | string) {
  if (network !== "testnet" || (reported !== 5 && reported !== "TestAlbatross")) throw new Error("Only the trusted testnet network is permitted.");
}
export async function networkHead(service: TrustedRpc, network: Network) {
  try {
    assertRpcNetwork(network, await rpc(service, "getNetworkId", [], z.union([integer, z.string()])));
  } catch (error) {
    // Tolerate only a genuinely unsupported method; every block below still
    // proves the network explicitly. Any other failure stays fatal.
    if (!(error instanceof RpcMethodUnsupported)) throw error;
  }
  if (!await rpc(service, "isConsensusEstablished", [], z.boolean())) throw new Error("Trusted testnet node has no consensus.");
  const height = await rpc(service, "getBlockNumber", [], integer);
  const block = await rpc(service, "getBlockByNumber", [height, false], blockSchema);
  assertRpcNetwork(network, block.network);
  if (block.number !== height) throw new Error("Head block mismatch.");
  return block;
}
const policySchema = z.object({ blocksPerBatch: integer.positive().max(128), genesisBlockNumber: integer });
export async function finalizedHeight(service: TrustedRpc, network: Network, head: number) {
  const height = await rpc(service, 'getMacroBlockBefore', [head + 1], integer);
  if (height > head) throw new Error('Finality checkpoint above head.');
  const macro = await rpc(service, 'getBlockByNumber', [height, false], blockSchema);
  assertRpcNetwork(network, macro.network);
  if (macro.number !== height || macro.type !== 'macro') throw new Error('Invalid canonical macro checkpoint.');
  return macro;
}
export function referenceHex(reference: string) {
  const bytes = new TextEncoder().encode(reference);
  if (bytes.length > 64) throw new Error("Payout reference too long.");
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
}
export async function verifyTransfer(service: TrustedRpc, expected: ExpectedPayment, reference?: string) {
  const head = await networkHead(service, expected.network);
  let tx: z.infer<typeof transactionSchema> | null;
  try {
    tx = await rpc(service, "getTransactionByHash", [expected.txHash], transactionSchema.nullable());
  } catch (error) {
    if (error instanceof RpcTransactionNotFound) return false; // pending; never resend
    throw error;
  }
  if (!tx) return false;
  if (!validatePaymentEvidence(tx, expected, head.number)) return false;
  if (tx.blockNumber === undefined) return false;
  const policy = await rpc(service, 'getPolicyConstants', [], policySchema);
  if (tx.blockNumber < policy.genesisBlockNumber) throw new Error('Invalid inclusion policy height.');
  const nextMacro = policy.genesisBlockNumber + (Math.floor((tx.blockNumber - policy.genesisBlockNumber) / policy.blocksPerBatch) + 1) * policy.blocksPerBatch;
  if (nextMacro > head.number) return false;
  const checkpoint = await rpc(service, 'getMacroBlockBefore', [nextMacro + 1], integer);
  if (checkpoint !== nextMacro) throw new Error('Macro policy checkpoint mismatch.');
  const macro = await rpc(service, 'getBlockByNumber', [checkpoint, false], blockSchema);
  assertRpcNetwork(expected.network, macro.network);
  if (macro.number !== checkpoint || macro.type !== 'macro') throw new Error('Invalid canonical macro checkpoint.');
  if (!validatePaymentEvidence(tx, expected, macro.number)) return false;
  if (reference !== undefined && tx.recipientData !== referenceHex(reference)) throw new Error("Payout reference mismatch.");
  const canonical = await rpc(service, "getBlockByNumber", [tx.blockNumber, true], blockSchema.extend({ transactions: z.array(transactionSchema) }));
  assertRpcNetwork(expected.network, canonical.network);
  if (canonical.number !== tx.blockNumber || canonical.type !== "micro") throw new Error("Invalid canonical inclusion block.");
  const included = canonical.transactions.find((item) => item.hash === tx.hash);
  if (!included || !validatePaymentEvidence(included, expected, macro.number) || (reference !== undefined && included.recipientData !== referenceHex(reference))) throw new Error("Transfer absent from canonical block.");
  if (included.blockNumber !== canonical.number || included.timestamp !== canonical.timestamp || tx.timestamp !== canonical.timestamp) throw new Error("Canonical transaction metadata mismatch.");
  // Bind inclusion to the finalizing macro by canonical parent hashes, even on mixed backends.
  let child = macro;
  for (let height = macro.number - 1; height >= canonical.number; height--) {
    if (macro.number - height > 128) throw new Error("Finality ancestry exceeds verification limit.");
    const parent = height === canonical.number ? canonical : await rpc(service, "getBlockByNumber", [height, false], blockSchema);
    assertRpcNetwork(expected.network, parent.network);
    if (parent.number !== height || child.parentHash !== parent.hash) throw new Error("Finality ancestry mismatch.");
    child = parent;
  }
  // Re-read finalizing block to detect a moving/inconsistent endpoint during verification.
  const stable = await rpc({ ...service, fresh: true }, "getBlockByNumber", [macro.number, false], blockSchema);
  assertRpcNetwork(expected.network, stable.network);
  if (stable.number !== macro.number || stable.type !== "macro" || stable.hash !== macro.hash) throw new Error("Finality changed during verification.");
  return true;
}
export async function findPayoutHashes(service: TrustedRpc, sender: string, reference: string) {
  await networkHead(service, "testnet");
  let cursor: string | null = null;
  const found = new Set<string>();
  for (let page = 0; page < 10; page++) {
    const rows: z.infer<typeof transactionSchema>[] = await rpc(service, "getTransactionsByAddress", [sender, 100, cursor], z.array(transactionSchema));
    for (const tx of rows) if (tx.from === sender && tx.recipientData === referenceHex(reference)) found.add(tx.hash);
    if (rows.length < 100) return [...found];
    const last: z.infer<typeof transactionSchema> | undefined = rows.at(-1);
    if (!last || last.hash === cursor) throw new Error("Incomplete payout history. Never resend.");
    cursor = last.hash;
  }
  throw new Error("History limit reached. Reconciliation incomplete; never resend.");
}
