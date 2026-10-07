import React, { useEffect, useState } from 'react';
import { Modal as RNModal, Platform, Pressable, Text, View } from 'react-native';
import { useTheme } from './theme';
import { fontSize, radius, spacing } from './tokens';

/* ---------------- Modal（backdrop 点击 + web Esc 关闭） ---------------- */

export function Modal({
  visible,
  onClose,
  title,
  children,
  width = 480,
  testID = 'modal',
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: number;
  testID?: string;
}) {
  const t = useTheme();

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible) return null;
  return (
    <RNModal transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        testID={`${testID}-backdrop`}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(4, 6, 12, 0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}
      >
        <Pressable
          testID={testID}
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: width,
            maxHeight: '90%',
            backgroundColor: t.bgElevated,
            borderRadius: radius.lg,
            borderColor: t.border,
            borderWidth: 1,
            padding: spacing.lg,
            shadowColor: '#000',
            shadowOpacity: 0.4,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 20,
          }}
        >
          {title ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={{ color: t.text, fontSize: fontSize.lg, fontWeight: '800' }}>{title}</Text>
              <Pressable testID={`${testID}-close`} onPress={onClose} hitSlop={8}>
                <Text style={{ color: t.textMuted, fontSize: fontSize.lg }}>✕</Text>
              </Pressable>
            </View>
          ) : null}
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

/* ---------------- ConfirmModal（可选自动确认倒计时） ---------------- */

export function ConfirmModal({
  visible,
  onCancel,
  onConfirm,
  title = '确认操作',
  confirmLabel = '确认',
  cancelLabel = '取消',
  autoConfirmMs,
  children,
  testID = 'confirm-modal',
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 传入则显示倒计时，倒数到 0 自动 onConfirm（如旧版 8s 自动确认下注） */
  autoConfirmMs?: number;
  children?: React.ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  const [remain, setRemain] = useState(0);

  useEffect(() => {
    if (!visible || !autoConfirmMs) return;
    setRemain(Math.ceil(autoConfirmMs / 1000));
    const started = Date.now();
    const timer = setInterval(() => {
      const left = autoConfirmMs - (Date.now() - started);
      if (left <= 0) {
        clearInterval(timer);
        onConfirm();
      } else {
        setRemain(Math.ceil(left / 1000));
      }
    }, 250);
    return () => clearInterval(timer);
  }, [visible, autoConfirmMs, onConfirm]);

  return (
    <Modal visible={visible} onClose={onCancel} title={title} testID={testID}>
      {children}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.lg }}>
        {autoConfirmMs ? (
          <Text style={{ color: t.textMuted, fontSize: fontSize.sm, alignSelf: 'center', flex: 1 }}>
            {remain}s 后自动{confirmLabel}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Pressable
          testID={`${testID}-cancel`}
          onPress={onCancel}
          style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md, borderColor: t.border, borderWidth: 1 }}
        >
          <Text style={{ color: t.textSecondary, fontWeight: '700' }}>{cancelLabel}</Text>
        </Pressable>
        <Pressable
          testID={`${testID}-ok`}
          onPress={onConfirm}
          style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: t.primary }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>
            {confirmLabel}
            {autoConfirmMs ? `（${remain}s）` : ''}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
