import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveNimRate } from './price.server';

afterEach(() => vi.unstubAllGlobals());
describe('hosted quote pricing', () => {
  it('satisfies the actual hosted 403 requirement for a descriptive User-Agent', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const agent = new Headers(options?.headers).get('User-Agent');
      if (!agent?.includes('NIMAURA/1.0')) return new Response('Please add a descriptive User-Agent', { status: 403 });
      return Response.json({ 'nimiq-2': { usd: 0.00026225 } });
    }));
    expect(await liveNimRate()).toBe(0.00026225);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([403, 429, 500])('never substitutes a fabricated rate on HTTP %i', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })));
    await expect(liveNimRate()).rejects.toThrow('No payment was requested');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('uses the second live source when the first is rate-limited', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('coingecko') ? new Response('', { status: 429 }) : Response.json({ quotes: { USD: { price: 0.0002614 } } })));
    expect(await liveNimRate()).toBe(0.0002614);
  });
  it.each([0, -1, '0.00026225'])('rejects invalid rate %s', async usd => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ 'nimiq-2': { usd }, quotes: { USD: { price: usd } }, data: { price: String(usd) } })));
    await expect(liveNimRate()).rejects.toThrow('No payment was requested');
  });
});