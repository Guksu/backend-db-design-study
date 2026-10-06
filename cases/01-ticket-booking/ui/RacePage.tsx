import { useMemo, useRef, useState } from 'react';
import { describeError, post } from '@web/lib/api';
import { writeLastRun } from '@web/lib/lastRun';
import { postEventStream } from '@web/sim/eventStream';
import { Heatmap } from '@web/sim/Heatmap';
import {
  OutcomeGlyph,
  Timeline,
  TimelineLegend,
  type OutcomeStyle,
  type SegmentStyle,
  type TimelineLane,
} from '@web/sim/Timeline';
import { usePlayback } from '@web/sim/usePlayback';
import '@web/sim/sim.css';
import { Icon } from '@web/ui/Icon';
import {
  Alert,
  Button,
  Container,
  Explainer,
  KeyValue,
  PageHeader,
  StatusIndicator,
} from '@web/ui/Layout';
import type { AttemptOutcome, AttemptTrace, RaceOptions, RaceTrace, RaceTxMode, SweepCell } from '../ticket';
import { crumbs, RequireSchema } from './TicketCase';

interface Run {
  id: number;
  at: string;
  options: RaceOptions;
  checkOnly: RaceTrace;
  checkAndUnique: RaceTrace;
}

type StrategyKey = 'checkOnly' | 'checkAndUnique';

const STRATEGIES: { key: StrategyKey; title: string; subtitle: string }[] = [
  {
    key: 'checkOnly',
    title: '애플리케이션 확인만',
    subtitle: 'UNIQUE 없음',
  },
  {
    key: 'checkAndUnique',
    title: '애플리케이션 확인 + UNIQUE',
    subtitle: 'UNIQUE 있음 (Q9)',
  },
];

const PRESETS = [
  { id: 'open', label: '티켓 오픈 직후', hint: '수십 명이 거의 같은 순간에 누른다', users: 30, spreadMs: 20, gapMs: 20 },
  { id: 'slow', label: '느린 네트워크', hint: '확인과 INSERT 사이가 길다', users: 20, spreadMs: 100, gapMs: 80 },
  { id: 'calm', label: '평소 트래픽', hint: '요청이 드문드문 온다', users: 10, spreadMs: 600, gapMs: 10 },
  { id: 'worst', label: '완전 동시 도착', hint: '모든 요청이 같은 순간에 도착한다', users: 20, spreadMs: 0, gapMs: 0 },
] as const;

/** 한 사용자가 자기 커넥션에서 SELECT와 INSERT를 묶는 방식 (Q20) */
const TX_MODES: { id: RaceTxMode; label: string; flow: string; headline: string }[] = [
  { id: 'autocommit', label: '자동 커밋', flow: 'SELECT · INSERT가 각자 바로 커밋', headline: '' },
  { id: 'transaction', label: '트랜잭션', flow: 'BEGIN → SELECT → INSERT → COMMIT', headline: '한 트랜잭션으로 묶어도 ' },
  { id: 'for-update', label: 'FOR UPDATE', flow: 'BEGIN → SELECT … FOR UPDATE → INSERT → COMMIT', headline: 'FOR UPDATE를 붙여도 ' },
];

/** 예전 실행 기록에는 txMode가 없다 */
const modeOf = (options: RaceOptions) => TX_MODES.find((m) => m.id === (options.txMode ?? 'autocommit'))!;

const SEGMENTS: Record<string, SegmentStyle> = {
  select: { label: 'SELECT로 확인', color: 'var(--series-select)' },
  gap: { label: '확인 → INSERT 사이 대기', color: 'var(--muted)', hatch: true },
  insert: { label: 'INSERT', color: 'var(--series-insert)' },
  commit: { label: 'COMMIT', color: 'var(--ink-2)' },
};

