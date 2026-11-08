import { z } from 'zod';

export async function liveNimRate() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2&vs_currencies=usd', {
      headers: { 'User-Agent': 'NIMAURA/1.0 (https://nimaura.sha-i.com; testnet quote pricing)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn('NIMAURA quote pricing unavailable', { status: response.status });
      throw new Error('Unavailable');
    }
    return z.object({ 'nimiq-2': z.object({ usd: z.number().positive() }) }).parse(await response.json())['nimiq-2'].usd;
  } catch (error) {
    console.warn('NIMAURA quote pricing failed', { kind: error instanceof Error ? error.name : 'unknown' });
    throw new Error('Live NIM pricing is unavailable. No payment was requested.');
  }
}