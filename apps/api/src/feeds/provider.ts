// provider.ts (P2) — HTTP adapter for the-odds-api (default provider).
// Injectable fetch for unit testing; throws on non-OK for backoff/retry.
import type { TheOddsMatch } from './mapper.js';

const BASE = 'https://api.the-odds-api.com/v4/sports';

export interface ProviderClient {
  pendingMatches(sportKey: string, apiKey: string): Promise<TheOddsMatch[]>;
}

export function createTheOddsClient(fetchImpl: typeof fetch = fetch): ProviderClient {
  return {
    /** Odds for today's + future matches of a sport. oddsFormat=decimal, regions=eu. */
    async pendingMatches(sportKey: string, apiKey: string): Promise<TheOddsMatch[]> {
      // the-odds-api 只读 URL query 参数 apiKey（header 无效 → "API key is missing"），故拼进 query
      const url = `${BASE}/${encodeURIComponent(sportKey)}/odds/?regions=eu&markets=h2h,spreads,totals&oddsFormat=decimal&dateFormat=iso&includeLinks=false&apiKey=${encodeURIComponent(apiKey)}`;
      const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`the-odds-api returned ${res.status}: ${await res.text().catch(() => '')}`);
      return (await res.json()) as TheOddsMatch[];
    },
  };
}
