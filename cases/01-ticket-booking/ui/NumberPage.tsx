import { useState } from 'react';
import { describeError, post } from '@web/lib/api';
import { writeLastRun } from '@web/lib/lastRun';
import { Alert, Button, Container, Explainer, PageHeader, StatusIndicator } from '@web/ui/Layout';
import { NUMBER_TYPES, type NumberCell, type NumberRow, type NumberType } from '../numberLab';
import { crumbs, RequireSchema } from './TicketCase';

const TYPE_LABEL: Record<NumberType, string> = {
  integer: 'INTEGER',
  bigint: 'BIGINT',
  numeric: 'NUMERIC',
  real: 'REAL',
  'double precision': 'DOUBLE',
  money: 'MONEY',
};

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('ko-KR')}원`;

/** 판정이 있는 줄에서 이 타입이 몇 번 정확했나 */
function score(rows: NumberRow[], type: NumberType) {
  const judged = rows.filter((r) => !r.informational);
  const cells = judged.map((r) => r.cells.find((c) => c.type === type)!).filter((c) => !c.skipped);
  return { ok: cells.filter((c) => c.ok).length, total: cells.length };
}

export function NumberPage() {
  const [rows, setRows] = useState<NumberRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const result = await post<NumberRow[]>('/ticket/number-lab');
      setRows(result);
      const real = score(result, 'real');
      writeLastRun('number', { realWrong: real.total - real.ok });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRunning(false);
    }
  }

  const sum = rows?.find((r) => r.id === 'sum')?.cells.find((c) => c.type === 'real');
  const realSum = Number(sum?.actual ?? NaN);

  return (
    <div className="page">
      <PageHeader
        crumbs={crumbs('숫자 타입 비교')}
        title="숫자 타입 비교 (Q40)"
        info="number-types"
        description="가격을 담을 수 있는 숫자 타입마다 같은 계산을 시켜 봐요."
        actions={
          <Button variant="primary" icon="play" loading={running} onClick={run}>
            {rows ? '다시 실행' : '실행'}
          </Button>
        }
      />
      <RequireSchema>
        <div className="page-stack">
          <Explainer
            question="원화 가격은 어떤 숫자 타입에 담아야 할까?"
            method="여섯 타입에 같은 값 · 같은 계산 → 정답과 비교"
            reading="한 칸 = 그 타입이 돌려준 값 · 초록 = 정답과 정확히 같음"
            result={
              rows && (
                <>
                  REAL은 99,900원 1,000장을 더하면{' '}
                  <strong className="result-bad">
                    {Number.isFinite(realSum) ? `${won(realSum)}(${signed(realSum - 99_900_000)})` : '-'}
                  </strong>
                  이 돼요. 정수 타입과 NUMERIC은 모두 <strong className="result-good">정확</strong>해요.
                </>
              )
            }
            more={
              <>
                <p>
                  테이블을 만들지 않고 SQL로 값만 계산해요. 정답과 같은지는 DB 안에서 비교해요. 실수 타입은 실수끼리
                  비교해야 0.9999999999999999가 1로 반올림돼 보이는 일이 없어요.
                </p>
                <p>
                  <strong>REAL · DOUBLE</strong>은 2진수 실수라 0.1이나 99,900을 더하는 과정에서 조금씩 오차가 쌓여요.
                  <strong> MONEY</strong>는 정확하지만 서버의 통화 설정(<code>lc_monetary</code>)에 따라 기호와 소수 자리가
                  붙어요. <strong>INTEGER</strong>는 약 21억까지만 담아서, 단가는 괜찮지만 큰 곱셈은 넘칠 수 있어요.
                </p>
              </>
            }
          />

          <Alert type="success" title="Q40 결정: price INTEGER NOT NULL, 0 이상">
            원화 단가는 정수로 정확히 담기고, 티켓 한 장 값이 21억을 넘을 일은 없어요. 합계는 SUM이 BIGINT로 돌려줘요.
          </Alert>

          {error && (
            <Alert type="error" title="실행하지 못했어요">
              {error}
            </Alert>
          )}

          <Container title="타입별 결과" description="같은 계산, 다른 타입" flush>
            {rows ? (
              <div className="table-scroll">
                <table className="table number-table">
                  <thead>
                    <tr>
                      <th>계산</th>
                      <th>정답</th>
                      {NUMBER_TYPES.map((t) => (
                        <th key={t} className="mono">
                          {TYPE_LABEL[t]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.label}</td>
                        <td className="mono nowrap">{row.expected}</td>
                        {row.cells.map((cell) => (
                          <td key={cell.type}>
                            <CellView cell={cell} informational={row.informational} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>정확한 계산</td>
                      {NUMBER_TYPES.map((t) => {
                        const s = score(rows, t);
                        return (
                          <td key={t} className="nowrap">
                            <StatusIndicator type={s.ok === s.total ? 'success' : 'error'}>
                              {s.ok}/{s.total}
                            </StatusIndicator>
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="empty">
                <strong>실행하면 여섯 타입의 결과가 나와요</strong>
              </div>
            )}
          </Container>
        </div>
      </RequireSchema>
    </div>
  );
}

function CellView({ cell, informational }: { cell: NumberCell; informational: boolean }) {
  if (cell.skipped) return <span className="muted">소수 없음</span>;
  if (cell.code) {
    return (
      <span className="number-cell">
        <StatusIndicator type="error">넘침</StatusIndicator>
        <code className="sqlstate" title={cell.error}>
          {cell.code}
        </code>
      </span>
    );
  }
  return (
    <span className="number-cell">
      <span className="mono nowrap">{cell.shown}</span>
      {cell.actual && cell.actual !== cell.shown && (
        <span className="muted small nowrap">실제 {Number(cell.actual).toLocaleString('ko-KR')}</span>
      )}
      {!informational && <StatusIndicator type={cell.ok ? 'success' : 'error'}>{cell.ok ? '정확' : '틀림'}</StatusIndicator>}
    </span>
  );
}
