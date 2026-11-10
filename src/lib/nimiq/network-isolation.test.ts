import { describe, it, expect } from "vitest";
import { assertRpcNetwork } from "./rpc.server";
describe("network isolation", () => {
  it("accepts mainnet only from a MainAlbatross node", () => {
    expect(() => assertRpcNetwork("mainnet", 24)).not.toThrow();
    expect(() => assertRpcNetwork("mainnet", 5)).toThrow();
  });
  it("accepts testnet only from a TestAlbatross node", () => {
    expect(() => assertRpcNetwork("testnet", 5)).not.toThrow();
    expect(() => assertRpcNetwork("testnet", "MainAlbatross")).toThrow();
  });
});
import { ledger, HUB_ENDPOINTS, NETWORK_IDS } from "./net";
import { verifyHubTransaction } from "./hub-verification";
describe("mainnet payout ledger isolation", () => {
  it("routes mainnet payouts only to mainnet tables, functions and Hub", () => {
    const m = ledger("mainnet") as Record<string, string>, t = ledger("testnet") as Record<string, string>;
    for (const k of Object.keys(m)) { expect(m[k]).toContain("mainnet"); expect(t[k]).toContain("testnet"); }
    expect(HUB_ENDPOINTS.mainnet).toBe("https://hub.nimiq.com");
    expect(NETWORK_IDS.mainnet).toBe(24);
  });
  it("rejects a testnet-signed payout when mainnet is expected", () => {
    // Any non-mainnet bytes fail closed before signature checks.
    expect(() => verifyHubTransaction("01", "a".repeat(64), { sender: "NQ85 VQSH L0A0 695R VB5R 63J9 3DHX KQGT 4RYD", recipient: "NQ08 FDD0 FXAH QGS5 TDXM A1MV 9Y41 675H G2GA", amountLuna: 1, reference: "NIMAURA:x", validityStartHeight: 1, networkId: 24 })).toThrow();
  });
});
