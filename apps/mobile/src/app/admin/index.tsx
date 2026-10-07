import { Redirect } from 'expo-router';
import { useAuth } from '@betting/core';

export default function AdminIndex() {
  const { user } = useAuth();
  return <Redirect href={user?.role === 'support' ? '/admin/support' : '/admin/matches'} />;
}
