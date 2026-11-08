import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ network: "mainnet" as string | undefined, list: vi.fn(), sign: vi.fn(), send: vi.fn(), consensus: vi.fn(), init: vi.fn() }));
vi.mock("@nimiq/mini-app-sdk", () => ({
  getHostNetwork: () => mock.network,
  init: mock.init,
  NimiqProviderError: { is: (e: unknown) => typeof e === "object" && e !== null && "type" in e },
}));
import { connectWallet, hostNetwork, initiatePayment, signWalletChallenge, walletError, type Quote } from "./index";
describe("Documented SDK integration", () => {
  beforeEach(() => {
    mock.network = "mainnet";
    mock.list.mockResolvedValue(["NQ07 0000 0000 0000 0000 0000 0000 0000 0000"]);
    mock.sign.mockResolvedValue({ publicKey: "public", signature: "signature" });
    mock.send.mockResolvedValue("a".repeat(64));
    mock.consensus.mockResolvedValue(true);
    mock.init.mockResolvedValue({ listAccounts: mock.list, sign: mock.sign, sendBasicTransaction: mock.send, isConsensusEstablished: mock.consensus });
    mock.send.mockClear();
  });
  it("initializes the injected provider and requests listAccounts", async () => {
    expect(await connectWallet()).toEqual({ accounts: ["NQ0700000000000000000000000000000000"], network: "mainnet" });
    expect(mock.init).toHaveBeenCalledWith({ timeout: 5000 });
    expect(mock.list).toHaveBeenCalled();
  });
  it("signs the exact server-provided challenge", async () => {
    await signWalletChallenge("unique expiring server challenge");
    expect(mock.sign).toHaveBeenCalledWith("unique expiring server challenge");
  });
  it("refuses to guess the network when the host omits it", async () => {
    mock.network = undefined;
    expect(await hostNetwork()).toBeUndefined();
    await expect(connectWallet()).rejects.toThrow("did not report its network");
  });
  const quote: Quote = { id: "quote", network: "mainnet", recipient: "NQ0700000000000000000000000000000000", sender: "NQ0700000000000000000000000000000000", amountLuna: 100_000, savingsLuna: 50_000, rate: 1, expiresAt: "2099-01-01T00:00:00Z", validityStartHeight: 123, status: "quoted", txHash: null, manifestationId: null };
  it("requests sendBasicTransaction with exact Luna rather than NIM", async () => {
    expect(await initiatePayment(quote)).toBe("a".repeat(64));
    expect(mock.send).toHaveBeenCalledWith({ recipient: quote.recipient, value: 100_000, validityStartHeight: 123 });
  });
  it("does not submit after a host network change", async () => {
    mock.network = "testnet";
    await expect(initiatePayment(quote)).rejects.toThrow("network changed");
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("does not submit expired quotes", async () => {
    await expect(initiatePayment({ ...quote, expiresAt: "2000-01-01T00:00:00Z" })).rejects.toThrow("Expired");
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("handles native wallet cancellation", async () => {
    expect(await walletError({ type: "PERMISSION_DENIED" })).toContain("canceled");
  });
});