const OUTCOMES: Record<AttemptOutcome, OutcomeStyle> = {
  inserted: { label: '정상 INSERT', color: 'var(--success)', icon: 'check' },
  duplicate: { label: '중복 INSERT', color: 'var(--error)', icon: 'cross' },
  'blocked-by-check': { label: '확인에서 멈춤', color: 'var(--muted)', icon: 'minus' },
  'blocked-by-unique': { label: 'UNIQUE가 거부', color: 'var(--ink-2)', icon: 'shield' },
  error: { label: '다른 에러', color: 'var(--error)', icon: 'cross' },
};

const SPEEDS = [0.005, 0.01, 0.05, 1];
const HISTORY_KEY = 'ticket-race-history';

const ms = (v: number) => `${v.toFixed(1)}ms`;
const userLabel = (user: number) => `u${String(user).padStart(2, '0')}`;
const randomSeed = () => Math.floor(Math.random() * 100000);

function loadHistory(): Run[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveHistory(runs: Run[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(runs.slice(0, 12)));
  } catch {
    // 저장소를 못 쓰면 이번 세션에서만 기억한다
  }
}

function summarize(trace: RaceTrace) {
  const count = (o: AttemptOutcome) => trace.attempts.filter((a) => a.outcome === o).length;
  const latencies = trace.attempts.map((a) => a.endAt - a.select[0]).sort((a, b) => a - b);
  const percentile = (p: number) =>
    latencies[Math.min(latencies.length - 1, Math.max(0, Math.ceil(p * latencies.length) - 1))];
  return {
    rows: trace.rowsAfter,
    duplicates: count('duplicate'),
    blockedByCheck: count('blocked-by-check'),
    blockedByUnique: count('blocked-by-unique'),
    sawNone: trace.attempts.filter((a) => !a.sawRow).length,
    p95: percentile(0.95),
  };
}

function toLanes(trace: RaceTrace): TimelineLane[] {
  return [...trace.attempts]
    .sort((a, b) => a.plannedAt - b.plannedAt)
    .map((a) => ({
      id: String(a.user),
      label: userLabel(a.user),
      segments: [
        { kind: 'select', start: a.select[0], end: a.select[1] },
        ...(a.insert
          ? [
              { kind: 'gap', start: a.select[1], end: a.insert[0] },
              { kind: 'insert', start: a.insert[0], end: a.insert[1] },
            ]
          : []),
        ...(a.commit ? [{ kind: 'commit', start: a.commit[0], end: a.commit[1] }] : []),
      ],
      outcome: { at: a.endAt, kind: a.outcome },
      detail: [
        `${userLabel(a.user)} · ${OUTCOMES[a.outcome].label}`,
        ...(a.pid ? [`커넥션 PID ${a.pid}`] : []),
        `SELECT  ${ms(a.select[0])} → ${ms(a.select[1])} (${a.sawRow ? '있음' : '없음'})`,
        ...(a.insert ? [`INSERT  ${ms(a.insert[0])} → ${ms(a.insert[1])}`] : []),
        ...(a.commit ? [`COMMIT  ${ms(a.commit[0])} → ${ms(a.commit[1])}`] : []),
        '누르면 자세히 봐요',
      ],
    }));
}

/** 묶는 방식마다 "그래도 왜 못 막았나"를 한 문장으로 */
const WHY_NOT_PREVENTED: Record<RaceTxMode, string> = {
  autocommit: '',
  transaction:
    ' 같은 커넥션, 한 트랜잭션 안이었지만 READ COMMITTED에서 SELECT는 그 순간 커밋된 행만 봐요. 트랜잭션은 다른 커넥션의 INSERT를 막지 않아요.',
  'for-update':
    ' FOR UPDATE는 SELECT가 찾은 행만 잠가요. 아직 없는 행은 잠글 게 없어서 아무도 기다리지 않았어요.',
};

