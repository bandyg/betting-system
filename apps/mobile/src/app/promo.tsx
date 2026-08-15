import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, usePromotions, useCurrentUser, useContents } from '@betting/core';
import type { Promotion } from '@betting/core';
import { Screen, PromotionCard, Banner, FlashMsg, colors, radius, fontSize, font, spacing, SectionTitle } from '@betting/ui';

function bonusLabel(p: Promotion): string {
  if (p.bonus_type === 'deposit_bonus') {
    return `💎 充值送 ${p.bonus_value}% 奖金${p.min_deposit > 0 ? `（最低充值 ¥${p.min_deposit}）` : ''}`;
  }
  return `🎫 免费投注 ¥${p.bonus_value}`;
}

export default function PromoScreen() {
  const promos = usePromotions('active');
  const contents = useContents('published');
  const { user } = useCurrentUser();
  const [claimedIds, setClaimedIds] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // 管理员建活动（demo 简化：前端直接调 API）
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [bonusValue, setBonusValue] = useState('50');
  const [creating, setCreating] = useState(false);

  const claim = async (p: Promotion) => {
    if (!user) {
      setMsg({ kind: 'err', text: '请先到「我的」页登录' });
      return;
    }
    setBusyId(p.id);
    setMsg(null);
    try {
      await api.claimPromotion(p.id, user.id);
      setClaimedIds((prev) => new Set(prev).add(p.id));
      setMsg({ kind: 'ok', text: `✅ 已领取「${p.title}」` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyId(null);
    }
  };

  const createPromo = async () => {
    if (!title.trim()) {
      setMsg({ kind: 'err', text: '请输入活动标题' });
      return;
    }
    setCreating(true);
    setMsg(null);
    try {
      await api.createPromotion({
        title: title.trim(),
        description: desc.trim() || '新促销活动',
        bonus_type: 'deposit_bonus',
        bonus_value: Number(bonusValue) || 0,
        min_deposit: 0,
      });
      setTitle('');
      setDesc('');
      promos.refresh();
      setMsg({ kind: 'ok', text: '✅ 活动已创建' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Screen>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <SectionTitle>🎁 促销活动</SectionTitle>
        </View>

        {/* CMS 公告 banner */}
        {(contents.data?.contents ?? []).slice(0, 2).map((c) => (
          <View key={c.id} style={styles.bannerWrap}>
            <Banner text={c.title} />
          </View>
        ))}

        {msg && (
          <View style={styles.msgWrap}>
            <FlashMsg msg={msg} />
          </View>
        )}

        {promos.loading && <ActivityIndicator size="large" color={colors.secondary} style={{ marginTop: 40 }} />}

        {!promos.loading && (
          <FlatList
            data={promos.data?.promotions ?? []}
            keyExtractor={(p) => String(p.id)}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<Text style={styles.empty}>暂无进行中的活动</Text>}
            renderItem={({ item }) => (
              <PromotionCard
                title={item.title}
                description={item.description}
                bonusLabel={bonusLabel(item)}
                claimed={claimedIds.has(item.id)}
                onClaim={() => claim(item)}
              />
            )}
          />
        )}

        {/* 管理员快速建活动（demo） */}
        <View style={styles.adminBox}>
          <Text style={styles.adminTitle}>🛠️ 管理员：快速建活动</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="活动标题" placeholderTextColor={colors.textMuted} style={styles.input} />
          <TextInput value={desc} onChangeText={setDesc} placeholder="描述（可选）" placeholderTextColor={colors.textMuted} style={styles.input} />
          <View style={styles.adminRow}>
            <TextInput value={bonusValue} onChangeText={setBonusValue} keyboardType="numeric" placeholderTextColor={colors.textMuted} style={[styles.input, { flex: 1 }]} />
            <Pressable onPress={createPromo} disabled={creating} style={({ pressed }) => [styles.adminBtn, { opacity: pressed || creating ? 0.8 : 1 }]}>
              <Text style={styles.adminBtnText}>{creating ? '创建中…' : '创建'}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  bannerWrap: { paddingHorizontal: spacing.lg, marginBottom: 4 },
  msgWrap: { paddingHorizontal: spacing.lg },
  listContent: { padding: spacing.lg, paddingBottom: 20 },
  empty: { color: colors.textSecondary, fontSize: fontSize.md, textAlign: 'center', marginTop: 40 },
  adminBox: { marginHorizontal: spacing.lg, marginBottom: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, backgroundColor: 'rgba(19,26,46,0.6)' },
  adminTitle: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: font.regular, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.text,
    fontSize: fontSize.md,
    marginBottom: spacing.sm,
  },
  adminRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  adminBtn: { backgroundColor: colors.gradientStart, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: 12 },
  adminBtnText: { color: '#fff', fontWeight: font.bold, fontSize: fontSize.md },
});
