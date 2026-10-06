import { useEffect, useState } from 'react';
import { HELP_TOPICS } from './help/topics';
import { api } from './lib/api';
import { HelpProvider, useHelp } from './ui/Help';
import { Icon } from './ui/Icon';

export function App() {
  return (
    <HelpProvider topics={HELP_TOPICS}>
      <div className="app">
        <GlobalHeader />
      </div>
    </HelpProvider>
  );
}

function GlobalHeader() {
  const { open } = useHelp();
  return (
    <header className="global-header">
      <a className="brand" href="#/step1/overview">
        <Icon name="database" size={18} />
        DB 설계 실험실
      </a>
      <span className="header-case">
        Case 01 <strong>콘서트 티켓 예매</strong>
      </span>
      <div className="header-right">
        <DbStatus />
        <button type="button" className="header-button" onClick={() => open('lab')} aria-label="실험실 사용법">
          <Icon name="book" size={14} />
          <span className="header-button-text">실험실 사용법</span>
        </button>
      </div>
    </header>
  );
}

function DbStatus() {
  const [state, setState] = useState<{ kind: 'checking' | 'up' | 'down'; version?: string }>({
    kind: 'checking',
  });

  useEffect(() => {
    api<{ postgres: string }>('/health')
      .then(({ postgres }) => setState({ kind: 'up', version: postgres }))
      .catch(() => setState({ kind: 'down' }));
  }, []);

  return (
    <span
      className="db-status"
      data-state={state.kind}
      role="status"
      title={state.kind === 'up' ? `PostgreSQL ${state.version} 연결됨` : undefined}
    >
      <Icon name={state.kind === 'up' ? 'success' : state.kind === 'down' ? 'error' : 'pending'} size={14} />
      <span className="db-status-text">
        {state.kind === 'checking' && 'DB 확인 중'}
        {state.kind === 'up' && `PostgreSQL ${state.version} 연결됨`}
        {state.kind === 'down' && 'DB 연결 안 됨'}
      </span>
      <span className="db-status-short" aria-hidden="true">
        {state.kind === 'checking' ? '확인 중' : state.kind === 'up' ? 'DB 연결됨' : 'DB 끊김'}
      </span>
    </span>
  );
}
