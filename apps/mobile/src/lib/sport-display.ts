/** 运动 key → 中文标签 / 图标（玩家端统一展示层；key 来自 the-odds-api 归一化映射） */
export const SPORT_ICONS: Record<string, string> = {
  soccer: '\u26BD',
  basketball: '\uD83C\uDFC0',
  tennis: '\uD83C\uDFBE',
  baseball: '\u26BE',
  icehockey: '\uD83C\uDFD2',
  americanfootball: '\uD83C\uDFC8',
  football: '\uD83C\uDFC8',
  aussierules: '\uD83C\uDFC6',
  boxing: '\uD83E\uDD4A',
  mma: '\uD83E\uDD4A',
  cricket: '\uD83C\uDFCF',
  handball: '\uD83E\uDD4D',
  rugbyleague: '\uD83C\uDFC9',
  rugbyunion: '\uD83C\uDFC9',
  lacrosse: '\uD83E\uDD4D',
  golf: '\u26F3',
  volleyball: '\uD83C\uDFD0',
  tabletennis: '\uD83C\uDFD3',
  esports: '\uD83C\uDFAE',
  other: '\uD83C\uDFC6',
};

export const SPORT_LABELS: Record<string, string> = {
  soccer: '\u8DB3\u7403',
  basketball: '\u7BEE\u7403',
  tennis: '\u7F51\u7403',
  baseball: '\u68D2\u7403',
  icehockey: '\u51B0\u7403',
  americanfootball: '\u7F8E\u5F0F\u6A44\u6984\u7403',
  football: '\u7F8E\u5F0F\u8DB3\u7403',
  aussierules: '\u6FB3\u5F0F\u6A44\u6984\u7403',
  boxing: '\u62F3\u51FB',
  mma: '\u7EFC\u5408\u683C\u6597',
  cricket: '\u677F\u7403',
  handball: '\u624B\u7403',
  rugbyleague: '\u82F1\u5F0F\u6A44\u6984\u7403',
  rugbyunion: '\u8054\u76DF\u6A44\u6984\u7403',
  lacrosse: '\u957F\u66F2\u68CD\u7403',
  golf: '\u9AD8\u5C14\u592B',
  volleyball: '\u6392\u7403',
  tabletennis: '\u4E52\u4E53',
  esports: '\u7535\u7ADE',
  other: '\u5176\u4ED6',
};

export function sportIcon(sport: string | null): string {
  return SPORT_ICONS[sport ?? ''] ?? SPORT_ICONS.other;
}

/** 无映射时回退为首字母大写的原文，避免出现裸 key */
export function sportLabel(sport: string | null): string {
  if (!sport) return SPORT_LABELS.other;
  return SPORT_LABELS[sport] ?? sport.charAt(0).toUpperCase() + sport.slice(1);
}
