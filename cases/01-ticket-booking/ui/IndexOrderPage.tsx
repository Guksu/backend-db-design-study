import { useRef, useState } from 'react';
import { describeError } from '@web/lib/api';
import { writeLastRun } from '@web/lib/lastRun';
import { postEventStream } from '@web/sim/eventStream';
import { PlanTree } from '@web/sim/PlanTree';
import '@web/sim/sim.css';
import { Alert, Button, Container, CopyButton, Explainer, PageHeader, StatusIndicator, type Status } from '@web/ui/Layout';
import {
  ORDER_VARIANTS,
  type OrderLabStart,
  type OrderSample,
  type OrderVariant,
  type OrderVariantResult,
  type QueryMeasure,
} from '../indexOrderLab';
import { crumbs, RequireSchema } from './TicketCase';

const SIZES = [
  { rows: 100_000, label: '회차 10만 행', note: '약 5초 · 공연 2만 개' },
  { rows: 1_000_000, label: '회차 100만 행', note: '약 30초 · 공연 20만 개' },
];

/** 표 머리에 쓸 짧은 이름 */
const SHORT: Record<OrderVariant, { title: string; sub: string }> = {
  'concert-first': { title: '(concert_id, starts_at)', sub: 'UNIQUE 1개' },
  'time-first': { title: '(starts_at, concert_id)', sub: 'UNIQUE 1개' },
  'time-first-plus': { title: '(starts_at, concert_id)', sub: '+ INDEX (concert_id)' },
};

const msText = (v: number) => (v < 1 ? `${v.toFixed(3)}ms` : v < 100 ? `${v.toFixed(1)}ms` : `${Math.round(v).toLocaleString()}ms`);
const mbText = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
const times = (a: number, b: number) => `${(a / b).toFixed(a / b < 10 ? 1 : 0)}배`;
const hasSeqScan = (m: QueryMeasure) => JSON.stringify(m.plan).includes('Seq Scan');
const extraIndexBytes = (r: OrderVariantResult) => r.indexes.filter((i) => i.kind !== 'pk').reduce((sum, i) => sum + i.bytes, 0);

/** 이보다 작은 쓰기 차이는 측정 오차로 본다 (FK 인덱스 실험과 같은 기준) */
const NOISE_PCT = 8;

