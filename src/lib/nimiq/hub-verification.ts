import { ed25519 } from '@noble/curves/ed25519.js';
import { blake2b } from '@noble/hashes/blake2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { addressFromBytes, normalizeAddress, isValidNimiqAddress } from './rules';

// Narrow Albatross extended/basic-account single-Ed25519 decoder. No WASM on the server.
// Official core-rs-albatross primitives/transaction serializeContent and signature_proof;
// parity is tested against installed Core. Other account/proof formats fail closed.
export type HubPayoutIntent = { sender: string; recipient: string; amountLuna: number; reference: string; validityStartHeight: number };
export function verifyHubTransaction(serializedTx: string, expectedHash: string, intent: HubPayoutIntent) {
  if (!/^(?:[a-f0-9]{2})+$/i.test(serializedTx) || serializedTx.length > 4096 || !/^[a-f0-9]{64}$/i.test(expectedHash)) throw new Error('Invalid transaction encoding.');
  if (!Number.isSafeInteger(intent.amountLuna) || intent.amountLuna <= 0 || !Number.isInteger(intent.validityStartHeight) || intent.validityStartHeight < 0 || intent.validityStartHeight > 0xffffffff || !isValidNimiqAddress(intent.sender) || !isValidNimiqAddress(intent.recipient)) throw new Error('Invalid payout intent.');
  const bytes = hexToBytes(serializedTx);
  let pos = 0;
  const read = (length: number) => { if (pos + length > bytes.length) throw new Error('Truncated transaction.'); const v = bytes.slice(pos, pos + length); pos += length; return v; };
  const byte = () => read(1)[0] ?? -1;
  const vector = () => {
    // All supported vectors <= 98 bytes: require canonical single-byte LEB128.
    const length = byte();
    if (length < 0 || length > 127) throw new Error('Unsupported vector length.');
    return read(length);
  };
  const number = (length: number) => { let n = 0n; for (const b of read(length)) n = (n << 8n) | BigInt(b); if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Unsafe Luna.'); return Number(n); };
  if (byte() !== 1) throw new Error('Reference-bearing extended transaction required.');
  const sender = read(20), senderType = byte(), senderData = vector();
  const recipient = read(20), recipientType = byte(), data = vector();
  const value = number(8), fee = number(8), height = number(4), network = byte(), flags = byte();
  const contentEnd = pos;
  const proof = vector();
  if (pos !== bytes.length || senderType !== 0 || recipientType !== 0 || senderData.length !== 0 || network !== 5 || flags !== 0 || fee !== 0 || proof.length !== 98 || proof[0] !== 0 || proof[33] !== 0) throw new Error('Unsupported testnet transaction or proof.');
  const reference = new TextEncoder().encode(intent.reference);
  if (!reference.length || reference.length > 64 || bytesToHex(data) !== bytesToHex(reference) || addressFromBytes(sender) !== normalizeAddress(intent.sender) || addressFromBytes(recipient) !== normalizeAddress(intent.recipient) || value !== intent.amountLuna || height !== intent.validityStartHeight) throw new Error('Signed transaction intent mismatch.');
  // Content is BE16 recipient-data length + data + fields + empty Albatross sender vector.
  // Wire layout has a format byte and LEB vectors; never hash the wire bytes.
  // Reconstruct explicit fields rather than trusting Hub raw metadata.
  const tailStart = contentEnd - 22; // value(8), fee(8), height(4), network, flags
  const content = new Uint8Array(67 + data.length);
  let c = 0;
  const put = (b: Uint8Array) => { content.set(b, c); c += b.length; };
  put(Uint8Array.of(0, data.length)); put(data); put(sender); put(Uint8Array.of(senderType)); put(recipient); put(Uint8Array.of(recipientType)); put(bytes.slice(tailStart, contentEnd)); put(Uint8Array.of(0));
  const key = proof.slice(1, 33), signature = proof.slice(34);
  if (addressFromBytes(blake2b(key, { dkLen: 32 }).slice(0, 20)) !== normalizeAddress(intent.sender) || !ed25519.verify(signature, content, key, { zip215: false })) throw new Error('Invalid treasury signature.');
  const hash = bytesToHex(blake2b(content, { dkLen: 32 }));
  if (hash !== expectedHash.toLowerCase()) throw new Error('Transaction hash mismatch.');
  return { hash, serializedTx: bytesToHex(bytes) };
}