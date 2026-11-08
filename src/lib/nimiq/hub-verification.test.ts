// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as Core from '@nimiq/core'; // Node fixture only, never application/server graph.
import { ed25519 } from '@noble/curves/ed25519.js';
import { verifyHubTransaction, type HubPayoutIntent } from './hub-verification';
import { publicKeyAddress, signedMessageHash, verifyWalletSignature } from './verification';
import { bytesToHex } from '@noble/hashes/utils.js';

const seed = Uint8Array.from({ length: 32 }, (_, i) => i);
const key = ed25519.getPublicKey(seed);
const sender = publicKeyAddress(bytesToHex(key));
const recipient = new Core.Address(new Uint8Array(20).fill(17)).toUserFriendlyAddress();
const intent: HubPayoutIntent = { sender, recipient, amountLuna: 50000, reference: 'NIMAURA:00000000-0000-4000-8000-000000000009', validityStartHeight: 1234 };
function fixture(overrides: { net?: number; fee?: bigint; flags?: number; data?: string; signer?: Uint8Array } = {}) {
  const privateKey = new Core.PrivateKey(overrides.signer ?? seed);
  const publicKey = Core.PublicKey.derive(privateKey);
  const tx = new Core.Transaction(Core.Address.fromAny(sender), 0, new Uint8Array(), Core.Address.fromAny(recipient), 0, new TextEncoder().encode(overrides.data ?? intent.reference), 50000n, overrides.fee ?? 0n, overrides.flags ?? 0, 1234, overrides.net ?? 5);
  tx.proof = Core.SignatureProof.singleSig(publicKey, Core.Signature.create(privateKey, publicKey, tx.serializeContent())).serialize();
  return { tx, hex: tx.toHex(), hash: tx.hash() };
}
describe('Hub portable server verification against installed official Core', () => {
  it('accepts a real Core-encoded reference transfer and matches hash/signature', () => {
    const f = fixture(); f.tx.verify(0, 5);
    expect(verifyHubTransaction(f.hex, f.hash, intent)).toEqual({ hash: f.hash, serializedTx: f.hex });
  });
  it.each(['sender', 'recipient', 'amountLuna', 'reference', 'validityStartHeight'] as const)('rejects changed %s snapshot', field => {
    const f = fixture(); const changed = { ...intent };
    if (field === 'sender') changed.sender = recipient;
    if (field === 'recipient') changed.recipient = sender;
    if (field === 'amountLuna') changed.amountLuna++;
    if (field === 'reference') changed.reference += 'x';
    if (field === 'validityStartHeight') changed.validityStartHeight++;
    expect(() => verifyHubTransaction(f.hex, f.hash, changed)).toThrow();
  });
  it.each([{ net: 24 }, { fee: 1n }, { flags: 1 }, { data: 'wrong' }, { signer: new Uint8Array(32).fill(8) }])('rejects incompatible signed intent %#', override => {
    const f = fixture(override); expect(() => verifyHubTransaction(f.hex, f.hash, intent)).toThrow();
  });
  it('rejects invalid signature, forged hash, trailing bytes and truncated encoding', () => {
    const f = fixture();
    expect(() => verifyHubTransaction(f.hex.slice(0, -2) + 'ff', f.hash, intent)).toThrow();
    expect(() => verifyHubTransaction(f.hex, 'f'.repeat(64), intent)).toThrow(/hash/);
    expect(() => verifyHubTransaction(f.hex + '00', f.hash, intent)).toThrow();
    expect(() => verifyHubTransaction(f.hex.slice(0, -4), f.hash, intent)).toThrow();
  });
  it('rejects fractional or unsafe Luna and unsupported proof algorithms', () => {
    const f = fixture();
    for (const amountLuna of [0.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => verifyHubTransaction(f.hex, f.hash, { ...intent, amountLuna })).toThrow();
    const bytes = f.tx.serialize(); bytes[bytes.length - 98] = 1;
    expect(() => verifyHubTransaction(bytesToHex(bytes), f.hash, intent)).toThrow(/proof/);
  });
  it('binds message signature to exact challenge and address', () => {
    const message = 'NIMAURA testnet one-use challenge';
    const signature = bytesToHex(ed25519.sign(signedMessageHash(message), seed));
    expect(verifyWalletSignature(message, sender, bytesToHex(key), signature)).toBe(true);
    expect(verifyWalletSignature(message + 'x', sender, bytesToHex(key), signature)).toBe(false);
    expect(verifyWalletSignature(message, recipient, bytesToHex(key), signature)).toBe(false);
    expect(verifyWalletSignature(message, sender, bytesToHex(key), '0'.repeat(128))).toBe(false);
  });
});