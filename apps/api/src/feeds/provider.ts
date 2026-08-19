// provider.ts (P2) — HTTP adapter for the-odds-api (default provider).
// Injectable fetch for unit testing; throws on non-OK for backoff/retry.
import type { TheOddsMatch } from './mapper.js';

const BASE = 'https://api.the-odds-api.com/v4/sports';

/** the-odds-api `/scores/` payload (P4) — final/live score lines for a sport. */
export interface TheOddsScore {
  id: string;
  sport_key?: string;
  sport_title?: string;
  commence_time?: string;
  home_team: string;
  away_team: string;
  scores: Array<{ name: string; score: string | number }> | null;
  completed: boolean;
}

export interface ProviderClient {
  pendingMatches(sportKey: string, apiKey: string): Promise<TheOddsMatch[]>;
  scores(sportKey: string, apiKey: string): Promise<TheOddsScore[]>;
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
    /** Final/live scores for a sport. Key still travels as URL query param. */
    async scores(sportKey: string, apiKey: string): Promise<TheOddsScore[]> {
      const url = `${BASE}/${encodeURIComponent(sportKey)}/scores/?apiKey=${encodeURIComponent(apiKey)}`;
      const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`the-odds-api returned ${res.status}: ${await res.text().catch(() => '')}`);
      return (await res.json()) as TheOddsScore[];
    },
  };
}
