export interface User {
  id: number;
  name: string;
  account_id: number;
  balance: number;
}

export interface OddsItem {
  selection: string;
  price: number;
}

export interface Market {
  id: number;
  match_id: number;
  type: '1x2' | 'ah' | 'ou';
  line: number | null;
  status: string;
  odds: OddsItem[];
}

export interface Match {
  id: number;
  home_team: string;
  away_team: string;
  kickoff_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  markets: Market[];
}

export interface Bet {
  id: number;
  user_id: number;
  market_id: number;
  selection: string;
  stake: number;
  price: number;
  potential_payout: number;
  status: string;
  created_at: string;
}

export interface MatchesResponse {
  count: number;
  matches: Match[];
}

export interface UsersResponse {
  users: User[];
}

export interface BetsResponse {
  count: number;
  bets: Bet[];
}

export interface SettleSummaryItem {
  marketId: number;
  type: string;
  line: number | null;
  openBets: number;
  won: number;
  lost: number;
  void: number;
  payoutAmount: number;
  refundAmount: number;
}

export interface SettleResponse {
  match: Match;
  summary: SettleSummaryItem[];
  totalPayout: number;
  totalRefund: number;
}

export const TYPE_LABELS: Record<string, string> = {
  '1x2': '胜平负',
  ah: '让球',
  ou: '大小'
};

export const SEL_LABELS: Record<string, string> = {
  home: '主胜',
  draw: '平局',
  away: '客胜',
  over: '大球',
  under: '小球'
};

export const MATCH_STATUS_LABELS: Record<string, string> = {
  scheduled: '未开始',
  finished: '已结束',
  settled: '已结算'
};
