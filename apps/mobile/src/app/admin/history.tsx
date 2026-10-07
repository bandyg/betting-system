import React from 'react';
import { ScrollView } from 'react-native';
import { BetsPanel } from '@/admin/panels/BetsPanel';

export default function AdminHistory() {
  return (
    <ScrollView testID="admin-history" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <BetsPanel />
    </ScrollView>
  );
}