/** 요청 하나가 왜 그 결과가 됐는지 문장으로 */
function explainAttempt(a: AttemptTrace, trace: RaceTrace, mode: RaceTxMode): string {
  const commit = trace.firstCommitAt;
  switch (a.outcome) {
    case 'inserted':
      return '가장 먼저 커밋해서 정상으로 등록된 요청이에요. 이 커밋 시각이 빨간 점선이에요.';
    case 'duplicate':
      return `SELECT가 끝난 ${ms(a.select[1])}에는 아직 커밋된 행이 없어서 "없음"을 봤어요. 그래서 INSERT했고, 커밋을 마친 ${ms(a.endAt)}에는 같은 좌석이 이미 ${ms(commit ?? 0)}에 다른 커넥션에서 커밋돼 있었어요. UNIQUE 제약이 없어서 DB가 막지 못하고 같은 좌석이 한 번 더 들어갔어요.${WHY_NOT_PREVENTED[mode]}`;
    case 'blocked-by-check':
      return `SELECT를 시작한 ${ms(a.select[0])}에는 첫 행이 이미 커밋돼 있었어요(${ms(commit ?? 0)}). 그래서 "있음"을 보고 INSERT하지 않았어요. 애플리케이션 확인이 제 역할을 한 경우예요.`;
    case 'blocked-by-unique':
      return `SELECT 때(${ms(a.select[1])})는 아직 커밋된 행이 없어 "없음"을 봤지만, INSERT 시점에 유니크 인덱스에 같은 키가 있어서 DB가 23505로 거부했어요. 애플리케이션 확인의 틈을 DB 제약이 막은 경우예요.`;
    default:
      return a.error ?? '예상하지 못한 에러예요.';
  }
}

