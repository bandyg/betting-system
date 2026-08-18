// Feed ingestion canonical types (P1) — provider-agnostic.
export type MarketType = '1x2' | 'ah' | 'ou';

export interface IngestMarket {
  type: MarketType;
  line: number | null;          // spread line (ah) or total (ou); null for 1x2
  priceHome: number;
  priceDraw: number | null;     // null for ah/ou
  priceAway: number;
  live: boolean;                // in-play
  suspended: boolean;           // supplier paused this market (not taking bets)
  settled: boolean;             // supplier says result final
}

export interface IngestMatch {
  external_id: string;
  home: string;
  away: string;
  kickoff: string;              // ISO 8601
  league?: string;
  sport?: string;
  markets: IngestMarket[];
  finalHome: number | null;
  finalAway: number | null;
}

// Insert-ready rows computed by mapper.ts (NO DB dependency — pure & testable).
export interface OddsRow { selection: string; price: number }
export interface MarketRow {
  external_id: string;
  type: MarketType;
  line: number | null;
  status: 'open' | 'suspended' | 'settled';
  source: string;
  odds: OddsRow[];
}
export interface MatchRowSets {
  match: {
    external_id: string;
    home_team: string;
    away_team: string;
    kickoff_time: string;
    status: 'scheduled' | 'finished' | 'settled';
    home_score: number | null;
    away_score: number | null;
    sport: string | null;
    league: string | null;
    source: string;
  };
  markets: MarketRow[];
}
