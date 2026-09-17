// components/EmptyState.tsx — 空状态：图标 + 文案 + CTA
import type { ReactNode } from 'react';

interface Props {
  icon?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
}

export function EmptyState({ icon = '📭', title, desc, action }: Props) {
  return (
    <div className="empty-state fade-in">
      <div className="icon">{icon}</div>
      <div className="title">{title}</div>
      {desc && <div className="desc">{desc}</div>}
      {action}
    </div>
  );
}
