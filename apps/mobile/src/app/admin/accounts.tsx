import React from 'react';
import { ScrollView } from 'react-native';
import { AccountsPanel } from '@/admin/panels/AccountsPanel';

export default function AdminAccounts() {
  return (
    <ScrollView testID="admin-accounts" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <AccountsPanel />
    </ScrollView>
  );
}
