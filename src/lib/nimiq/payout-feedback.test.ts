import { describe, expect, it } from 'vitest';
import { deliveryFeedback } from './payout-feedback';
describe('delivery check pacing', () => {
  it('honors the returned verification delay', () => {
    expect(deliveryFeedback({ status: 'uncertain', retryAfterMs: 60_000 }).delayMs).toBe(60_000);
  });
  it('paces unresolved results without a provider delay', () => {
    expect(deliveryFeedback({ status: 'uncertain' }).delayMs).toBe(10_000);
  });
  it('does not delay a finalized delivery', () => {
    expect(deliveryFeedback({ status: 'paid' }).delayMs).toBe(0);
  });
});