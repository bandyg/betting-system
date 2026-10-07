import React from 'react';
import { ScrollView } from 'react-native';
import { SupportPanel } from '@/admin/panels/SupportPanel';

export default function AdminSupport() {
  return (
    <ScrollView testID="admin-support" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <SupportPanel />
    </ScrollView>
  );
}
