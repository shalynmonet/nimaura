export const WALLET_WATCHDOG_MS = 30_000;
export type SubmissionOutcome = 'not_requested' | 'awaiting_wallet' | 'cancelled' | 'rejected' | 'unknown' | 'hash_received';
export function submissionMessage(outcome: string | undefined, hasHash: boolean) {
  if (hasHash) return 'Transaction hash received—checking finalized payment. Do not pay again.';
  if (outcome === 'awaiting_wallet') return 'Waiting for wallet approval. A submitted transaction has not been confirmed.';
  if (outcome === 'cancelled') return 'Wallet approval was cancelled. Checking that no payment arrived; you can then close this purchase and try again.';
  if (outcome === 'rejected') return 'The wallet request was rejected. This does not establish whether funds moved; checking this purchase only.';
  return 'Submission outcome unknown—checking. Do not pay again.';
}
export function classifySubmissionError(error: unknown): 'cancelled' | 'rejected' | 'unknown' {
  const type = error && typeof error === 'object' && 'type' in error ? error.type : null;
  if (type === 'PERMISSION_DENIED') return 'cancelled';
  if (type === 'INVALID_REQUEST' || type === 'INVALID_PARAMS' || type === 'UNSUPPORTED_METHOD') return 'rejected';
  return 'unknown';
}
export function candidateStorageKey(userId: string, quoteId: string) { return `nimaura:submission:${userId}:${quoteId}`; }
/** Same mounted purchase can have only one wallet invocation, even before React redraws. */
export function singleFlight() {
  let running = false;
  return { enter: () => { if (running) return false; running = true; return true; }, leave: () => { running = false; } };
}/**
 * An unresolved purchase without any hash may be released only once no wallet-signed
 * transaction for it can still be included: the quote's inclusion window is closed,
 * the head is two validity windows past the quote height (covering a signature made
 * while the quote was open), and complete receiving history holds no matching transfer.
 */
export function releaseAfterHeight(quoteHeight: number, validityWindow: number) { return quoteHeight + 2 * validityWindow; }
export function canReleaseUnmatched(input: { headHeight: number; quoteHeight: number; validityWindow: number | undefined; expiresAt: string; now: number; historyComplete: boolean; matchingTransfers: number; hasEvidence: boolean; cancelled?: boolean }) {
  if (input.hasEvidence || !input.historyComplete || input.matchingTransfers > 0) return false;
  // Explicit wallet cancellation/rejection before signing: closable once complete history holds no match.
  // A late verified payment on a closed purchase is still honored, so closure never forfeits a real payment.
  if (input.cancelled) return true;
  if (!input.validityWindow) return false;
  if (input.now <= Date.parse(input.expiresAt)) return false;
  return input.headHeight >= releaseAfterHeight(input.quoteHeight, input.validityWindow);
}
