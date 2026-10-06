import { useRef, useState } from 'react';
import { describeError } from '@web/lib/api';
import { writeLastRun } from '@web/lib/lastRun';
import { BarCompare, type BarGroup } from '@web/sim/BarCompare';
import { postEventStream } from '@web/sim/eventStream';
import { PlanTree } from '@web/sim/PlanTree';
import '@web/sim/sim.css';
import { Alert, Button, Container, CopyButton, Explainer, PageHeader, StatusIndicator, type Status } from '@web/ui/Layout';
import type { SizeResult } from '../indexLab';
import { crumbs, RequireSchema } from './TicketCase';

const SIZES = [
  { rows: 10_000, label: '1만 행', note: '1초 안팎' },
  { rows: 100_000, label: '10만 행', note: '약 3초' },
  { rows: 1_000_000, label: '100만 행', note: '약 25초' },
];

const SERIES = [
  { key: 'noIndex', label: '인덱스 없음', color: 'var(--series-b)' },
  { key: 'index', label: '인덱스 있음', color: 'var(--series-a)' },
];

const sizeLabel = (rows: number) => SIZES.find((s) => s.rows === rows)?.label ?? `${rows.toLocaleString()}행`;
const msText = (v: number) => (v < 1 ? `${v.toFixed(3)}ms` : v < 100 ? `${v.toFixed(1)}ms` : `${Math.round(v).toLocaleString()}ms`);
const mbText = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 2 : 1)}MB`;
const times = (a: number, b: number) => `${(a / b).toFixed(a / b < 10 ? 1 : 0)}배`;

export function IndexPage() {
  const [selected, setSelected] = useState<Set<number>>(new Set([10_000, 100_000]));
  const [results, setResults] = useState<SizeResult[]>([]);
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [planRows, setPlanRows] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  const sizes = SIZES.map((s) => s.rows).filter((r) => selected.has(r));

  async function run() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setResults([]);
    setState('running');
    setError(null);
    const collected: SizeResult[] = [];
    try {
      await postEventStream(
        '/ticket/index-lab',
        { sizes },
        (event, data) => {
          if (event === 'size') {
            collected.push(data as SizeResult);
            setResults([...collected]);
            setPlanRows((data as SizeResult).rows);
          }
        },
        controller.signal,
      );
      setState('done');
      const largest = collected[collected.length - 1];
      if (largest) {
        writeLastRun('index', {
          rows: largest.rows,
          lookupSpeedup: largest.noIndex.select.ms / largest.index.select.ms,
          insertCost: (largest.index.insertMs / largest.noIndex.insertMs - 1) * 100,
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(describeError(err));
      setState('idle');
    }
  }

  const toggleSize = (rows: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rows)) next.delete(rows);
      else next.add(rows);
      return next;
    });

  const planResult = results.find((r) => r.rows === planRows) ?? results[results.length - 1];

  return (
    <div className="page">
      <PageHeader
        crumbs={crumbs('FK 인덱스 비교')}
        title="FK 인덱스 비교 (Q16)"
        info="index-cost"
        description="concerts.venue_id 인덱스가 있을 때와 없을 때를 같은 데이터로 비교해요."
        actions={
          <Button variant="primary" icon="play" loading={state === 'running'} onClick={run} disabled={sizes.length === 0}>
            실행
          </Button>
        }
      />
      <RequireSchema>
        <div className="page-stack">
          <Explainer
            question={'인덱스의 이득과 비용은? 가설: "20% 더 쓰니 대규모에선 빼자"'}
            method="인덱스 유무만 다른 테이블 2개 · 같은 데이터 · EXPLAIN ANALYZE"
            reading="주황 = 없음 · 파랑 = 있음 · 짧을수록 좋음"
            result={results.length > 0 && <IndexHeadline results={results} />}
            more={
              <>
                <p>
                  Q16의 결정을 위한 실험이에요. 구조가 같은 실험용 테이블 두 개(인덱스 없음 · 있음)에 같은
                  데이터를 넣고, 공연장 1,000곳 중 다섯 곳의 공연 목록을 <code>EXPLAIN ANALYZE</code>로
                  조회하고, 공연이 없는 공연장 하나를 지워 봐요. 실제 <code>concerts</code>는 건드리지 않아요.
                </p>
                <p>
                  실행 계획에서 <strong>Seq Scan</strong>은 테이블 전체를 읽은 것, <strong>Bitmap / Index
                  Scan</strong>은 인덱스로 찾아간 것이에요.
                </p>
                {results.length > 0 && <IndexInterpretation results={results} />}
              </>
            }
          />

          <Alert type="success" title="Q17 결정: 인덱스를 만들었어요">
            공연장별 조회가 잦고 쓰기는 드물어서요. <code>concerts_venue_id_idx</code>로 schema.sql에 반영됐어요.
          </Alert>

          <Container title="데이터 크기">
            <div className="size-picker" role="group" aria-label="데이터 크기">
              {SIZES.map((s) => (
                <label key={s.rows} className="size-option" data-checked={selected.has(s.rows) || undefined}>
                  <input type="checkbox" checked={selected.has(s.rows)} onChange={() => toggleSize(s.rows)} disabled={state === 'running'} />
                  <span>
                    <strong>{s.label}</strong>
                    <span className="muted">{s.note} · 공연장당 {(s.rows / 1000).toLocaleString()}개</span>
                  </span>
                </label>
              ))}
            </div>
            {state === 'running' && (
              <div className="progress" role="status" style={{ marginTop: 14 }}>
                <span className="progress-bar">
                  <span style={{ transform: `scaleX(${results.length / Math.max(1, sizes.length)})` }} />
                </span>
                {results.length} / {sizes.length}개 크기 측정
              </div>
            )}
          </Container>

          {error && (
            <Alert type="error" title="실험을 끝내지 못했어요">
              {error}
            </Alert>
          )}

          {results.length > 0 && (
            <>
              <Hypotheses results={results} />
              <Container title="측정 결과" description="차트마다 축이 따로예요" info="index-cost">
                <div className="bars-grid">
                  <BarCompare
                    title="공연장의 공연 목록 조회"
                    description="WHERE venue_id = ? · 5곳 중앙값"
                    series={SERIES}
                    groups={groups(results, (r, v) => r[v].select.ms)}
                    format={msText}
                    annotate={(g) => speedNote(g)}
                  />
                  <BarCompare
                    title="공연장 삭제 시 FK 검사"
                    description="지울 공연장을 가리키는 공연 찾기"
                    series={SERIES}
                    groups={groups(results, (r, v) => r[v].deleteParent.fkCheckMs)}
                    format={msText}
                    annotate={(g) => speedNote(g)}
                  />
                  <BarCompare
                    title="대량 INSERT"
                    description="모든 행을 한 번에 넣기"
                    series={SERIES}
                    groups={groups(results, (r, v) => r[v].insertMs)}
                    format={msText}
                    annotate={(g) => costNote(g)}
                  />
                  <BarCompare
                    title="저장 공간"
                    description="테이블 + 인덱스"
                    series={SERIES}
                    groups={groups(results, (r, v) => r[v].tableBytes + r[v].pkIndexBytes + (r[v].venueIndexBytes ?? 0))}
                    format={mbText}
                    annotate={(g) => {
                      const a = g.values.noIndex;
                      const b = g.values.index;
                      return a && b ? `인덱스 있으면 ${mbText(b - a)} 더 씀` : null;
                    }}
                  />
                </div>
              </Container>

              {planResult && (
                <Container
                  title="실행 계획"
                  info="explain"
                  description="아래 단계가 먼저 실행돼요"
                  actions={
                    <div className="segmented" role="group" aria-label="데이터 크기">
                      {results.map((r) => (
                        <button key={r.rows} type="button" aria-pressed={planResult.rows === r.rows} onClick={() => setPlanRows(r.rows)}>
                          {sizeLabel(r.rows)}
                        </button>
                      ))}
                    </div>
                  }
                >
                  <pre className="plan-sql">
                    {planResult.noIndex.select.sql.replace('lab_ix_concerts_noidx', 'concerts')};
                    <CopyButton text={`${planResult.noIndex.select.sql.replace('lab_ix_concerts_noidx', 'concerts')};`} />
                  </pre>
                  <div className="grid-2">
                    <section>
                      <h3 className="plan-side">인덱스 없음 · {msText(planResult.noIndex.select.ms)}</h3>
                      <PlanTree node={planResult.noIndex.select.plan} />
                    </section>
                    <section>
                      <h3 className="plan-side">인덱스 있음 · {msText(planResult.index.select.ms)}</h3>
                      <PlanTree node={planResult.index.select.plan} />
                    </section>
                  </div>
                </Container>
              )}
            </>
          )}

          {results.length === 0 && state === 'idle' && (
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

function groups(results: SizeResult[], pick: (r: SizeResult, variant: 'noIndex' | 'index') => number): BarGroup[] {
  return results.map((r) => ({
    label: sizeLabel(r.rows),
    values: { noIndex: pick(r, 'noIndex'), index: pick(r, 'index') },
  }));
}

function speedNote(g: BarGroup) {
  const a = g.values.noIndex;
  const b = g.values.index;
  if (!a || !b) return null;
  return a > b ? `인덱스가 ${times(a, b)} 빠름` : `인덱스가 ${times(b, a)} 느림`;
}

/** 이보다 작은 차이는 측정 오차로 본다 */
const NOISE_PCT = 8;

function costNote(g: BarGroup) {
  const a = g.values.noIndex;
  const b = g.values.index;
  if (!a || !b) return null;
  const pct = (b / a - 1) * 100;
  if (Math.abs(pct) < NOISE_PCT) return '차이 없음 (측정 오차 범위)';
  return pct > 0 ? `인덱스 있으면 ${pct.toFixed(0)}% 느림` : `인덱스 있으면 ${(-pct).toFixed(0)}% 빠름 (오차일 수 있음)`;
}

function IndexHeadline({ results }: { results: SizeResult[] }) {
  const largest = results[results.length - 1];
  const lookup = largest.noIndex.select.ms / largest.index.select.ms;
  const fk = largest.noIndex.deleteParent.fkCheckMs / largest.index.deleteParent.fkCheckMs;
  return (
    <StatusIndicator type="success">
      {sizeLabel(largest.rows)}: 조회 {lookup.toFixed(0)}배 · 삭제 {fk.toFixed(0)}배 빠름
    </StatusIndicator>
  );
}

function IndexInterpretation({ results }: { results: SizeResult[] }) {
  const largest = results[results.length - 1];
  const lookup = largest.noIndex.select.ms / largest.index.select.ms;
  const fk = largest.noIndex.deleteParent.fkCheckMs / largest.index.deleteParent.fkCheckMs;
  const insert = (largest.index.insertMs / largest.noIndex.insertMs - 1) * 100;
  const ratio = (largest.index.venueIndexBytes ?? 0) / largest.index.tableBytes;
  return (
    <>
      <p>
        {sizeLabel(largest.rows)}에서 인덱스가 있으면 조회가 <strong>{lookup.toFixed(0)}배</strong>, 공연장
        삭제 시 FK 검사가 <strong>{fk.toFixed(0)}배</strong> 빨라졌어요.
      </p>
      <p>
        대가는{' '}
        {Math.abs(insert) < NOISE_PCT
          ? '측정 오차 범위의 쓰기 차이'
          : insert > 0
            ? `대량 INSERT가 ${insert.toFixed(0)}% 느려지는 것`
            : '없었고(쓰기 차이는 오차로 보여요)'}
        와 인덱스 {mbText(largest.index.venueIndexBytes ?? 0)}(테이블의 {(ratio * 100).toFixed(0)}%)예요.
      </p>
      <p>공연은 하루에 몇 건 등록될 뿐이고 공연장별 목록은 자주 조회돼요. 아래 가설 검증과 함께 보고 Q16의 결정을 내려 주세요.</p>
    </>
  );
}

function Hypotheses({ results }: { results: SizeResult[] }) {
  const smallest = results[0];
  const largest = results[results.length - 1];
  const ratio = (largest.index.venueIndexBytes ?? 0) / largest.index.tableBytes;
  const pkRatio = largest.index.pkIndexBytes / largest.index.tableBytes;
  const speedup = (r: SizeResult) => r.noIndex.select.ms / r.index.select.ms;
  const growing = results.length > 1 && speedup(largest) > speedup(smallest);

  const rows: { claim: string; status: Status; verdict: string; evidence: string }[] = [
    {
      claim: '인덱스는 공간을 20% 더 쓴다',
      status: 'warning',
      verdict: '고정 비율 아님',
      evidence: `venue_id 인덱스 = 테이블의 ${(ratio * 100).toFixed(0)}% · PK 인덱스 = ${(pkRatio * 100).toFixed(0)}% (반복되는 값은 B-tree가 압축)`,
    },
    {
      claim: '공연장별 목록 조회가 빨라진다',
      status: 'success',
      verdict: '맞아요',
      evidence: results.map((r) => `${sizeLabel(r.rows)} ${msText(r.noIndex.select.ms)} → ${msText(r.index.select.ms)}`).join(' · '),
    },
    {
      claim: '대규모에서는 빼는 게 낫다',
      status: results.length > 1 ? (growing ? 'error' : 'warning') : 'pending',
      verdict: results.length > 1 ? (growing ? '반대로 나왔어요' : '판단 어려움') : '크기 2개 이상 필요',
      evidence:
        results.length > 1
          ? `인덱스 없으면 조회 ${msText(smallest.noIndex.select.ms)} → ${msText(largest.noIndex.select.ms)}, 삭제 검사 ${msText(smallest.noIndex.deleteParent.fkCheckMs)} → ${msText(largest.noIndex.deleteParent.fkCheckMs)}로 함께 커짐`
          : '',
    },
  ];

  return (
    <Container title="가설 검증" flush>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>생각</th>
              <th>측정 결과</th>
              <th>근거</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.claim}>
                <td className="claim">{r.claim}</td>
                <td className="nowrap">
                  <StatusIndicator type={r.status}>{r.verdict}</StatusIndicator>
                </td>
                <td className="muted">{r.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
