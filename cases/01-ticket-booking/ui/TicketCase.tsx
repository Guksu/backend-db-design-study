import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { api, describeError, post } from '@web/lib/api';
import { useHashRoute } from '@web/lib/useHashRoute';
import { HelpPanel, useHelp } from '@web/ui/Help';
import { Alert, Button, type Crumb } from '@web/ui/Layout';
import type { TableInfo } from '../../../lab/introspect';
import { ConstraintsPage } from './ConstraintsPage';
import { IndexOrderPage } from './IndexOrderPage';
import { IndexPage } from './IndexPage';
import { Overview } from './Overview';
import { RacePage } from './RacePage';
import { SchemaPage } from './SchemaPage';
import { TimePage } from './TimePage';
import './ticket.css';

interface PageDef {
  id: string;
  title: string;
  experiment?: boolean;
  Component: ComponentType;
}

export const STEP1_PAGES: PageDef[] = [
  { id: 'overview', title: '개요', Component: Overview },
  { id: 'schema', title: '스키마', Component: SchemaPage },
  { id: 'constraints', title: '제약조건 검증', experiment: true, Component: ConstraintsPage },
  { id: 'race', title: '동시 INSERT 경쟁', experiment: true, Component: RacePage },
  { id: 'index', title: 'FK 인덱스 비교', experiment: true, Component: IndexPage },
  { id: 'time', title: '시간 타입 비교', experiment: true, Component: TimePage },
  { id: 'index-order', title: '복합 인덱스 순서', experiment: true, Component: IndexOrderPage },
];

const PLANNED_STEPS = [
  { n: 2, title: '점유와 만료' },
  { n: 3, title: '동시성 문제 재현' },
  { n: 4, title: 'DB 락 전략 비교' },
  { n: 5, title: 'Redis로 점유하기' },
  { n: 6, title: '대기열' },
  { n: 7, title: '결제 정합성과 멱등성' },
  { n: 8, title: '다중 서버' },
];

export const pageHref = (id: string) => `#/step1/${id}`;

export function crumbs(pageTitle: string): Crumb[] {
  return [
    { label: 'Case 01 · 콘서트 티켓 예매', href: pageHref('overview') },
    { label: 'Step 1 · ERD', href: pageHref('overview') },
    { label: pageTitle },
  ];
}

// ── 케이스 공용 상태: 스키마와 DB 초기화 ──────────────────────

interface CaseState {
  tables: TableInfo[] | null;
  error: string | null;
  resetting: boolean;
  reset: () => Promise<void>;
  /** DB를 초기화할 때마다 늘어난다. 페이지는 이 값이 바뀌면 다시 불러온다 */
  version: number;
}

const CaseContext = createContext<CaseState | null>(null);

export function useCase() {
  const context = useContext(CaseContext);
  if (!context) throw new Error('TicketCase 안에서만 쓸 수 있어요');
  return context;
}

export function TicketCase() {
  const path = useHashRoute('/step1/overview');
  const pageId = path.split('/')[2];
  const page = STEP1_PAGES.find((p) => p.id === pageId) ?? STEP1_PAGES[0];
  const { topicId } = useHelp();
  const main = useRef<HTMLElement>(null);

  const [tables, setTables] = useState<TableInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api<TableInfo[]>('/ticket/erd')
      .then((t) => {
        setTables(t);
        setError(null);
      })
      .catch((err) => setError(describeError(err)));
  }, [version]);

  const reset = useCallback(async () => {
    setResetting(true);
    try {
      await post('/ticket/reset');
      setVersion((v) => v + 1);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setResetting(false);
    }
  }, []);

  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
    document.title = `${page.title} · DB 설계 실험실`;
  }, [page]);

  return (
    <CaseContext.Provider value={{ tables, error, resetting, reset, version }}>
      <div className="workspace" data-help={topicId ? '' : undefined}>
        <nav className="sidenav" aria-label="단계와 페이지">
          <div className="sidenav-head">
            <strong>콘서트 티켓 예매</strong>
            <p>예매가 열리는 순간 수만 명이 1,000석을 두고 경쟁하는 상황</p>
          </div>
          <ul>
            <li className="sidenav-step">
              <div className="sidenav-step-label">
                <span className="step-n">1</span>
                ERD
                <span className="badge">진행 중</span>
              </div>
              <ul>
                {STEP1_PAGES.map((p, i) => (
                  <li key={p.id}>
                    {p.experiment && !STEP1_PAGES[i - 1]?.experiment && (
                      <div className="sidenav-group">실험</div>
                    )}
                    <a href={pageHref(p.id)} aria-current={p.id === page.id ? 'page' : undefined}>
                      {p.title}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
            {PLANNED_STEPS.map((s) => (
              <li key={s.n} className="sidenav-step" data-planned>
                <div className="sidenav-step-label">
                  <span className="step-n">{s.n}</span>
                  {s.title}
                  <span className="badge">예정</span>
                </div>
              </li>
            ))}
          </ul>
        </nav>
        <main className="main" ref={main} id="main">
          <nav className="mobile-nav" aria-label="Step 1 페이지">
            {STEP1_PAGES.map((p) => (
              <a key={p.id} href={pageHref(p.id)} aria-current={p.id === page.id ? 'page' : undefined}>
                {p.title}
              </a>
            ))}
          </nav>
          <page.Component key={page.id} />
        </main>
        <HelpPanel />
      </div>
    </CaseContext.Provider>
  );
}

/** 스키마가 준비되지 않았으면 이유와 해결 방법을 보여 준다 */
export function RequireSchema({ children }: { children: ReactNode }) {
  const { tables, error, reset, resetting } = useCase();
  if (error) {
    return (
      <Alert type="error" title="실험 서버나 DB에 연결할 수 없어요">
        {error}
      </Alert>
    );
  }
  if (tables === null) {
    return (
      <div className="container container-body" aria-busy="true">
        <div className="skeleton" style={{ width: '40%' }} />
        <div className="skeleton" style={{ width: '70%', marginTop: 10 }} />
      </div>
    );
  }
  if (tables.length === 0) {
    return (
      <div className="container empty">
        <strong>아직 테이블이 없어요</strong>
        schema.sql과 seed.sql을 적용하면 합의한 테이블과 시드 데이터가 만들어져요.
        <div>
          <Button variant="primary" icon="refresh" loading={resetting} onClick={reset}>
            DB 초기화
          </Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function ResetButton() {
  const { reset, resetting } = useCase();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="confirm" role="group" aria-label="DB 초기화 확인">
        <span>
          실험 데이터와 테이블을 지우고 schema.sql · seed.sql로 다시 만들어요. 같은 DB를 쓰는 다른
          방문자에게도 적용돼요.
        </span>
        <Button
          icon="refresh"
          loading={resetting}
          onClick={async () => {
            await reset();
            setConfirming(false);
          }}
        >
          초기화
        </Button>
        <Button onClick={() => setConfirming(false)} disabled={resetting}>
          취소
        </Button>
      </div>
    );
  }
  return (
    <Button icon="refresh" onClick={() => setConfirming(true)}>
      DB 초기화
    </Button>
  );
}
