'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-bg-primary">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-danger-light flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-8 h-8 text-danger" />
            </div>
            <h2 className="text-xl font-display font-semibold text-text-primary mb-2">应用遇到错误</h2>
            <p className="text-text-secondary text-sm mb-6">请刷新页面重新加载</p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
