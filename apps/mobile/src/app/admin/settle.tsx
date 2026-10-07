import React from 'react';
import { ScrollView } from 'react-native';
import { SettlePanel } from '@/admin/panels/SettlePanel';

export default function AdminSettle() {
  return (
    <ScrollView testID="admin-settle" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <SettlePanel />
    </ScrollView>
  );
}
