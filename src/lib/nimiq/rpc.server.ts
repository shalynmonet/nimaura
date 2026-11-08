import { z } from "zod";
import type { Network } from "./rules";

export async function rpc<T>(url: string, method: string, params: unknown[], schema: z.ZodType<T>) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Trusted HTTPS Nimiq service required.");
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("Unavailable");
    const envelope = z.object({ error: z.unknown().optional(), result: z.object({ data: z.unknown() }).optional() }).parse(await response.json());
    if (envelope.error || !envelope.result) throw new Error("Unavailable");
    return schema.parse(envelope.result.data);
  } catch { throw new Error("Nimiq verification service is unavailable. Your payment remains pending; do not pay again."); }
}
export const blockSchema = z.object({ number: z.number().int(), network: z.union([z.number(), z.string()]), type: z.string(), hash: z.string() });
export function assertRpcNetwork(network: Network, reported: number | string) {
  if (reported !== (network === "mainnet" ? 24 : 5) && reported !== (network === "mainnet" ? "MainAlbatross" : "TestAlbatross")) throw new Error("Nimiq service network mismatch. Payment disabled.");
}
export async function networkHead(url: string, network: Network) {
  const height = await rpc(url, "getBlockNumber", [], z.number().int().nonnegative());
  const block = await rpc(url, "getBlockByNumber", [height, false], blockSchema);
  assertRpcNetwork(network, block.network);
  return block;
}
export async function finalizedHeight(url: string, network: Network, head: number) {
  // Find a canonical committed macro block rather than equating confirmations to finality.
  for (let height = head; height >= Math.max(0, head - 128); height--) {
    const block = await rpc(url, "getBlockByNumber", [height, false], blockSchema);
    assertRpcNetwork(network, block.network);
    if (block.type === "Macro") return block.number;
  }
  throw new Error("Finalized Nimiq block unavailable. Payment remains pending.");
}