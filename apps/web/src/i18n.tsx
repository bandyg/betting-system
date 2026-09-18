// i18n/index.ts — 极简 i18n (无依赖) (Sprint 3 B2)
//
// 提供 t(key) 函数 + useT() hook + setLang()
// localStorage 持久化
// 默认 zh-CN, 支持 en

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type Lang = 'zh-CN' | 'en';

type Dict = Record<string, string>;

const ZH: Dict = {
  // Common
  'common.loading': '加载中...',
  'common.refresh': '↻ 刷新',
  'common.cancel': '取消',
  'common.confirm': '确认',
  'common.save': '保存',
  'common.clear': '清空',
  'common.search': '🔍 搜索',
  'common.close': '✕ 关闭',
  'common.all': '全部',
  'common.today': '今天',
  'common.3d': '近3天',
  'common.7d': '近7天',
  'common.win': '可赢',
  'common.stake': '投注额',
  'common.total': '总计',
  // Header
  'header.matches': '⚽ 赛事',
  'header.bets': '📜 我的投注',
  'header.login': '🔑 登录',
  'header.logout': '登出',
  'header.theme': '☀️',
  'header.lang': '中/EN',
  // Auth
  'auth.login.title': '登录',
  'auth.login.name': '用户名',
  'auth.login.password': '密码',
  'auth.login.remember': '记住我',
  'auth.login.submit': '登录',
  'auth.login.hint': '请先登录以使用完整功能',
  'auth.login.failed': '登录失败',
  'auth.logout.success': '已登出',
  // Matches
  'matches.title': '赛事大厅',
  'matches.empty': '没有符合条件的赛事',
  'matches.empty.hint': '尝试换个状态或时间范围',
  'matches.detail': '查看详情',
  'matches.filter.status': '状态',
  'matches.filter.when': '时间',
  'matches.filter.scheduled': '未开始',
  'matches.filter.live': '进行中',
  'matches.filter.finished': '已结束',
  'matches.filter.settled': '已结算',
  'matches.onlyWithOdds': '仅开盘',
  'matches.activeFilters': '活动筛选:',
  'matches.clearAll': '全部清除',
  'matches.saveCurrent': '💾 保存当前筛选...',
  'matches.preset.load': '📂',
  'matches.league.search': '🔎 联赛',
  // BetSlip
  'betslip.title': '🧾 投注单',
  'betslip.empty': '点击赛事赔率加入投注单',
  'betslip.single': '单注',
  'betslip.parlay': '🔗 组合',
  'betslip.combined': '组合赔率',
  'betslip.won': '可赢 (全部命中)',
  'betslip.proxy': '代客下注',
  'betslip.proxy.select': '选择用户',
  'betslip.submit': '提交下注',
  'betslip.confirm.title': '🧾 确认下注',
  'betslip.confirm.confirm': '✓ 确认下注',
  'betslip.confirm.cancel': '取消',
  'betslip.confirm.auto': '8 秒后自动确认',
  'betslip.confirm.esc': '按 ESC 取消',
  'betslip.remove': '移除',
  'betslip.defaultStake': '默认投注额',
  'betslip.perStake': '投注',
  // BetsPanel
  'bets.title': '📋 投注记录',
  'bets.empty': '暂无投注记录',
  'bets.empty.hint': '去大厅点几个赔率试试',
  'bets.allUsers': '全部用户',
  'bets.column.id': '#',
  'bets.column.user': '用户',
  'bets.column.market': '市场',
  'bets.column.selection': '选择',
  'bets.column.amount': '金额',
  'bets.column.odds': '赔率',
  'bets.column.payout': '派彩',
  'bets.column.status': '状态',
  'bets.column.time': '时间',
  // MatchDetail
  'detail.title': '赛事详情',
  'detail.market.open': '已关闭',
  'detail.empty': '该赛事暂无市场',
  'detail.addBet': '＋ 加注',
  'detail.locked': '🔒 登录',
  'detail.closed': '已关闭',
  'detail.selection': '选项',
  'detail.odds': '赔率',
  'detail.probability': '隐含概率',
  'detail.action': '操作',
  'detail.hint': '提示: 加注后, 在右侧「投注单」可统一提交',
  // Toast / Errors
  'toast.success': '✅',
  'toast.error': '❌',
  'toast.warn': '⚠️',
  'toast.info': 'ℹ️',
  'error.network': '网络连接失败，请检查后重试',
  'error.server': '服务异常，请稍后重试',
  // Misc
  'misc.copied': '已复制',
  'misc.loading': '加载中',
  'misc.retry': '重试',
};

