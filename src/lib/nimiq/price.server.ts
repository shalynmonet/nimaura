import { z } from 'zod';

const AGENT = 'NIMAURA/1.0 (https://nimaura.sha-i.com; testnet quote pricing)';
const positive = z.number().positive();

// Independent live USD sources, tried in order. CoinGecko's free tier rate-limits
// shared Worker IPs (429), so a second live source keeps quotes available.
// There is never a fixed or remembered fallback rate.
const SOURCES: { name: string; url: string; parse: (body: unknown) => number }[] = [
  { name: 'coingecko', url: 'https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2&vs_currencies=usd',
    parse: body => z.object({ 'nimiq-2': z.object({ usd: positive }) }).parse(body)['nimiq-2'].usd },
  { name: 'coinpaprika', url: 'https://api.coinpaprika.com/v1/tickers/nim-nimiq',
    parse: body => z.object({ quotes: z.object({ USD: z.object({ price: positive }) }) }).parse(body).quotes.USD.price },
];

export async function liveNimRate() {
  for (const source of SOURCES) {
    try {
      const response = await fetch(source.url, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(8_000) });
      if (!response.ok) { console.warn('NIMAURA quote pricing unavailable', { source: source.name, status: response.status }); continue; }
      return source.parse(await response.json());
    } catch (error) {
      console.warn('NIMAURA quote pricing failed', { source: source.name, kind: error instanceof Error ? error.name : 'unknown' });
    }
  }
  throw new Error('Live NIM pricing is unavailable. No payment was requested.');
}
