export type DeliveryCheck = { status: string; retryAfterMs?: number };
export function deliveryFeedback(result: DeliveryCheck) {
  if (result.status === 'paid') return { message: 'Finalized testnet delivery confirmed.', delayMs: 0 };
  const delayMs = Math.max(1000, result.retryAfterMs ?? 10_000);
  return {
    message: result.retryAfterMs
      ? 'Confirmation is still checking or temporarily rate-limited. No new transfer was requested. Do not resend.'
      : 'Finalized delivery is not confirmed yet. This does not mean the transfer failed. Do not resend.',
    delayMs,
  };
}