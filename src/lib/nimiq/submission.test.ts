import { describe, it, expect } from 'vitest';
import { classifySubmissionError, submissionMessage, singleFlight, candidateStorageKey } from './submission';
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