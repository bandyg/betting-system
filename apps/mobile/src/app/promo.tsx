import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, usePromotions, useCurrentUser, useContents } from '@betting/core';
import type { Content, Promotion } from '@betting/core';
import { Screen, PromotionCard, Banner, FlashMsg, MarkdownText, colors, radius, fontSize, font, spacing, SectionTitle } from '@betting/ui';

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

  // 管理员 CMS：内容管理（草稿/定时/已发布/归档）
  const [contentTitle, setContentTitle] = useState('');
  const [contentBody, setContentBody] = useState('');
  const [publishAt, setPublishAt] = useState('');
  const [creatingContent, setCreatingContent] = useState(false);

  const createContent = async () => {
    if (!contentTitle.trim()) {
      setMsg({ kind: 'err', text: '请输入公告标题' });
      return;
    }
    setCreatingContent(true);
    setMsg(null);
    try {
      const pub = publishAt.trim() || null;
      await api.createContent(contentTitle.trim(), 'announcement', contentBody.trim() || '', pub);
      setContentTitle('');
      setContentBody('');
      setPublishAt('');
      contents.refresh();
      setMsg({ kind: 'ok', text: pub ? '✅ 公告已创建（定时发布）' : '✅ 公告已创建（草稿）' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreatingContent(false);
    }
  };

  const contentAction = async (c: Content, action: 'publish' | 'unpublish' | 'archive') => {
    setBusyId(c.id);
    setMsg(null);
    try {
      if (action === 'publish') await api.publishContent(c.id);
      if (action === 'unpublish') await api.unpublishContent(c.id);
      if (action === 'archive') await api.archiveContent(c.id);
      contents.refresh();
      setMsg({ kind: 'ok', text: '✅ 已更新内容状态' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusyId(null);
    }
  };

  const adminContents = contents.data?.contents ?? [];
  const [viewing, setViewing] = useState<Content | null>(null);

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

        {/* CMS 公告 banner（点按看全文） */}
        {(contents.data?.contents ?? []).slice(0, 2).map((c) => (
          <Pressable key={c.id} onPress={() => setViewing(c)} style={styles.bannerWrap}>
            <Banner text={c.title} />
          </Pressable>
        ))}

        {/* 公告/文章列表 */}
        {!contents.loading && (contents.data?.contents ?? []).length > 0 && (
          <View style={styles.contentListWrap}>
            <SectionTitle>📰 公告中心</SectionTitle>
            {(contents.data?.contents ?? []).map((c) => (
              <Pressable key={c.id} onPress={() => setViewing(c)} style={({ pressed }) => [styles.contentListItem, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.contentListTitle} numberOfLines={1}>
                  {c.title}
                  <Text style={styles.contentListType}>  [{c.type === 'promotion' ? '活动' : c.type === 'article' ? '文章' : '公告'}]</Text>
                </Text>
                <Text style={styles.contentListMeta}>👁 {c.view_count} 阅读{c.publish_at ? ` · ${c.publish_at}` : ''}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {msg && (
          <View style={styles.msgWrap}>
            <FlashMsg msg={msg} />
          </View>
        )}

        {promos.loading && <ActivityIndicator size="large" color={colors.secondary} style={{ marginTop: 40 }} />}

        {!promos.loading && (
          <FlatList
            removeClippedSubviews={false}
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

        {/* 管理员快速建活动（仅 role=admin 可见） */}
        {user?.role === 'admin' && (
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
        )}

        {/* 管理员 CMS：内容管理（仅 role=admin 可见） */}
        {user?.role === 'admin' && (
          <View style={styles.adminBox}>
            <Text style={styles.adminTitle}>📢 管理员：内容管理</Text>
            <TextInput value={contentTitle} onChangeText={setContentTitle} placeholder="公告标题" placeholderTextColor={colors.textMuted} style={styles.input} />
            <TextInput value={contentBody} onChangeText={setContentBody} placeholder="公告正文（可选）" placeholderTextColor={colors.textMuted} style={styles.input} />
            <TextInput value={publishAt} onChangeText={setPublishAt} placeholder="定时发布时间，如 2026-08-21 10:00（留空=草稿）" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Pressable onPress={createContent} disabled={creatingContent} style={({ pressed }) => [styles.adminBtn, { opacity: pressed || creatingContent ? 0.8 : 1 }]}>
              <Text style={styles.adminBtnText}>{creatingContent ? '创建中…' : '创建内容'}</Text>
            </Pressable>

            {adminContents.length > 0 && (
              <View style={{ marginTop: spacing.md }}>
                {adminContents.slice(0, 5).map((c) => (
                  <View key={c.id} style={styles.contentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.contentTitle} numberOfLines={1}>
                        {c.title}
                        <Text style={styles.contentStatus}>  [{c.status}]</Text>
                      </Text>
                      <Text style={styles.contentMeta}>
                        {c.publish_at ? `⏰ ${c.publish_at} ` : ''}
                        {c.archived_at ? `🗄️ ${c.archived_at} ` : ''}
                        <Text style={styles.contentId}>#{c.id}</Text>
                      </Text>
                    </View>
                    <View style={styles.contentActions}>
                      {c.status === 'draft' || c.status === 'scheduled' ? (
                        <Pressable onPress={() => contentAction(c, 'publish')} disabled={busyId === c.id} style={styles.miniBtn}>
                          <Text style={styles.miniBtnText}>{busyId === c.id ? '…' : '发布'}</Text>
                        </Pressable>
                      ) : null}
                      {c.status === 'published' ? (
                        <Pressable onPress={() => contentAction(c, 'unpublish')} disabled={busyId === c.id} style={styles.miniBtn}>
                          <Text style={styles.miniBtnText}>{busyId === c.id ? '…' : '下架'}</Text>
                        </Pressable>
                      ) : null}
                      {c.status !== 'archived' ? (
                        <Pressable onPress={() => contentAction(c, 'archive')} disabled={busyId === c.id} style={styles.miniBtnDanger}>
                          <Text style={styles.miniBtnText}>{busyId === c.id ? '…' : '归档'}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 内容详情弹窗（富文本正文） */}
        <Modal visible={viewing !== null} transparent animationType="slide" onRequestClose={() => setViewing(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              {viewing && (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>{viewing.title}</Text>
                    <Pressable onPress={() => setViewing(null)} hitSlop={10} style={styles.modalClose}>
                      <Text style={styles.modalCloseText}>✕</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.modalMeta}>
                    {viewing.type === 'promotion' ? '活动' : viewing.type === 'article' ? '文章' : '公告'} · 👁 {viewing.view_count} 阅读
                    {viewing.publish_at ? ` · ${viewing.publish_at}` : ''}
                  </Text>
                  <View style={styles.modalBody}>
                    <MarkdownText body={viewing.body || '（暂无正文）'} />
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>
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
  contentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.sm },
  contentTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: font.bold },
  contentStatus: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: font.regular },
  contentMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  contentId: { color: colors.textSecondary },
  contentActions: { flexDirection: 'row', gap: spacing.xs },
  miniBtn: { backgroundColor: 'rgba(52,199,89,0.15)', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  miniBtnDanger: { backgroundColor: 'rgba(255,69,58,0.15)', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  miniBtnText: { color: colors.text, fontSize: fontSize.xs, fontWeight: font.bold },
  contentListWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.sm },
  contentListItem: {
    backgroundColor: 'rgba(19,26,46,0.6)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  contentListTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: font.bold },
  contentListType: { color: colors.secondary, fontSize: fontSize.sm, fontWeight: font.regular },
  contentListMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  modalTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: font.bold, flex: 1 },
  modalClose: { marginLeft: spacing.md },
  modalCloseText: { color: colors.textSecondary, fontSize: fontSize.lg },
  modalMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginBottom: spacing.md },
  modalBody: { marginBottom: spacing.md },
});