const EN: Dict = {
  'common.loading': 'Loading...',
  'common.refresh': '↻ Refresh',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.save': 'Save',
  'common.clear': 'Clear',
  'common.search': '🔍 Search',
  'common.close': '✕ Close',
  'common.all': 'All',
  'common.today': 'Today',
  'common.3d': '3d',
  'common.7d': '7d',
  'common.win': 'Win',
  'common.stake': 'Stake',
  'common.total': 'Total',
  'header.matches': '⚽ Matches',
  'header.bets': '📜 My Bets',
  'header.login': '🔑 Login',
  'header.logout': 'Logout',
  'header.theme': '☀️',
  'header.lang': '中/EN',
  'auth.login.title': 'Login',
  'auth.login.name': 'Username',
  'auth.login.password': 'Password',
  'auth.login.remember': 'Remember me',
  'auth.login.submit': 'Login',
  'auth.login.hint': 'Please login first',
  'auth.logout.success': 'Logged out',
  'matches.title': 'Matches',
  'matches.empty': 'No matches found',
  'matches.empty.hint': 'Try a different status or time range',
  'matches.detail': 'Details',
  'matches.filter.status': 'Status',
  'matches.filter.when': 'When',
  'matches.filter.scheduled': 'Scheduled',
  'matches.filter.live': 'Live',
  'matches.filter.finished': 'Finished',
  'matches.filter.settled': 'Settled',
  'matches.onlyWithOdds': 'Only w/ odds',
  'matches.activeFilters': 'Active:',
  'matches.clearAll': 'Clear all',
  'matches.saveCurrent': '💾 Save filter...',
  'matches.preset.load': '📂',
  'matches.league.search': '🔎 League',
  'betslip.title': '🧾 Bet Slip',
  'betslip.empty': 'Click odds to add',
  'betslip.single': 'Single',
  'betslip.parlay': '🔗 Parlay',
  'betslip.combined': 'Combined',
  'betslip.won': 'Win (all hit)',
  'betslip.proxy': 'Place for',
  'betslip.proxy.select': 'Select user',
  'betslip.submit': 'Place Bet',
  'betslip.confirm.title': '🧾 Confirm Bet',
  'betslip.confirm.confirm': '✓ Confirm',
  'betslip.confirm.cancel': 'Cancel',
  'betslip.confirm.auto': 'Auto-confirm in 8s',
  'betslip.confirm.esc': 'ESC to cancel',
  'betslip.remove': 'Remove',
  'betslip.defaultStake': 'Default stake',
  'betslip.perStake': 'Stake',
  'bets.title': '📋 My Bets',
  'bets.empty': 'No bets yet',
  'bets.empty.hint': 'Click some odds to start',
  'bets.allUsers': 'All users',
  'bets.column.id': '#',
  'bets.column.user': 'User',
  'bets.column.market': 'Market',
  'bets.column.selection': 'Selection',
  'bets.column.amount': 'Amount',
  'bets.column.odds': 'Odds',
  'bets.column.payout': 'Payout',
  'bets.column.status': 'Status',
  'bets.column.time': 'Time',
  'detail.title': 'Match Detail',
  'detail.market.open': 'Closed',
  'detail.empty': 'No markets',
  'detail.addBet': '＋ Add',
  'detail.locked': '🔒 Login',
  'detail.closed': 'Closed',
  'detail.selection': 'Selection',
  'detail.odds': 'Odds',
  'detail.probability': 'Implied prob.',
  'detail.action': 'Action',
  'detail.hint': 'After adding, submit from the Bet Slip on the right',
  'toast.success': '✅',
  'toast.error': '❌',
  'toast.warn': '⚠️',
  'toast.info': 'ℹ️',
  'error.network': 'Network error, please retry',
  'error.server': 'Server error, please retry later',
  'misc.copied': 'Copied',
  'misc.loading': 'Loading',
  'misc.retry': 'Retry',
};

const DICTS: Record<Lang, Dict> = { 'zh-CN': ZH, 'en': EN };

// Language state
let _currentLang: Lang = 'zh-CN';
const _subs = new Set<() => void>();

export function getLang(): Lang {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('app.lang');
    if (saved === 'zh-CN' || saved === 'en') {
      _currentLang = saved;
    }
  }
  return _currentLang;
}

export function setLang(l: Lang) {
  _currentLang = l;
  try { localStorage.setItem('app.lang', l); } catch { /* ignore */ }
  _subs.forEach((fn) => fn());
}

export function t(key: string, fallback?: string): string {
  return DICTS[_currentLang][key] ?? DICTS['zh-CN'][key] ?? fallback ?? key;
}

// React hook
interface Ctx { lang: Lang; setLang: (l: Lang) => void; }
const I18nCtx = createContext<Ctx>({ lang: 'zh-CN', setLang });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLang());
  useEffect(() => {
    const fn = () => setLangState(getLang());
    _subs.add(fn);
    return () => { _subs.delete(fn); };
  }, []);
  const update = useCallback((l: Lang) => {
    setLang(l);
    setLangState(l);
  }, []);
  return <I18nCtx.Provider value={{ lang, setLang: update }}>{children}</I18nCtx.Provider>;
}

export function useT() {
  const { lang } = useContext(I18nCtx);
  // 触发组件重渲染当 lang 变 (useContext 已经触发)
  const tt = useCallback((key: string, fallback?: string) => {
    return DICTS[lang][key] ?? DICTS['zh-CN'][key] ?? fallback ?? key;
  }, [lang]);
  return { t: tt, lang, setLang: useContext(I18nCtx).setLang };
}