export function RacePage() {
  const [preset, setPreset] = useState<string | null>('open');
  const [options, setOptions] = useState<RaceOptions>({
    users: 30,
    spreadMs: 20,
    gapMs: 20,
    seed: randomSeed(),
    txMode: 'autocommit',
  });
  const [history, setHistory] = useState<Run[]>(loadHistory);
  const [currentId, setCurrentId] = useState<number | null>(history[0]?.id ?? null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = history.find((r) => r.id === currentId) ?? null;

  const set = (patch: Partial<RaceOptions>) => {
    setPreset(null);
    setOptions((o) => ({ ...o, ...patch }));
  };

  async function execute() {
    setRunning(true);
    setError(null);
    try {
      const result = await post<Omit<Run, 'id' | 'at'>>('/ticket/race', options);
      const next: Run = {
        ...result,
        id: (history[0]?.id ?? 0) + 1,
        at: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      };
      const updated = [next, ...history].slice(0, 12);
      setHistory(updated);
      saveHistory(updated);
      setCurrentId(next.id);
      writeLastRun('race', {
        users: next.options.users,
        duplicates: next.checkOnly.rowsAfter - 1,
        uniqueRows: next.checkAndUnique.rowsAfter,
      });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        crumbs={crumbs('동시 INSERT 경쟁')}
        title="동시 INSERT 경쟁"
        info="race"
        description={'같은 좌석을 여러 명이 동시에 등록할 때 "확인 후 INSERT"로 막을 수 있는지 재현해요.'}
        actions={
          <Button variant="primary" icon="play" loading={running} onClick={execute}>
            실행
          </Button>
        }
      />
      <RequireSchema>
        <div className="page-stack">
          <Explainer
            question={'"확인 후 INSERT"만으로 중복을 막을 수 있을까?'}
            method="여러 명이 같은 좌석을 동시에 INSERT · UNIQUE 유무만 다름"
            reading="한 줄 = 한 사용자의 커넥션 · 빨간 점선 = 첫 커밋"
            result={run && <RaceHeadline run={run} />}
            more={
              <>
                <p>
                  Q9에서 UNIQUE를 걸기로 한 이유를 확인하는 실험이에요. 가상 사용자들이 각자 DB 커넥션을 잡고
                  정해진 시각에 도착해 같은 좌석(RACE구역 1열 1번)을 넣으려 해요. 두 전략은 <strong>같은 도착
                  시각</strong>으로 돌고, 차이는 테이블의 UNIQUE 제약 하나뿐이에요. 끝나면 넣은 행은 지워요.
                </p>
                <p>
                  사용자마다 커넥션 하나로 SELECT와 INSERT를 모두 보내요(요청 상세의 PID). "한 커넥션 안에서 묶기"를
                  바꾸면 그 둘을 트랜잭션이나 <code>FOR UPDATE</code>로 묶었을 때도 중복이 막히는지 볼 수 있어요(Q20).
                </p>
                <p>
                  트레이스에서 파랑은 SELECT, 빗금은 확인 후 INSERT까지의 대기, 주황은 INSERT, 진한 회색은 COMMIT이에요.
                  빨간 점선(첫 커밋)보다 먼저 SELECT를 끝낸 사용자는 아직 행을 볼 수 없어요. 줄을 누르면 그 요청을
                  설명해 줘요.
                </p>
                {run && <RaceInterpretation run={run} />}
              </>
            }
          />

          {error && (
            <Alert type="error" title="실행하지 못했어요">
              {error}
            </Alert>
          )}

          <div className="race-layout">
            <Container title="시나리오">
              <ul className="presets">
                {PRESETS.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={preset === p.id}
                      onClick={() => {
                        setPreset(p.id);
                        setOptions((o) => ({ ...o, users: p.users, spreadMs: p.spreadMs, gapMs: p.gapMs }));
                      }}
                    >
                      <strong>{p.label}</strong>
                      <span>{p.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="params">
                <Param id="users" label="가상 사용자" unit="명" min={2} max={50} value={options.users} onChange={(users) => set({ users })} hint="같은 좌석을 노리는 사람 수" />
                <Param id="spread" label="도착 시간 폭" unit="ms" min={0} max={1000} step={10} value={options.spreadMs} onChange={(spreadMs) => set({ spreadMs })} hint="0이면 모두 같은 순간에 도착" />
                <Param id="gap" label="확인 → INSERT 간격" unit="ms" min={0} max={500} step={5} value={options.gapMs} onChange={(gapMs) => set({ gapMs })} hint="네트워크 왕복 · 처리 시간" />
                <div className="param">
                  <span className="param-label" id="tx-mode">
                    한 커넥션 안에서 묶기
                  </span>
                  <div className="segmented" role="group" aria-labelledby="tx-mode">
                    {TX_MODES.map((m) => (
                      <button key={m.id} type="button" aria-pressed={options.txMode === m.id} onClick={() => setOptions((o) => ({ ...o, txMode: m.id }))}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <span className="param-hint mono">{modeOf(options).flow}</span>
                </div>
                <div className="param">
                  <label htmlFor="seed">시드</label>
                  <div className="seed-row">
                    <input id="seed" type="number" value={options.seed} onChange={(e) => setOptions((o) => ({ ...o, seed: Number(e.target.value) }))} />
                    <button type="button" className="icon-button" onClick={() => setOptions((o) => ({ ...o, seed: randomSeed() }))} aria-label="새 시드" title="새 시드">
                      <Icon name="refresh" />
                    </button>
                  </div>
                  <span className="param-hint">같은 시드 = 같은 도착 순서</span>
                </div>
              </div>
            </Container>

            <div className="page-stack">
              <Container
                title="결과 요약"
                description={run ? `#${run.id} · ${modeOf(run.options).label} · ${run.options.users}명 · 도착 폭 ${run.options.spreadMs}ms · 간격 ${run.options.gapMs}ms · 시드 ${run.options.seed}` : undefined}
                flush
              >
                {run ? (
                  <div className="summary">
                    {STRATEGIES.map(({ key, title, subtitle }) => {
                      const s = summarize(run[key]);
                      return (
                        <section className="summary-column" key={key}>
                          <h3>{title}</h3>
                          <p>{subtitle}</p>
                          <div className="stats">
                            <Stat label="최종 행 수" value={`${s.rows}행`} status={s.rows > 1 ? 'error' : 'success'} note={s.rows > 1 ? `중복 ${s.rows - 1}행` : '중복 없음'} />
                            <Stat label="확인에서 멈춤" value={`${s.blockedByCheck}건`} />
                            <Stat label="UNIQUE가 거부" value={key === 'checkOnly' ? '해당 없음' : `${s.blockedByUnique}건`} />
                            <Stat label="p95 응답 시간" value={ms(s.p95)} />
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty">
                    <strong>시나리오를 고르고 실행하세요</strong>
                  </div>
                )}
              </Container>
              <History history={history} currentId={currentId} onSelect={setCurrentId} />
            </div>
          </div>

          {run && <TraceView run={run} />}
          {run && <Sweep users={run.options.users} seed={run.options.seed} />}
          {run && <RawData run={run} />}
        </div>
      </RequireSchema>
    </div>
  );
}

function Stat({ label, value, note, status }: { label: string; value: string; note?: string; status?: 'success' | 'error' }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value" data-status={status}>
        {value}
      </span>
      {note && status && <StatusIndicator type={status}>{note}</StatusIndicator>}
    </div>
  );
}

function RaceHeadline({ run }: { run: Run }) {
  const duplicates = run.checkOnly.rowsAfter - 1;
  const rejected = summarize(run.checkAndUnique).blockedByUnique;
  if (duplicates === 0) {
    return <>이번 조건에선 중복이 없었어요. 요청이 드문드문 와서 대부분 첫 커밋 뒤에 확인했어요.</>;
  }
  return (
    <>
      {modeOf(run.options).headline}UNIQUE가 없으면 <strong className="result-bad">{duplicates}건이 중복</strong>으로 들어가고, 있으면 DB가{' '}
      {rejected}건을 거부해 <strong className="result-good">1행</strong>만 남아요.
    </>
  );
}

function RaceInterpretation({ run }: { run: Run }) {
  const a = summarize(run.checkOnly);
  const u = summarize(run.checkAndUnique);
  const commit = run.checkOnly.firstCommitAt;
  return (
    <>
      <p>
        사용자 {run.options.users}명 중 <strong>{a.sawNone}명</strong>이 첫 커밋({ms(commit ?? 0)}) 전에
        확인을 마쳐 "없음"을 봤어요.
      </p>
      <p>
        {a.duplicates > 0 ? (
          <>
            확인만 하는 쪽은 그 요청들이 모두 INSERT해서 같은 좌석이 <strong>{a.rows}행</strong>이
            됐어요(중복 {a.duplicates}행).
          </>
        ) : (
          <>확인만 하는 쪽도 이번에는 중복이 없었어요. 요청이 드문드문 와서 대부분 첫 커밋 뒤에 확인했기 때문이에요.</>
        )}{' '}
        UNIQUE 쪽은 확인을 통과한 요청 중 {u.blockedByUnique}건을 DB가 거부해 <strong>{u.rows}행</strong>만
        남았어요.
      </p>
      <p>확인 단계는 늦게 온 요청을 걸러 주지만, 그 틈을 빠져나온 요청은 DB 제약만 막을 수 있어요.</p>
    </>
  );
}

function History({ history, currentId, onSelect }: { history: Run[]; currentId: number | null; onSelect: (id: number) => void }) {
  return (
    <Container title="실행 기록" flush>
      {history.length === 0 ? (
        <div className="empty">아직 기록이 없어요.</div>
      ) : (
        <div className="table-scroll history-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>시각</th>
                <th className="num">사용자</th>
                <th className="num">도착 폭</th>
                <th className="num">간격</th>
                <th>묶기</th>
                <th>확인만</th>
                <th>확인 + UNIQUE</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id} className="selectable-row" aria-selected={r.id === currentId} onClick={() => onSelect(r.id)}>
                  <td>
                    <button type="button" className="row-link" onClick={() => onSelect(r.id)}>
                      #{r.id}
                    </button>
                  </td>
                  <td className="num">{r.at}</td>
                  <td className="num">{r.options.users}</td>
                  <td className="num">{r.options.spreadMs}ms</td>
                  <td className="num">{r.options.gapMs}ms</td>
                  <td className="nowrap">{modeOf(r.options).label}</td>
                  <td>
                    <StatusIndicator type={r.checkOnly.rowsAfter > 1 ? 'error' : 'success'}>
                      {r.checkOnly.rowsAfter > 1 ? `중복 ${r.checkOnly.rowsAfter - 1}` : '중복 없음'}
                    </StatusIndicator>
                  </td>
                  <td>
                    <StatusIndicator type={r.checkAndUnique.rowsAfter > 1 ? 'error' : 'success'}>
                      {r.checkAndUnique.rowsAfter}행
                    </StatusIndicator>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}

const { commit: _commit, ...withoutCommit } = SEGMENTS;

function TraceView({ run }: { run: Run }) {
  const domain = Math.max(run.checkOnly.durationMs, run.checkAndUnique.durationMs) * 1.06 + 1;
  const playback = usePlayback(domain, run.id);
  const [view, setView] = useState<'waterfall' | 'table'>('waterfall');
  const [selected, setSelected] = useState<{ strategy: StrategyKey; user: number } | null>(null);
  const selectedAttempt = selected
    ? run[selected.strategy].attempts.find((a) => a.user === selected.user) ?? null
    : null;
  const mode = modeOf(run.options).id;
  const segmentStyles = mode === 'autocommit' ? withoutCommit : SEGMENTS;

  return (
    <Container
      title="트레이스"
      info="visibility"
      description="실제로는 수십 ms에 끝나는 일을 느리게 재생해요"
      flush
    >
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'waterfall'} onClick={() => setView('waterfall')}>
          워터폴
        </button>
        <button type="button" role="tab" aria-selected={view === 'table'} onClick={() => setView('table')}>
          요청 목록
        </button>
      </div>

      {view === 'waterfall' ? (
        <>
          <div className="transport" role="group" aria-label="재생">
            <button type="button" className="btn" onClick={playback.playing ? playback.pause : playback.play}>
              <Icon name={playback.playing ? 'pause' : 'play'} />
              {playback.playing ? '일시정지' : '재생'}
            </button>
            <button type="button" className="btn" onClick={playback.restart}>
              <Icon name="restart" />
              처음부터
            </button>
            <div className="segmented" role="group" aria-label="재생 속도">
              {SPEEDS.map((s) => (
                <button key={s} type="button" aria-pressed={playback.speed === s} onClick={() => playback.setSpeed(s)}>
                  {s}×
                </button>
              ))}
            </div>
            <input type="range" min={0} max={domain} step={domain / 500} value={playback.t} onChange={(e) => playback.seek(Number(e.target.value))} aria-label="재생 위치" />
            <span className="transport-time">
              {playback.t.toFixed(1)} / {domain.toFixed(1)}ms
            </span>
          </div>
          <div className="trace-legend">
            <TimelineLegend
              segmentStyles={segmentStyles}
              outcomeStyles={OUTCOMES}
              markers={[
                { kind: 'commit', label: '첫 커밋 순간' },
                { kind: 'window', label: '경쟁 구간: 이 안에서 SELECT하면 행이 안 보임' },
              ]}
            />
          </div>
          <div className="trace-body" data-detail={selectedAttempt ? '' : undefined}>
            <div>
              {STRATEGIES.map(({ key, title }) => {
                const trace = run[key];
                const rowsSoFar = trace.attempts.filter(
                  (a) => (a.outcome === 'inserted' || a.outcome === 'duplicate') && a.endAt <= playback.t,
                ).length;
                return (
                  <section className="trace-section" key={key}>
                    <div className="trace-head">
                      <h3>{title}</h3>
                      <span className="trace-live" data-bad={rowsSoFar > 1 || undefined}>
                        지금까지 들어간 행 <strong>{rowsSoFar}</strong>
                      </span>
                    </div>
                    <Timeline
                      lanes={toLanes(trace)}
                      domain={domain}
                      t={playback.t}
                      segmentStyles={segmentStyles}
                      outcomeStyles={OUTCOMES}
                      window={trace.firstCommitAt !== null ? { at: trace.firstCommitAt, label: `첫 커밋 ${ms(trace.firstCommitAt)}` } : undefined}
                      ariaLabel={`${title} 요청 타임라인. 같은 값을 요청 목록 탭에서 표로 볼 수 있어요`}
                      selectedId={selected?.strategy === key ? String(selected.user) : null}
                      onSelect={(id) => setSelected({ strategy: key, user: Number(id) })}
                    />
                  </section>
                );
              })}
            </div>
            {selectedAttempt && selected && (
              <aside className="span-detail" aria-label="요청 상세">
                <header>
                  <div>
                    <h3>{userLabel(selectedAttempt.user)}</h3>
                    <p>{STRATEGIES.find((s) => s.key === selected.strategy)!.title}</p>
                  </div>
                  <button type="button" className="icon-button" onClick={() => setSelected(null)} aria-label="상세 닫기">
                    <Icon name="close" />
                  </button>
                </header>
                <OutcomeBadge outcome={selectedAttempt.outcome} />
                <p className="span-why">{explainAttempt(selectedAttempt, run[selected.strategy], mode)}</p>
                <KeyValue
                  columns={2}
                  items={[
                    { label: '커넥션 PID', value: selectedAttempt.pid ? String(selectedAttempt.pid) : '-' },
                    { label: '묶기', value: modeOf(run.options).label },
                    { label: 'SELECT 시작', value: ms(selectedAttempt.select[0]) },
                    { label: 'SELECT 끝', value: ms(selectedAttempt.select[1]) },
                    { label: 'SELECT가 본 결과', value: selectedAttempt.sawRow ? '있음' : '없음' },
                    { label: '첫 커밋', value: run[selected.strategy].firstCommitAt !== null ? ms(run[selected.strategy].firstCommitAt!) : '-' },
                    { label: 'INSERT 시작', value: selectedAttempt.insert ? ms(selectedAttempt.insert[0]) : '-' },
                    { label: 'INSERT 끝', value: selectedAttempt.insert ? ms(selectedAttempt.insert[1]) : '-' },
                    ...(mode === 'autocommit'
                      ? []
                      : [{ label: 'COMMIT 끝', value: selectedAttempt.commit ? ms(selectedAttempt.commit[1]) : '-' }]),
                    { label: '응답 시간', value: ms(selectedAttempt.endAt - selectedAttempt.select[0]) },
                  ]}
                />
              </aside>
            )}
          </div>
        </>
      ) : (
        <TraceTable run={run} />
      )}
    </Container>
  );
}

function OutcomeBadge({ outcome }: { outcome: AttemptOutcome }) {
  const style = OUTCOMES[outcome];
  return (
    <span className="outcome-cell">
      <svg width="16" height="16" aria-hidden="true">
        <OutcomeGlyph cx={8} cy={8} r={7} color={style.color} icon={style.icon} />
      </svg>
      {style.label}
    </span>
  );
}

function TraceTable({ run }: { run: Run }) {
  const [which, setWhich] = useState<StrategyKey>('checkOnly');
  const attempts = [...run[which].attempts].sort((a, b) => a.select[0] - b.select[0]);
  const tx = modeOf(run.options).id !== 'autocommit';
  return (
    <>
      <div className="trace-table-bar">
        <div className="segmented" role="group" aria-label="전략">
          {STRATEGIES.map((s) => (
            <button key={s.key} type="button" aria-pressed={which === s.key} onClick={() => setWhich(s.key)}>
              {s.title}
            </button>
          ))}
        </div>
        <span className="muted small">시각은 모두 실험 시작부터 잰 ms예요.</span>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>사용자</th>
              <th className="num">커넥션 PID</th>
              <th className="num">SELECT 시작</th>
              <th className="num">SELECT 끝</th>
              <th>본 결과</th>
              <th className="num">INSERT 시작</th>
              <th className="num">INSERT 끝</th>
              {tx && <th className="num">COMMIT 끝</th>}
              <th>결과</th>
              <th className="num">응답 시간</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.user}>
                <td className="mono">{userLabel(a.user)}</td>
                <td className="num">{a.pid ?? '-'}</td>
                <td className="num">{a.select[0].toFixed(2)}</td>
                <td className="num">{a.select[1].toFixed(2)}</td>
                <td>{a.sawRow ? '있음' : '없음'}</td>
                <td className="num">{a.insert ? a.insert[0].toFixed(2) : '-'}</td>
                <td className="num">{a.insert ? a.insert[1].toFixed(2) : '-'}</td>
                {tx && <td className="num">{a.commit ? a.commit[1].toFixed(2) : '-'}</td>}
                <td>
                  <OutcomeBadge outcome={a.outcome} />
                </td>
                <td className="num">{(a.endAt - a.select[0]).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Param({
  id,
  label,
  unit,
  min,
  max,
  step = 1,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  hint: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  return (
    <div className="param">
      <label htmlFor={id}>{label}</label>
      <span className="param-input">
        <input id={id} type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(clamp(Number(e.target.value)))} />
        {unit}
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <span className="param-hint">{hint}</span>
    </div>
  );
}

const SWEEP_SPREADS = [0, 50, 100, 200, 400];
const SWEEP_GAPS = [0, 10, 20, 50, 100];

function Sweep({ users, seed }: { users: number; seed: number }) {
  const [cells, setCells] = useState<Map<string, number[]>>(new Map());
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const total = SWEEP_SPREADS.length * SWEEP_GAPS.length;

  async function start() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setCells(new Map());
    setState('running');
    setError(null);
    try {
      await postEventStream(
        '/ticket/race/sweep',
        { users, seed, reps: 3 },
        (event, data) => {
          if (event === 'cell') {
            const cell = data as SweepCell;
            setCells((prev) => new Map(prev).set(`${cell.spreadMs}:${cell.gapMs}`, cell.duplicates));
          }
        },
        controller.signal,
      );
      setState('done');
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(describeError(err));
      setState('error');
    }
  }

  return (
    <Container
      title="민감도 스윕"
      info="sweep"
      description={`조건별 평균 중복 행 수 · 확인만 전략 · ${users}명 · 칸마다 3회`}
      actions={
        <Button icon="play" loading={state === 'running'} onClick={start}>
          {state === 'done' ? '다시 측정' : '스윕 실행'}
        </Button>
      }
    >
      {state === 'idle' && (
        <p className="muted">25칸 × 3회, 10~20초 걸려요.</p>
      )}
      {state !== 'idle' && (
        <div className="progress" role="status">
          <span className="progress-bar">
            <span style={{ transform: `scaleX(${cells.size / total})` }} />
          </span>
          {cells.size} / {total}칸
        </div>
      )}
      {error && (
        <Alert type="error" title="스윕을 끝내지 못했어요">
          {error}
        </Alert>
      )}
      {state !== 'idle' && (
        <Heatmap xs={SWEEP_SPREADS} ys={SWEEP_GAPS} xLabel="도착 시간 폭" yLabel="확인 → INSERT 간격" cells={cells} max={users - 1} unit="행" formatAxis={(v) => `${v}ms`} />
      )}
    </Container>
  );
}

function RawData({ run }: { run: Run }) {
  const json = useMemo(() => JSON.stringify(run, null, 2), [run]);
  const [open, setOpen] = useState(false);
  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `race-run-${run.id}-seed-${run.options.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Container
      title="원본 데이터"
      description={`실행 #${run.id}의 트레이스 전체`}
      actions={
        <>
          <Button onClick={() => setOpen((v) => !v)}>{open ? 'JSON 접기' : 'JSON 보기'}</Button>
          <Button icon="download" onClick={download}>
            JSON 내려받기
          </Button>
        </>
      }
    >
      {open ? <pre className="raw-json">{json}</pre> : <p className="muted small">요청 {run.checkOnly.attempts.length * 2}건</p>}
    </Container>
  );
}
