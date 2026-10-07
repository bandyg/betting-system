import React from 'react';
import { Image, Text, View } from 'react-native';
import { useTheme } from './theme';
import { fontSize, radius, statusTone } from './tokens';

/* ---------------- hash → HSL（Avatar / LeagueChip 共用） ---------------- */

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/* ---------------- Avatar（首字 + 稳定底色；可选图片） ---------------- */

export function Avatar({ name, src, size = 32, testID }: { name: string; src?: string; size?: number; testID?: string }) {
  const hue = hashHue(name || '?');
  const bg = `hsl(${hue}, 52%, 42%)`;
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <View
      testID={testID}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
    >
      {src ? (
        <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: Math.round(size * 0.42) }}>{initial}</Text>
      )}
    </View>
  );
}

/* ---------------- LeagueChip（联赛彩色徽章） ---------------- */

const SPORT_EMOJI: Record<string, string> = {
  soccer: '⚽', basketball: '🏀', tennis: '🎾', baseball: '⚾', hockey: '🏒',
  mma: '🥊', cricket: '🏏', rugby: '🏉', boxing: '🥊', esports: '🎮',
};

export function LeagueChip({
  league,
  sport,
  size = 'sm',
  testID,
}: {
  league: string;
  sport?: string;
  size?: 'xs' | 'sm' | 'md';
  testID?: string;
}) {
  const t = useTheme();
  const hue = hashHue(league || '?');
  const scale = size === 'xs' ? 0.8 : size === 'md' ? 1.2 : 1;
  const dot = Math.max(6, Math.round(8 * scale));
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4 * scale,
        backgroundColor: `hsla(${hue}, 60%, 45%, 0.16)`,
        borderColor: `hsla(${hue}, 60%, 55%, 0.4)`,
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingHorizontal: 6 * scale + 2,
        paddingVertical: 2 * scale,
        alignSelf: 'flex-start',
      }}
    >
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: `hsl(${hue}, 60%, 55%)` }} />
      {sport && SPORT_EMOJI[sport] ? <Text style={{ fontSize: 10 * scale }}>{SPORT_EMOJI[sport]}</Text> : null}
      <Text numberOfLines={1} style={{ color: t.textSecondary, fontSize: 11 * scale, fontWeight: '600' }}>
        {league || '—'}
      </Text>
    </View>
  );
}

/* ---------------- Badge（状态徽章，语义取色随主题） ---------------- */

function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

export function Badge({ status, label, testID }: { status: string; label?: string; testID?: string }) {
  const t = useTheme();
  const tone = statusTone[status] ?? 'neutral';
  const color =
    tone === 'neutral' ? t.textMuted : tone === 'info' ? t.info : tone === 'success' ? t.success : t.warning;
  const bg = tone === 'neutral' ? t.border : withAlpha(String(t[tone === 'info' ? 'info' : tone === 'success' ? 'success' : 'warning']), 0.15);
  return (
    <View
      testID={testID ?? `badge-${status}`}
      style={{ backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}
    >
      <Text style={{ color, fontSize: fontSize.xs, fontWeight: '700' }}>{label ?? status}</Text>
    </View>
  );
}
