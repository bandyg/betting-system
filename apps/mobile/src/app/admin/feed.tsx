import React from 'react';
import { ScrollView } from 'react-native';
import { FeedPanel } from '@/admin/panels/FeedPanel';

export default function AdminFeed() {
  return (
    <ScrollView testID="admin-feed" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
      <FeedPanel />
    </ScrollView>
  );
}
