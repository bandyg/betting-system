// components/ErrorBoundary.tsx — 顶层错误边界（Sprint 1 B1 友好降级）
import { Component, type ReactNode } from 'react';

interface State { hasError: boolean; msg: string; stack?: string; }
interface Props { children: ReactNode; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, msg: '' };

  static getDerivedStateFromError(e: Error): State {
    return {
      hasError: true,
      msg: e.message || '未知错误',
      stack: e.stack?.split('\n').slice(0, 5).join('\n'),
    };
  }

  componentDidCatch(e: Error, info: unknown) {
    // 生产可加 Sentry 等上报；这里只 console.error
    console.error('ErrorBoundary caught:', e, info);
  }

  reset = () => {
    this.setState({ hasError: false, msg: '', stack: undefined });
  };

  reload = () => {
    location.reload();
  };

  goHome = () => {
    location.href = '/matches';
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="error-boundary fade-in">
        <div className="eb-card scale-in">
          <div className="eb-icon">💥</div>
          <h1>页面出错了</h1>
          <p className="eb-msg">{this.state.msg}</p>
          {this.state.stack && (
            <details className="eb-stack">
              <summary>查看技术细节</summary>
              <pre>{this.state.stack}</pre>
            </details>
          )}
          <div className="eb-actions">
            <button onClick={this.reset}>🔄 重试</button>
            <button className="ghost" onClick={this.goHome}>🏠 返回大厅</button>
            <button className="ghost" onClick={this.reload}>↻ 刷新页面</button>
          </div>
        </div>
      </div>
    );
  }
}
