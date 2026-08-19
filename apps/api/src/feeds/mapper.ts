// mapper.ts (P1) — pure functions: vendor payload → canonical IngestMatch → insert-ready rows.
// No DB, no I/O: fully unit-testable with mock data.
import type {
  IngestMarket, IngestMatch, MarketRow, MatchRowSets, OddsRow,
} from './types.js';
/** Map the-odds-api sport_key to our canonical sport + league. */
export function mapSportKey(sportKey: string): { sport: string; league: string } {
  const map: Record<string, { sport: string; league: string }> = {
    soccer_epl:              { sport: 'soccer',    league: 'EPL' },
    soccer_uefa_champs_league: { sport: 'soccer', league: 'Champions League' },
    soccer_spain_la_liga:    { sport: 'soccer',    league: 'La Liga' },
    soccer_germany_bundesliga: { sport: 'soccer',  league: 'Bundesliga' },
    soccer_italy_serie_a:    { sport: 'soccer',    league: 'Serie A' },
    soccer_france_ligue_one: { sport: 'soccer',    league: 'Ligue 1' },
    basketball_nba:          { sport: 'basketball', league: 'NBA' },
    basketball_ncaab:        { sport: 'basketball', league: 'NCAAB' },
    basketball_euroleague:   { sport: 'basketball', league: 'Euroleague' },
    basketball_wnba:         { sport: 'basketball', league: 'WNBA' },
    tennis_atp:              { sport: 'tennis',    league: 'ATP' },
    tennis_wta:              { sport: 'tennis',    league: 'WTA' },
    baseball_mlb:            { sport: 'baseball',  league: 'MLB' },
    baseball_kbo:            { sport: 'baseball',  league: 'KBO' },
    baseball_npb:            { sport: 'baseball',  league: 'NPB' },
    icehockey_nhl:           { sport: 'icehockey', league: 'NHL' },
    mma_mixed_martial_arts:  { sport: 'mma',       league: 'UFC' },
    boxing_boxing:           { sport: 'boxing',    league: 'Boxing' },
    americanfootball_nfl:    { sport: 'football',  league: 'NFL' },
    americanfootball_ncaaf:  { sport: 'football',  league: 'NCAAF' },
    cricket_test_match:      { sport: 'cricket',   league: 'Test Match' },
    tennis_atp_cincinnati_open: { sport: 'tennis', league: 'ATP Cincinnati' },
    tennis_wta_cincinnati_open: { sport: 'tennis', league: 'WTA Cincinnati' },
    soccer_china_superleague: { sport: 'soccer',    league: 'CSL' },
    soccer_usa_mls:          { sport: 'soccer',    league: 'MLS' },
    soccer_japan_j_league:   { sport: 'soccer',    league: 'J.League' },
    soccer_korea_kleague1:   { sport: 'soccer',    league: 'K League 1' },
    soccer_netherlands_eredivisie: { sport: 'soccer', league: 'Eredivisie' },
    soccer_portugal_primeira_liga: { sport: 'soccer', league: 'Primeira Liga' },
    soccer_turkey_super_league: { sport: 'soccer',  league: 'Süper Lig' },
    soccer_brazil_campeonato: { sport: 'soccer',    league: 'Brasileirão' },
  };
  if (map[sportKey]) return map[sportKey];
  const parts = sportKey.split('_');
  return { sport: parts[0] || 'unknown', league: parts.slice(1).join(' ').toUpperCase() || 'Unknown' };
}



/** Convert a vendor-agnostic match into insert-ready rows. `source` = who owns the rows. */
export function toRows(m: IngestMatch, source = 'the-odds-api'): MatchRowSets {
  const marketRows: MarketRow[] = m.markets.map((mk) => ({
    external_id: `${m.external_id}:${mk.type}${mk.line != null ? ':' + mk.line : ''}`,
    type: mk.type,
    line: mk.line,
    status: deriveMarketStatus(mk),
    source,
    odds: toOddsRows(mk),
  }));
  return {
    match: {
      external_id: m.external_id,
      home_team: m.home,
      away_team: m.away,
      kickoff_time: m.kickoff,
      status: deriveMatchStatus(m, marketRows),
      home_score: m.finalHome,
      away_score: m.finalAway,
      sport: m.sport ?? null,
      league: m.league ?? null,
      source,
    },
    markets: marketRows,
  };
}

/** Status semantics (fix the scheduled-vs-open trap): match is only 'finished' when final score known. */
export function deriveMatchStatus(m: IngestMatch, markets: MarketRow[]): 'scheduled' | 'finished' | 'settled' {
  if (m.finalHome != null && m.finalAway != null) return 'finished';
  // if every market already settled, the match is effectively settled too
  if (markets.length > 0 && markets.every((mk) => mk.status === 'settled')) return 'settled';
  return 'scheduled';
}

