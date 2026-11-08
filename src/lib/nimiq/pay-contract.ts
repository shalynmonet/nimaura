import { ed25519 } from '@noble/curves/ed25519.js';
import { blake2b } from '@noble/hashes/blake2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { normalizeAddress, isValidNimiqAddress } from './rules';
import { publicKeyAddress } from './verification';

// Official nimiq-pay-app lib/index.ts and lib/tx.ts; Core EarlyResolve proof
// order is recipient then sender. Support only canonical single Ed25519 proofs.
const TESTNET_COSIGNERS = new Set([
  'c1534c708122968212c6709526801d18218ce9303590f2bca473213d99b24aaf',
  '1a0fc4eb1376b604c7df66d098b29bbb2fcfd68ef328ce98ae0f7d19f4f6d456',
]);
export type PayContract = { address: string; type: 'htlc'; sender: string; recipient: string };
export type PayTransaction = { hash: string; from: string; to: string; fromType?: number | undefined; toType?: number | undefined; value: number; fee: number; validityStartHeight: number; networkId: number; senderData?: string | undefined; recipientData: string; flags?: number | undefined; proof?: string | undefined };
function addressBytes(value: string) {
  if (!isValidNimiqAddress(value)) throw new Error('Invalid contract address.');
  const alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVXY';
  let acc = 0, bits = 0;
  const out: number[] = [];
  for (const c of normalizeAddress(value).slice(4)) {
    acc = (acc << 5) | alphabet.indexOf(c); bits += 5;
    if (bits >= 8) { bits -= 8; out.push((acc >>> bits) & 255); }
  }
  return Uint8Array.from(out);
}
export function payTransactionContent(tx: PayTransaction) {
  const data = hexToBytes(tx.recipientData);
  if (data.length > 64 || tx.senderData !== '' || tx.fromType !== 2 || tx.toType !== 0 || tx.flags !== 0 || tx.networkId !== 5 || tx.fee !== 0) throw new Error('Unsupported Pay contract transaction.');
  const result = new Uint8Array(67 + data.length); let pos = 0;
  const put = (bytes: Uint8Array) => { result.set(bytes, pos); pos += bytes.length; };
  const uint = (value: number, size: number) => {
    if (!Number.isSafeInteger(value) || value < 0 || BigInt(value) >= 1n << BigInt(size * 8)) throw new Error('Invalid transaction integer.');
    const out = new Uint8Array(size); let n = BigInt(value);
    for (let i = size - 1; i >= 0; i--) { out[i] = Number(n & 255n); n >>= 8n; }
    put(out);
  };
  uint(data.length, 2); put(data); put(addressBytes(tx.from)); uint(2, 1);
  put(addressBytes(tx.to)); uint(0, 1); uint(tx.value, 8); uint(tx.fee, 8);
  uint(tx.validityStartHeight, 4); uint(5, 1); uint(0, 1); uint(0, 1);
  return result;
}
export function verifyPayContract(tx: PayTransaction, payer: string, contract: PayContract) {
  if (contract.type !== 'htlc' || normalizeAddress(contract.address) !== normalizeAddress(tx.from) || normalizeAddress(contract.sender) !== normalizeAddress(payer)) throw new Error('Pay contract owner mismatch.');
  if (!tx.proof || !/^[a-f0-9]{394}$/i.test(tx.proof)) throw new Error('Unsupported Pay contract proof.');
  const proof = hexToBytes(tx.proof), content = payTransactionContent(tx);
  if (proof[0] !== 1 || bytesToHex(blake2b(content, { dkLen: 32 })) !== tx.hash.toLowerCase()) throw new Error('Pay contract hash/proof mismatch.');
  for (const [offset, signer] of [[1, contract.recipient], [99, payer]] as const) {
    if (proof[offset] !== 0 || proof[offset + 33] !== 0) throw new Error('Unsupported Pay signature proof.');
    const key = proof.slice(offset + 1, offset + 33), signature = proof.slice(offset + 34, offset + 98);
    const keyHex = bytesToHex(key);
    if ((offset === 1 && !TESTNET_COSIGNERS.has(keyHex)) || publicKeyAddress(keyHex) !== normalizeAddress(signer) || !ed25519.verify(signature, content, key, { zip215: false })) throw new Error('Invalid Pay contract signature/identity.');
  }
  return true;
}