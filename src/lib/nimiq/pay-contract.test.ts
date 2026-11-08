import { describe, it, expect } from 'vitest';
import fixture from './fixtures/pay-htlc-testnet.json';
import { verifyPayContract, type PayContract } from './pay-contract';
const tx = fixture.transaction;
const contract = { ...fixture.contract, type: 'htlc' as const };
const payer = contract.sender;
describe('real Pay testnet EarlyResolve authorization (public read-only fixture)', () => {
  it('verifies both actual signatures, content hash and contract owner', () => {
    expect(verifyPayContract(tx, payer, contract)).toBe(true);
  });
  it('rejects a related cosigner as the quote payer', () => {
    expect(() => verifyPayContract(tx, contract.recipient, contract)).toThrow('owner');
  });
  it.each(['sender', 'recipient', 'address'])('rejects changed authoritative contract %s', field => {
    expect(() => verifyPayContract(tx, payer, { ...contract, [field]: tx.to } as PayContract)).toThrow();
  });
  it.each([1, 34, 99, 132])('rejects altered proof byte %s', byte => {
    const proof = tx.proof.slice(0, byte * 2) + (tx.proof.slice(byte * 2, byte * 2 + 2) === 'ff' ? '00' : 'ff') + tx.proof.slice(byte * 2 + 2);
    expect(() => verifyPayContract({ ...tx, proof }, payer, contract)).toThrow();
  });
  it.each(['00', '02'])('rejects non-early proof variant %s', variant => {
    expect(() => verifyPayContract({ ...tx, proof: variant + tx.proof.slice(2) }, payer, contract)).toThrow();
  });
  it('rejects trailing proof data', () => { expect(() => verifyPayContract({ ...tx, proof: tx.proof + '00' }, payer, contract)).toThrow(); });
  it.each(['value', 'validityStartHeight'])('rejects changed signed %s', field => {
    expect(() => verifyPayContract({ ...tx, [field]: tx[field as 'value'] + 1 }, payer, contract)).toThrow();
  });
  it('rejects mainnet', () => { expect(() => verifyPayContract({ ...tx, networkId: 24 }, payer, contract)).toThrow(); });
  it('rejects swapped proof parties', () => { expect(() => verifyPayContract({ ...tx, proof: '01' + tx.proof.slice(198) + tx.proof.slice(2, 198) }, payer, contract)).toThrow(); });
});