export type Network = "mainnet" | "testnet";
export const LUNA_PER_NIM = 100_000;
export const CHALLENGE_TTL_MS = 5 * 60_000;
export const QUOTE_TTL_MS = 5 * 60_000;
const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVXY";

export function normalizeAddress(address: string) {
  return address.replace(/\s/g, "").toUpperCase();
}
function ibanRemainder(value: string) {
  let remainder = 0;
  for (const char of value) {
    const numeric = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}
export function isValidNimiqAddress(value: string) {
  const address = normalizeAddress(value);
  return /^NQ\d{2}[0-9A-HJ-NP-VXY]{32}$/.test(address) && ibanRemainder(address.slice(4) + address.slice(0, 4)) === 1;
}
export function addressFromBytes(bytes: Uint8Array) {
  if (bytes.length !== 20) throw new Error("Invalid address length");
  let buffer = 0, bits = 0, payload = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      payload += ALPHABET[(buffer >>> bits) & 31];
    }
  }
  return `NQ${String(98 - ibanRemainder(payload + "NQ00")).padStart(2, "0")}${payload}`;
}
export function quoteAmounts(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Price feed unavailable");
  // Even Luna amount makes the allocation exactly 50/50 without fractional Luna.
  const amountLuna = Math.ceil(LUNA_PER_NIM / rate / 2) * 2;
  if (!Number.isSafeInteger(amountLuna) || amountLuna <= 0) throw new Error("Invalid payment amount");
  return { amountLuna, savingsLuna: amountLuna / 2 };
}
export function requireUnexpired(expiresAt: string, now = Date.now()) {
  if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now) throw new Error("Expired. Request a new quote or wallet verification.");
}