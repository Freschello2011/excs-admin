import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import s from './ErrorBoundary.module.scss';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={s.errorPage}>
          <div className={s.errorCard}>
            <div className={s.iconWrap}>
              <span className={`material-symbols-outlined ${s.icon}`}>error</span>
            </div>
            <h2 className={s.title}>页面出了点问题</h2>
            <p className={s.desc}>
              {this.state.error?.message || '发生了未知错误，请刷新页面重试。'}
            </p>
            <button className={s.btnRefresh} onClick={this.handleReset} type="button">
              <span className={`material-symbols-outlined ${s.icon}`}>refresh</span>
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
