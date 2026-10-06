import { useEffect, useState } from 'react';
import { api, describeError, post } from '@web/lib/api';
import { writeLastRun } from '@web/lib/lastRun';
import { Alert, Button, Container, Explainer, PageHeader, StatusIndicator } from '@web/ui/Layout';
import type { TablePreview } from '../../../lab/introspect';
import type { TimeLabResult } from '../timeLab';
import { crumbs, RequireSchema } from './TicketCase';

const allSame = (values: string[]) => new Set(values).size === 1;

export function TimePage() {
  const [result, setResult] = useState<TimeLabResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const r = await post<TimeLabResult>('/ticket/time-lab');
      setResult(r);
      writeLastRun('time', { sameInstant: allSame(r.rows.map((row) => row.timestamptzInstant)) });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRunning(false);
    }
  }

  const tzSame = result ? allSame(result.rows.map((r) => r.timestamptzInstant)) : null;
  const tsSame = result ? allSame(result.rows.map((r) => r.timestampInstant)) : null;

  return (
    <div className="page">
      <PageHeader
        crumbs={crumbs('시간 타입 비교')}
        title="시간 타입 비교 (Q18)"
        info="timezone"
        description="같은 시각을 두 타입에 저장하고, 시간대가 다른 세션에서 읽어 봐요."
        actions={
          <Button variant="primary" icon="play" loading={running} onClick={run}>
            {result ? '다시 실행' : '실행'}
          </Button>
        }
      />
      <RequireSchema>
        <div className="page-stack">
          <Explainer
            question="공연 시각은 어느 타입으로 저장해야 할까?"
            method="서울 세션에서 한 번 저장 → 서울 · UTC · 뉴욕 세션에서 읽기"
            reading={'"가리키는 순간"이 세 줄 모두 같아야 안전'}
            result={
              result && (
                <>
                  timestamptz는 어디서 읽어도 <strong className="result-good">같은 순간</strong>, timestamp는
                  세션마다 <strong className="result-bad">다른 순간</strong>이에요.
                </>
              )
            }
            more={
              <>
                <p>
                  입력은 <code>{result?.input ?? "'2026-12-24 19:00:00+09'"}</code> 하나예요. 서울 시간대 세션에서
                  두 컬럼에 똑같이 넣은 뒤, 세션의 시간대를 바꿔 가며 읽어요. 임시 테이블이라 끝나면 사라져요.
                </p>
                <p>
                  <strong>timestamptz</strong>는 입력을 UTC 기준의 한 순간(10:00 UTC)으로 바꿔 저장해요. 보여 줄 때만
                  세션 시간대로 바꿔요. 이름과 달리 시간대 자체를 저장하지는 않아요.
                </p>
                <p>
                  <strong>timestamp</strong>는 글자 "19:00"만 저장하고 <code>+09</code>는 조용히 버려요. 그래서 그 값이
                  어느 순간인지는 읽는 쪽의 시간대에 따라 달라져요. 서버 시간대가 바뀌면 같은 데이터가 다른 시각이
                  돼요.
                </p>
              </>
            }
          />

          <Alert type="success" title="Q19 결정: starts_at은 timestamptz">
            실제로 일어나는 한 순간이고, 프론트엔드와 시간을 주고받을 때도 같은 순간을 가리켜야 해서요.
          </Alert>

          {error && (
            <Alert type="error" title="실행하지 못했어요">
              {error}
            </Alert>
          )}

          <Container
            title="세션별로 읽은 값"
            description={result ? `서울 세션에서 '${result.input}'을 두 컬럼에 저장` : undefined}
            flush
          >
            {result ? (
              <div className="table-scroll">
                <table className="table time-table">
                  <thead>
                    <tr>
                      <th rowSpan={2}>읽은 세션의 시간대</th>
                      <th colSpan={2}>timestamptz</th>
                      <th colSpan={2}>timestamp</th>
                    </tr>
                    <tr>
                      <th>보이는 값</th>
                      <th>가리키는 순간</th>
                      <th>보이는 값</th>
                      <th>가리키는 순간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr key={r.zone}>
                        <td className="mono">{r.zone}</td>
                        <td className="mono">{r.timestamptz}</td>
                        <td className="mono">{r.timestamptzInstant}</td>
                        <td className="mono">{r.timestamp}</td>
                        <td className="mono">{r.timestampInstant}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>판정</td>
                      <td colSpan={2}>
                        <StatusIndicator type={tzSame ? 'success' : 'error'}>
                          {tzSame ? '모든 세션에서 같은 순간' : '세션마다 다른 순간'}
                        </StatusIndicator>
                      </td>
                      <td colSpan={2}>
                        <StatusIndicator type={tsSame ? 'success' : 'error'}>
                          {tsSame ? '모든 세션에서 같은 순간' : '세션마다 다른 순간'}
                        </StatusIndicator>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="empty">
                <strong>실행하면 세 시간대에서 읽은 값이 나와요</strong>
              </div>
            )}
          </Container>

          <ClientDisplay />
        </div>
      </RequireSchema>
    </div>
  );
}

const FORMAT: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

/** 실제 API 응답(첫 회차의 starts_at)을 브라우저에서 여러 방법으로 보여 준다 */
function ClientDisplay() {
  const [iso, setIso] = useState<string | null>(null);

  useEffect(() => {
    api<TablePreview>('/ticket/tables/schedules/preview')
      .then((p) => setIso(String(p.sample[0]?.starts_at ?? '')))
      .catch(() => setIso(null));
  }, []);

  if (!iso) return null;
  const date = new Date(iso);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rows: { how: string; code: string; value: string; status: 'success' | 'error' | 'warning'; verdict: string }[] = [
    {
      how: '문자열을 그대로 자르기',
      code: 'iso.slice(11, 16)',
      value: iso.slice(11, 16),
      status: 'error',
      verdict: 'UTC 시각을 서울 시각처럼 보여 줌',
    },
    {
      how: '브라우저 시간대로',
      code: "date.toLocaleString('ko-KR')",
      value: date.toLocaleString('ko-KR', FORMAT),
      status: 'warning',
      verdict: `보는 사람 위치에 따라 달라짐 (지금 ${browserZone})`,
    },
    {
      how: '공연장 시간대를 지정',
      code: "date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })",
      value: date.toLocaleString('ko-KR', { ...FORMAT, timeZone: 'Asia/Seoul' }),
      status: 'success',
      verdict: '어디서 봐도 서울 기준',
    },
    {
      how: '뉴욕 브라우저였다면',
      code: "{ timeZone: 'America/New_York' }",
      value: date.toLocaleString('ko-KR', { ...FORMAT, timeZone: 'America/New_York' }),
      status: 'warning',
      verdict: '해외 팬에게는 현지 시각으로 보임',
    },
  ];

  return (
    <Container
      title="프론트엔드에서 보여 주기"
      info="timezone"
      description={`실제 API 응답: ${iso}`}
      flush
    >
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>방법</th>
              <th>코드</th>
              <th>화면에 보이는 값</th>
              <th>판정</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.how}>
                <td className="nowrap">{r.how}</td>
                <td className="mono">{r.code}</td>
                <td className="mono nowrap">{r.value}</td>
                <td>
                  <StatusIndicator type={r.status}>{r.verdict}</StatusIndicator>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
