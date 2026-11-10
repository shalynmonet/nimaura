import { describe, it, expect } from 'vitest';
import { classifySubmissionError, submissionMessage, singleFlight, candidateStorageKey, canReleaseUnmatched } from './submission';
describe('wallet outcome safety', () => {
  it('separates explicit denial, rejection and unknown network failure', () => {
    expect(classifySubmissionError({type:'PERMISSION_DENIED'})).toBe('cancelled');
    expect(classifySubmissionError({type:'INVALID_REQUEST'})).toBe('rejected');
    expect(classifySubmissionError({type:'NETWORK_ERROR'})).toBe('unknown');
    expect(classifySubmissionError(new Error('cancelled maybe'))).toBe('unknown');
  });
  it('blocks duplicate taps synchronously', () => {
    const flight=singleFlight(); expect(flight.enter()).toBe(true); expect(flight.enter()).toBe(false);
    flight.leave(); expect(flight.enter()).toBe(true);
  });
  it('scopes recovery hashes to account and purchase without authorizing fulfillment', () => {
    expect(candidateStorageKey('a','q')).not.toBe(candidateStorageKey('b','q'));
    expect(candidateStorageKey('a','q')).not.toBe(candidateStorageKey('a','r'));
    localStorage.setItem(candidateStorageKey('a','q'),'a'.repeat(64));
    expect(localStorage.getItem(candidateStorageKey('a','q'))).toBe('a'.repeat(64));
  });
});
describe('unresolved purchase release', () => {
  const base = { headHeight: 20_000, quoteHeight: 5_000, validityWindow: 7_200, expiresAt: '2026-11-08T03:53:29Z', now: Date.parse('2026-11-08T08:00:00Z'), historyComplete: true, matchingTransfers: 0, hasEvidence: false };
  it('allows release only after two validity windows past the quote height', () => {
    expect(canReleaseUnmatched(base)).toBe(true);
    expect(canReleaseUnmatched({ ...base, headHeight: 5_000 + 14_399 })).toBe(false);
    expect(canReleaseUnmatched({ ...base, headHeight: 5_000 + 14_400 })).toBe(true);
  });
  it('never releases with a hash, a matching transfer, incomplete history, unknown policy or an open quote', () => {
    expect(canReleaseUnmatched({ ...base, hasEvidence: true })).toBe(false);
    expect(canReleaseUnmatched({ ...base, matchingTransfers: 1 })).toBe(false);
    expect(canReleaseUnmatched({ ...base, historyComplete: false })).toBe(false);
    expect(canReleaseUnmatched({ ...base, validityWindow: undefined })).toBe(false);
    expect(canReleaseUnmatched({ ...base, now: Date.parse('2026-11-08T03:50:00Z') })).toBe(false);
  });
});
import { canReleaseUnmatched as canClose } from "./submission";
describe("evidence-based closing", () => {
  const base = { headHeight: 100, quoteHeight: 100, validityWindow: 7200, expiresAt: new Date(Date.now() + 60_000).toISOString(), now: Date.now(), historyComplete: true, matchingTransfers: 0, hasEvidence: false };
  it("lets an explicitly cancelled purchase close right away when history holds no match", () => { expect(canClose({ ...base, cancelled: true })).toBe(true); });
  it("never closes a cancelled purchase with a hash, a matching transfer or incomplete history", () => {
    expect(canClose({ ...base, cancelled: true, hasEvidence: true })).toBe(false);
    expect(canClose({ ...base, cancelled: true, matchingTransfers: 1 })).toBe(false);
    expect(canClose({ ...base, cancelled: true, historyComplete: false })).toBe(false);
  });
  it("does not close an unknown outcome just because time passed or lookup was empty", () => {
    expect(canClose({ ...base, expiresAt: new Date(Date.now() - 1).toISOString(), now: Date.now() + 1000 })).toBe(false);
    expect(canClose({ ...base, expiresAt: new Date(Date.now() - 1).toISOString(), headHeight: 100 + 14_400, now: Date.now() + 1000 })).toBe(true);
  });
});