export function IndexOrderPage() {
  const [rows, setRows] = useState(100_000);
  const [start, setStart] = useState<OrderLabStart | null>(null);
  const [results, setResults] = useState<Partial<Record<OrderVariant, OrderVariantResult>>>({});
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function run() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStart(null);
    setResults({});
    setState('running');
    setError(null);
    const collected: Partial<Record<OrderVariant, OrderVariantResult>> = {};
    try {
      await postEventStream(
        '/ticket/index-order-lab',
        { rows },
        (event, data) => {
          if (event === 'start') setStart(data as OrderLabStart);
          if (event === 'variant') {
            const result = data as OrderVariantResult;
            collected[result.variant] = result;
            setResults({ ...collected });
          }
        },
        controller.signal,
      );
      setState('done');
      const cf = collected['concert-first'];
      const tf = collected['time-first'];
      if (cf && tf) writeLastRun('index-order', { rows, fkRatio: tf.fkCheckMs / cf.fkCheckMs });
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(describeError(err));
      setState('idle');
    }
  }

  const measured = ORDER_VARIANTS.filter((v) => results[v.id]).length;
  const complete = measured === ORDER_VARIANTS.length;

  return (
    <div className="page">
      <PageHeader
        crumbs={crumbs('복합 인덱스 순서')}
        title="복합 인덱스 순서 (Q22)"
        info="composite-index"
        description="UNIQUE 컬럼 순서만 다른 회차 테이블 세 개를 같은 데이터로 비교해요."
        actions={
          <Button variant="primary" icon="play" loading={state === 'running'} onClick={run}>
            {state === 'done' ? '다시 실행' : '실행'}
          </Button>
        }
      />
      <RequireSchema>
        <div className="page-stack">
          <Explainer
            question="UNIQUE (concert_id, starts_at)과 (starts_at, concert_id)는 무엇이 다를까?"
            method="구성만 다른 테이블 3개 · 같은 회차 데이터 · EXPLAIN ANALYZE"
            reading="초록 = 인덱스로 바로 찾음 · 빨강 = 테이블 전체를 읽음"
            result={complete && <OrderHeadline results={results as Record<OrderVariant, OrderVariantResult>} />}
            more={
              <>
                <p>
                  Q22의 결정을 위한 실험이에요. 공연마다 회차 5개(5일 연속)가 있는 실험용 회차 테이블을 세 가지 구성으로
                  만들고 같은 데이터를 넣어요. 그다음 공연 다섯 곳의 회차 목록, 다섯 날의 전체 회차를{' '}
                  <code>EXPLAIN ANALYZE</code>로 조회하고, 회차가 없는 공연 하나를 지워 FK 검사 시간을 재요. 실제{' '}
                  <code>schedules</code>는 건드리지 않아요.
                </p>
                <p>
                  복합 인덱스는 <strong>앞 컬럼으로 먼저 정렬</strong>되고, 앞 컬럼 값이 같을 때만 뒤 컬럼으로 정렬돼요.
                  그래서 앞 컬럼으로 찾는 질문은 한 지점에서 이어 읽으면 되지만, 뒤 컬럼만으로 찾는 질문은 인덱스를 쓰지
                  못해요. 중복을 막는 효과는 순서와 상관없이 같아요.
                </p>
                {complete && <OrderInterpretation results={results as Record<OrderVariant, OrderVariantResult>} />}
              </>
            }
          />

          <Alert type="success" title="Q22 결정: UNIQUE (concert_id, starts_at), FK 인덱스는 따로 만들지 않음">
            공연을 먼저 정하고 그 안에서 시각을 찾는 게 자연스러워서요. <code>schedules_concert_starts_uq</code>로
            schema.sql에 반영됐어요.
          </Alert>

          <Container title="데이터 크기">
            <div className="size-picker" role="radiogroup" aria-label="데이터 크기">
              {SIZES.map((s) => (
                <label key={s.rows} className="size-option" data-checked={rows === s.rows || undefined}>
                  <input type="radio" name="order-size" checked={rows === s.rows} onChange={() => setRows(s.rows)} disabled={state === 'running'} />
                  <span>
                    <strong>{s.label}</strong>
                    <span className="muted">{s.note}</span>
                  </span>
                </label>
              ))}
            </div>
            {state === 'running' && (
              <div className="progress" role="status" style={{ marginTop: 14 }}>
                <span className="progress-bar">
                  <span style={{ transform: `scaleX(${measured / ORDER_VARIANTS.length})` }} />
                </span>
                {measured} / {ORDER_VARIANTS.length}개 구성 측정
              </div>
            )}
          </Container>

          {error && (
            <Alert type="error" title="실험을 끝내지 못했어요">
              {error}
            </Alert>
          )}

          {start && <OrderIllustration sample={start.sample} perDay={Math.round(start.rows / 1826)} />}
          {start && <CompareMatrix results={results} rows={start.rows} />}
          {complete && <PlanCompare results={results as Record<OrderVariant, OrderVariantResult>} />}

          {!start && state === 'idle' && (
            <Container>
              <div className="empty">
                <strong>크기를 고르고 실행하세요</strong>
              </div>
            </Container>
          )}
        </div>
      </RequireSchema>
    </div>
  );
}

// ── 인덱스 안의 정렬 순서 ──────────────────────────────────

type Target = 'concert' | 'day';

