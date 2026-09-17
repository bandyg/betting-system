// components/ErrorBoundary.tsx — 顶层错误边界
import { Component, type ReactNode } from 'react';

interface State { hasError: boolean; msg: string; }
interface Props { children: ReactNode; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, msg: '' };

  static getDerivedStateFromError(e: Error): State {
    return { hasError: true, msg: e.message };
  }

  componentDidCatch(e: Error, info: unknown) {
    console.error('ErrorBoundary caught:', e, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="empty-state fade-in" style={{ padding: '60px 20px' }}>
          <div className="icon">⚠️</div>
          <div className="title">页面出错了</div>
          <div className="desc">{this.state.msg}</div>
          <button onClick={() => location.reload()}>刷新页面</button>
        </div>
      );
    }
    return this.props.children;
  }
}
