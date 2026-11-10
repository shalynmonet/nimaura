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