export function deriveMarketStatus(mk: IngestMarket): 'open' | 'suspended' | 'settled' {
  if (mk.settled) return 'settled';
  if (mk.suspended) return 'suspended';
  return 'open'; // live or pre-match open → open
}

function toOddsRows(mk: IngestMarket): OddsRow[] {
  if (mk.type === '1x2') {
    return [
      { selection: 'home', price: mk.priceHome },
      ...(mk.priceDraw != null ? [{ selection: 'draw', price: mk.priceDraw }] : []),
      { selection: 'away', price: mk.priceAway },
    ];
  }
  if (mk.type === 'ah') {
    return [
      { selection: 'home', price: mk.priceHome },
      { selection: 'away', price: mk.priceAway },
    ];
  }
  // ou
  return [
    { selection: 'over', price: mk.priceHome },
    { selection: 'under', price: mk.priceAway },
  ];
}

/* ------------------------------------------------------------------ *
 * the-odds-api adapter (default provider)
 * GET /v4/sports/{sport}/odds/?regions=eu&markets=h2h,spreads,totals
 *    &oddsFormat=decimal&dateFormat=iso
 * ------------------------------------------------------------------ */
export interface TheOddsOutcome { name: string; price: number; point?: number }
export interface TheOddsMarket { key: 'h2h' | 'spreads' | 'totals'; outcomes: TheOddsOutcome[] }
export interface TheOddsMatch {
  id: string;
  sport_key?: string;
  sport_title?: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: Array<{ key: string; markets: TheOddsMarket[] }>;
  scores?: Array<{ name: string; score: string | number }> | null;
  completed?: boolean;
}

export function normalizeTheOddsMatch(raw: TheOddsMatch, sportKey?: string): IngestMatch {
  // designated book = 'pinnacle' if present else first; keeps odds stable across calls.
  const book = (raw.bookmakers ?? []).find((b) => b.key === 'pinnacle') ?? raw.bookmakers?.[0];
  const byKey = new Map(book?.markets.map((m) => [m.key, m]) ?? []);
  const match = (name: string) =>
    name.trim().toLowerCase() === (raw.home_team || '').trim().toLowerCase() ? 'home'
    : name.trim().toLowerCase() === (raw.away_team || '').trim().toLowerCase() ? 'away' : null;

  const markets: IngestMarket[] = [];

  const h2h = byKey.get('h2h')?.outcomes ?? [];
  const price = (sel: string): number | null => {
    const o = h2h.find((x) => (match(x.name) ?? x.name.toLowerCase()) === sel);
    return o && o.price > 1 ? o.price : null;
  };
  const ph = price('home');
  const pd = h2h.find((x) => x.name.toLowerCase() === 'draw' && x.price > 1)?.price ?? null;
  const pa = price('away');
  if (ph != null && pa != null) {
    markets.push({ type: '1x2', line: null, priceHome: ph, priceDraw: pd, priceAway: pa, live: false, suspended: false, settled: false });
  }

  const spreads = byKey.get('spreads')?.outcomes ?? [];
  const sph = spreads.find((x) => match(x.name) === 'home');
  const spa = spreads.find((x) => match(x.name) === 'away');
  if (sph && spa && sph.price > 1 && spa.price > 1) {
    markets.push({ type: 'ah', line: sph.point ?? null, priceHome: sph.price, priceDraw: null, priceAway: spa.price, live: false, suspended: false, settled: false });
  }

  const totals = byKey.get('totals')?.outcomes ?? [];
  const over = totals.find((x) => x.name.toLowerCase() === 'over');
  const under = totals.find((x) => x.name.toLowerCase() === 'under');
  if (over && under && over.price > 1 && under.price > 1) {
    markets.push({ type: 'ou', line: over.point ?? null, priceHome: over.price, priceDraw: null, priceAway: under.price, live: false, suspended: false, settled: false });
  }

  let finalHome: number | null = null;
  let finalAway: number | null = null;
  if (raw.completed && Array.isArray(raw.scores)) {
    for (const s of raw.scores) {
      const side = match(s.name);
      const v = Number(s.score);
      if (side === 'home') finalHome = v;
      if (side === 'away') finalAway = v;
    }
  }

  return {
    external_id: raw.id,
    home: raw.home_team,
    away: raw.away_team,
    kickoff: new Date(raw.commence_time).toISOString(),
    ...(raw.sport_key ? mapSportKey(raw.sport_key) : sportKey ? mapSportKey(sportKey) : { sport: 'soccer', league: raw.sport_title ?? undefined }),
    markets,
    finalHome,
    finalAway,
  };
}

/** Generic dispatch: currently 'theodds' (and alias 'mock' → same shape for testing). */
export function normalizeVendorMatch(raw: unknown, vendor: string, sportKey?: string): IngestMatch {
  if (vendor === 'theodds' || vendor === 'the-odds-api' || vendor === 'mock') {
    return normalizeTheOddsMatch(raw as TheOddsMatch, sportKey);
  }
  throw new Error(`unknown feed vendor: ${vendor}`);
}
