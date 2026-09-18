import { Component, type ErrorInfo, type ReactNode } from 'react';
import { dictFor } from '../i18n';
import { useDesign } from '../state/designStore';
import { buttonClass, downloadText } from './common';

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a render crash shows a readable screen with the error text and a one-click backup of
 * every project, instead of a blank page that looks like the work is gone.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; locale: 'he' | 'en' }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Buildable crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const t = dictFor(this.props.locale).crash;
    const projects = useDesign.getState().projects;
    return (
      <div dir={dictFor(this.props.locale).dir} className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper p-8 text-center">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-muted">{t.text(projects.length)}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className={buttonClass('primary', 'md')}
            onClick={() => downloadText(`buildable-projects-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(useDesign.getState().exportAll(), null, 2), 'application/json;charset=utf-8')}
          >
            {t.backup}
          </button>
          <button type="button" className={buttonClass('secondary', 'md')} onClick={() => window.location.reload()}>
            {t.reload}
          </button>
        </div>
        <pre className="max-h-40 max-w-full overflow-auto rounded-lg bg-sunken p-3 text-start text-[12px] text-muted" dir="ltr">
          {error.message}
        </pre>
      </div>
    );
  }
}
