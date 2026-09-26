// csv.ts (R13) — CSV 序列化，零依赖。
//
// RFC 4180 转义规则：
//   1. 字段含 逗号 / 引号 / 换行（\r \n）→ 整段用双引号包裹
//   2. 字段内双引号 → 两个双引号（""）
//   3. 行分隔 \r\n；Excel 兼容
//   4. 数字直接输出；null/undefined → 空串；对象/数组 → JSON.stringify

export type CsvCell = string | number | boolean | null | undefined | object;

/** 单个字段转义 */
export function csvEscape(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 二维数组（含表头行）→ CSV 字符串 */
export function csvFromRows(rows: CsvCell[][]): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

/** 对象数组 → CSV（首行为 keys；列集取所有对象 key 的并集，缺省空串） */
export function csvFromObjects(items: Record<string, CsvCell>[], headers?: string[]): string {
  if (items.length === 0) {
    return headers ? csvFromRows([headers]) : '\r\n';
  }
  const cols = headers ?? [...new Set(items.flatMap((o) => Object.keys(o)))];
  const rows: CsvCell[][] = [cols, ...items.map((o) => cols.map((c) => o[c]))];
  return csvFromRows(rows);
}
