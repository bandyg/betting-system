import React from 'react';
import { ScrollView } from 'react-native';
import { MatchesAdminPanel } from '@/admin/panels/MatchesAdminPanel';

export default function AdminCreate() {
  return (
    <ScrollView testID="admin-create" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <MatchesAdminPanel />
    </ScrollView>
  );
}