function OrderIllustration({ sample, perDay }: { sample: OrderSample; perDay: number }) {
  const [target, setTarget] = useState<Target>('concert');
  const concertId = sample.concertIds[1];
  const [, month, date] = sample.day.split('-').map(Number);
  const dayLabel = `${month}월 ${date}일`;
  const matches = (r: OrderSample['rows'][number]) => (target === 'concert' ? r.concertId === concertId : r.day === sample.day);

  const orders: { key: OrderVariant; title: string; sorted: OrderSample['rows']; keyFirst: 'concert' | 'time' }[] = [
    {
      key: 'concert-first',
      title: '(concert_id, starts_at) 순서',
      keyFirst: 'concert',
      sorted: [...sample.rows].sort((a, b) => a.concertId - b.concertId || a.startsAt.localeCompare(b.startsAt)),
    },
    {
      key: 'time-first',
      title: '(starts_at, concert_id) 순서',
      keyFirst: 'time',
      sorted: [...sample.rows].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.concertId - b.concertId),
    },
  ];

  return (
    <Container
      title="인덱스 안의 정렬 순서"
      info="composite-index"
      description={`실제 데이터에서 회차가 겹치는 공연 3개만 뽑았어요. 실제 인덱스에는 하루에 회차가 약 ${perDay.toLocaleString()}개 있어요.`}
      actions={
        <div className="segmented" role="group" aria-label="찾는 것">
          <button type="button" aria-pressed={target === 'concert'} onClick={() => setTarget('concert')}>
            공연 #{concertId}의 회차
          </button>
          <button type="button" aria-pressed={target === 'day'} onClick={() => setTarget('day')}>
            {dayLabel}의 회차
          </button>
        </div>
      }
    >
      <div className="order-lists">
        {orders.map((order) => {
          const hits = order.sorted.flatMap((r, i) => (matches(r) ? [i] : []));
          const together = hits.length > 0 && hits[hits.length - 1] - hits[0] + 1 === hits.length;
          return (
            <section key={order.key}>
              <h3 className="mono">{order.title}</h3>
              <StatusIndicator type={together ? 'success' : 'error'}>
                {together ? '한곳에 모여 있음 · 찾은 곳부터 이어 읽기' : '흩어져 있음 · 처음부터 끝까지 확인'}
              </StatusIndicator>
              <ol className="order-entries">
                {order.sorted.map((r, i) => {
                  const concert = <span>#{r.concertId}</span>;
                  const time = <span>{r.startsAt}</span>;
                  return (
                    <li key={`${r.concertId}-${r.startsAt}`} data-match={matches(r) || undefined}>
                      <span className="order-pos">{i + 1}</span>
                      {order.keyFirst === 'concert' ? (
                        <>
                          {concert}
                          {time}
                        </>
                      ) : (
                        <>
                          {time}
                          {concert}
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </Container>
  );
}

// ── 질문별 비교 ────────────────────────────────────────────

interface Cell {
  value: number;
  text: string;
  status: Status;
  verdict: string;
  detail?: string;
}

interface Question {
  key: string;
  title: string;
  sub: string;
  cells: (results: Partial<Record<OrderVariant, OrderVariantResult>>) => Partial<Record<OrderVariant, Cell>>;
}

function readCell(m: QueryMeasure): Cell {
  const seq = hasSeqScan(m);
  return {
    value: m.ms,
    text: msText(m.ms),
    status: seq ? 'error' : 'success',
    verdict: seq ? '전체 읽기' : '인덱스',
    detail: `${m.pages.toLocaleString()}페이지`,
  };
}

/** 같은 줄에서 가장 작은 값과 비교한다 */
function rowMin(results: Partial<Record<OrderVariant, OrderVariantResult>>, pick: (r: OrderVariantResult) => number) {
  const values = Object.values(results).map((r) => pick(r!));
  return values.length ? Math.min(...values) : 0;
}

const QUESTIONS: Question[] = [
  {
    key: 'byConcert',
    title: '이 공연의 회차 목록',
    sub: 'WHERE concert_id = ? ORDER BY starts_at',
    cells: (results) => mapResults(results, (r) => readCell(r.byConcert)),
  },
  {
    key: 'byDay',
    title: '하루에 열리는 전체 회차',
    sub: 'WHERE starts_at이 그날 ORDER BY starts_at',
    cells: (results) => mapResults(results, (r) => readCell(r.byDay)),
  },
  {
    key: 'fk',
    title: '공연 삭제 시 FK 검사',
    sub: '지울 공연을 가리키는 회차 찾기',
    cells: (results) => {
      const min = rowMin(results, (r) => r.fkCheckMs);
      return mapResults(results, (r) => {
        const slow = r.fkCheckMs >= min * 5;
        return {
          value: r.fkCheckMs,
          text: msText(r.fkCheckMs),
          status: slow ? 'error' : 'success',
          verdict: slow ? `${times(r.fkCheckMs, min)} 느림` : '빠름',
        };
      });
    },
  },
  {
    key: 'insert',
    title: '회차 대량 INSERT',
    sub: '모든 행을 한 번에',
    cells: (results) => {
      const min = rowMin(results, (r) => r.insertMs);
      return mapResults(results, (r) => {
        const pct = (r.insertMs / min - 1) * 100;
        return {
          value: r.insertMs,
          text: msText(r.insertMs),
          status: pct < NOISE_PCT ? 'success' : 'warning',
          verdict: pct < NOISE_PCT ? '차이 없음' : `+${pct.toFixed(0)}%`,
        };
      });
    },
  },
  {
    key: 'space',
    title: '인덱스 크기',
    sub: 'PK 인덱스 제외',
    cells: (results) =>
      mapResults(results, (r) => {
        const count = r.indexes.filter((i) => i.kind !== 'pk').length;
        return {
          value: extraIndexBytes(r),
          text: mbText(extraIndexBytes(r)),
          status: count > 1 ? 'warning' : 'success',
          verdict: `인덱스 ${count}개`,
        };
      }),
  },
];

function mapResults(results: Partial<Record<OrderVariant, OrderVariantResult>>, cell: (r: OrderVariantResult) => Cell) {
  const out: Partial<Record<OrderVariant, Cell>> = {};
  for (const v of ORDER_VARIANTS) {
    const r = results[v.id];
    if (r) out[v.id] = cell(r);
  }
  return out;
}

function CompareMatrix({ results, rows }: { results: Partial<Record<OrderVariant, OrderVariantResult>>; rows: number }) {
  return (
    <Container
      title="질문별 비교"
      info="explain"
      description={`회차 ${rows.toLocaleString()}행 · 조회는 5번 중앙값 · 막대는 줄마다 가장 큰 값 기준`}
      flush
    >
      <div className="table-scroll">
        <table className="table compare-matrix">
          <thead>
            <tr>
              <th>질문</th>
              {ORDER_VARIANTS.map((v) => (
                <th key={v.id}>
                  <span className="mono">{SHORT[v.id].title}</span>
                  <span className="compare-sub">{SHORT[v.id].sub}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {QUESTIONS.map((q) => {
              const cells = q.cells(results);
              const max = Math.max(1e-9, ...Object.values(cells).map((c) => c!.value));
              return (
                <tr key={q.key}>
                  <td>
                    <strong>{q.title}</strong>
                    <span className="compare-sub mono">{q.sub}</span>
                  </td>
                  {ORDER_VARIANTS.map((v) => {
                    const cell = cells[v.id];
                    if (!cell) {
                      return (
                        <td key={v.id} className="muted">
                          측정 중
                        </td>
                      );
                    }
                    return (
                      <td key={v.id}>
                        <div className="compare-cell">
                          <StatusIndicator type={cell.status}>{cell.verdict}</StatusIndicator>
                          <span className="compare-value num">
                            {cell.text}
                            {cell.detail && <span className="muted"> · {cell.detail}</span>}
                          </span>
                          <span className="compare-track" aria-hidden="true">
                            <span data-status={cell.status} style={{ transform: `scaleX(${Math.max(0.01, cell.value / max)})` }} />
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Container>
  );
}

// ── 실행 계획 ───────────────────────────────────────────────

function PlanCompare({ results }: { results: Record<OrderVariant, OrderVariantResult> }) {
  const [query, setQuery] = useState<'byConcert' | 'byDay'>('byConcert');
  const sql = results['concert-first'][query].sql.replace(/lab_ord_schedules_\w+/, 'schedules');
  return (
    <Container
      title="실행 계획"
      info="explain"
      description="아래 단계가 먼저 실행돼요"
      actions={
        <div className="segmented" role="group" aria-label="질문">
          <button type="button" aria-pressed={query === 'byConcert'} onClick={() => setQuery('byConcert')}>
            이 공연의 회차 목록
          </button>
          <button type="button" aria-pressed={query === 'byDay'} onClick={() => setQuery('byDay')}>
            하루의 전체 회차
          </button>
        </div>
      }
    >
      <pre className="plan-sql">
        {sql};
        <CopyButton text={`${sql};`} />
      </pre>
      <div className="grid-3">
        {ORDER_VARIANTS.map((v) => (
          <section key={v.id}>
            <h3 className="plan-side">
              <span className="mono">{SHORT[v.id].title}</span> {SHORT[v.id].sub === 'UNIQUE 1개' ? '' : SHORT[v.id].sub} ·{' '}
              {msText(results[v.id][query].ms)}
            </h3>
            <PlanTree node={results[v.id][query].plan} />
          </section>
        ))}
      </div>
    </Container>
  );
}

// ── 결과 문장 ───────────────────────────────────────────────

function OrderHeadline({ results }: { results: Record<OrderVariant, OrderVariantResult> }) {
  const cf = results['concert-first'];
  const tf = results['time-first'];
  return (
    <>
      앞 컬럼으로 찾는 질문만 빨라요. concert_id가 앞이면 공연별 조회{' '}
      <strong className="result-good">{times(tf.byConcert.ms, cf.byConcert.ms)}</strong> · FK 검사{' '}
      <strong className="result-good">{times(tf.fkCheckMs, cf.fkCheckMs)}</strong> 빠르고, 하루 조회는{' '}
      <strong className="result-bad">{times(cf.byDay.ms, tf.byDay.ms)}</strong> 느려요.
    </>
  );
}

function OrderInterpretation({ results }: { results: Record<OrderVariant, OrderVariantResult> }) {
  const cf = results['concert-first'];
  const plus = results['time-first-plus'];
  const insert = (plus.insertMs / cf.insertMs - 1) * 100;
  return (
    <>
      <p>
        <code>concert_id</code>가 앞이면 UNIQUE 인덱스 하나가 중복 방지, 공연별 회차 조회, 공연 삭제 FK 검사를 모두
        맡아요. Q9에서 <code>seats</code>의 UNIQUE가 <code>venue_id</code>를 앞에 두어 FK 인덱스를 대신한 것과 같아요.
      </p>
      <p>
        순서를 뒤집고 <code>concert_id</code> 인덱스를 더하면 두 조회가 다 빨라지지만, 인덱스가{' '}
        {mbText(extraIndexBytes(plus) - extraIndexBytes(cf))} 늘고 대량 INSERT가{' '}
        {Math.abs(insert) < NOISE_PCT ? '측정 오차 범위에서 달라져요' : `${insert.toFixed(0)}% ${insert > 0 ? '느려져요' : '빨라져요'}`}.
        하루 단위 조회가 정말 자주 필요해지면 그때 <code>starts_at</code> 인덱스를 따로 고민하면 돼요.
      </p>
    </>
  );
}
