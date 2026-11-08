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
export type TrustedRpc = { url: string; authorization?: string | undefined };
// Only server handlers construct this object from configuration. No function accepts a browser URL.
export async function rpc<T>(service: TrustedRpc, method: string, params: unknown[], schema: z.ZodType<T>): Promise<T> {
  const parsed = new URL(service.url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Trusted HTTPS Nimiq service required.");
  try {
    const response = await fetch(service.url, { method: "POST", redirect: "error", headers: {
      "Content-Type": "application/json", ...(service.authorization ? { Authorization: service.authorization } : {}),
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error("Unavailable");
    const envelope = z.object({ jsonrpc: z.literal("2.0"), id: z.literal(1), error: z.unknown().optional(), result: z.object({ data: z.unknown() }).optional() }).parse(await response.json());
    if (envelope.error !== undefined || !envelope.result) throw new Error("Unavailable");
    return schema.parse(envelope.result.data);
  } catch { throw new Error("Nimiq verification unavailable or invalid. Keep this transfer unresolved; do not send again."); }
}
export function assertRpcNetwork(network: Network, reported: number | string) {
  if (network !== "testnet" || (reported !== 5 && reported !== "TestAlbatross")) throw new Error("Only the trusted testnet network is permitted.");
}
export async function networkHead(service: TrustedRpc, network: Network) {
  assertRpcNetwork(network, await rpc(service, "getNetworkId", [], z.union([integer, z.string()])));
  if (!await rpc(service, "isConsensusEstablished", [], z.boolean())) throw new Error("Trusted testnet node has no consensus.");
  const height = await rpc(service, "getBlockNumber", [], integer);
  const block = await rpc(service, "getBlockByNumber", [height, false], blockSchema);
  assertRpcNetwork(network, block.network);
  if (block.number !== height) throw new Error("Head block mismatch.");
  return block;
}
export async function finalizedHeight(service: TrustedRpc, network: Network, head: number) {
  // Fetch a bounded canonical window in parallel. No assumed epoch length or head-as-finality.
  for (let top = head; top >= Math.max(0, head - 128); top -= 16) {
    const heights = Array.from({ length: Math.min(16, top - Math.max(0, head - 128) + 1) }, (_, i) => top - i);
    const blocks = await Promise.all(heights.map(async (height) => {
      const block = await rpc(service, "getBlockByNumber", [height, false], blockSchema);
      assertRpcNetwork(network, block.network);
      if (block.number !== height) throw new Error("Canonical height mismatch.");
      return block;
    }));
    const macro = blocks.find((b) => b.type === "macro");
    if (macro) return macro;
  }
  throw new Error("No canonical macro finality found. Keep transfer unresolved.");
}
export function referenceHex(reference: string) {
  const bytes = new TextEncoder().encode(reference);
  if (bytes.length > 64) throw new Error("Payout reference too long.");
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
}
export async function verifyTransfer(service: TrustedRpc, expected: ExpectedPayment, reference?: string) {
  const head = await networkHead(service, expected.network);
  const tx = await rpc(service, "getTransactionByHash", [expected.txHash], transactionSchema.nullable());
  if (!tx) return false;
  const macro = await finalizedHeight(service, expected.network, head.number);
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
  const stable = await rpc(service, "getBlockByNumber", [macro.number, false], blockSchema);
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