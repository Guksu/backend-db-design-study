import { Fragment, useEffect, useState } from 'react';
import { api, describeError, post } from '@web/lib/api';
import { writeLastRun } from '@web/lib/lastRun';
import { Alert, Button, Container, CopyButton, Explainer, PageHeader, StatusIndicator } from '@web/ui/Layout';
import { Icon } from '@web/ui/Icon';
import type { ConstraintCheck, ConstraintCheckResult } from '../ticket';
import { crumbs, RequireSchema, useCase } from './TicketCase';

/** 결과뿐 아니라 거부한 이유(SQLSTATE)까지 기대와 같아야 맞다고 본다. 다른 규칙에 걸려 거부된 경우를 걸러 낸다 */
const matches = (check: ConstraintCheck, result: ConstraintCheckResult | undefined) =>
  Boolean(result && result.outcome === check.expect && (!check.code || result.code === check.code));

const SQLSTATES = [
  {
    code: '23505',
    name: 'unique_violation',
    meaning: 'UNIQUE 제약에 같은 값이 이미 있음',
    here: '같은 좌석을 다시 넣기 (Q9)',
    message: '"이미 등록된 좌석이에요"',
  },
  {
    code: '23502',
    name: 'not_null_violation',
    meaning: 'NOT NULL 컬럼에 값이 없음',
    here: '열 번호 없이 넣기 (Q4)',
    message: '"열 번호를 입력해 주세요"',
  },
  {
    code: '23503',
    name: 'foreign_key_violation',
    meaning: 'FK가 가리키는 행이 없음',
    here: '없는 공연장의 좌석 · 공연 (Q4, Q14)',
    message: '"선택한 공연장을 찾을 수 없어요"',
  },
  {
    code: '23514',
    name: 'check_violation',
    meaning: 'CHECK 조건을 어김',
    here: '빈 구역 이름 · 공연장 이름 · 공연 제목 (Q11, Q12, Q15)',
    message: '"이름을 입력해 주세요"',
  },
  {
    code: '22001',
    name: 'string_data_right_truncation',
    meaning: 'VARCHAR 길이 제한을 넘음 (잘리지 않고 거부)',
    here: '11글자 구역 이름 (Q11)',
    message: '"구역 이름은 10자까지예요"',
  },
  {
    code: '428C9',
    name: 'generated_always',
    meaning: 'GENERATED ALWAYS 컬럼에 값을 직접 넣음',
    here: 'id 직접 지정 (Q10)',
    message: '사용자 입력이 아니라 코드 버그. 안내 대신 서버 로그로',
  },
];

const OUTCOME = { rejected: '거부', accepted: '들어감' } as const;

export function ConstraintsPage() {
  const { version } = useCase();
  const [checks, setChecks] = useState<ConstraintCheck[]>([]);
  const [results, setResults] = useState<Map<string, ConstraintCheckResult> | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    api<ConstraintCheck[]>('/ticket/constraint-checks')
      .then(setChecks)
      .catch((err) => setError(describeError(err)));
  }, [version]);

  async function runAll() {
    setRunning(true);
    setError(null);
    try {
      const rows = await post<ConstraintCheckResult[]>('/ticket/constraint-checks/run');
      const map = new Map(rows.map((r) => [r.id, r]));
      setResults(map);
      setExpanded(new Set());
      writeLastRun('constraints', {
        passed: checks.filter((c) => matches(c, map.get(c.id))).length,
        total: checks.length,
      });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRunning(false);
    }
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="page">
      <PageHeader
        crumbs={crumbs('제약조건 검증')}
        title="제약조건 검증"
        info="constraints"
        description="규칙을 일부러 어기는 INSERT를 보내 DB가 거부하는지 확인해요."
        actions={
          <Button variant="primary" icon="play" loading={running} onClick={runAll} disabled={!checks.length}>
            {results ? '다시 실행' : '모두 실행'}
          </Button>
        }
      />
      <RequireSchema>
        <div className="page-stack">
          <Explainer
            question="애플리케이션을 거치지 않아도 규칙이 지켜질까?"
            method="규칙마다 어기는 INSERT를 한 번씩 → 바로 ROLLBACK"
            reading="판정 = 결과와 코드(SQLSTATE)가 기대와 같은지"
            result={results && <ResultHeadline checks={checks} results={results} />}
            more={
              <>
                <p>
                  Q5에서 "애플리케이션 검증과 DB 제약을 둘 다 둔다"고 정했어요. 시드 · 배치 · 직접 실행한 SQL처럼
                  애플리케이션을 거치지 않는 INSERT에도 규칙이 지켜지는지 확인하는 실험이에요.
                </p>
                <p>
                  각 시도는 트랜잭션 안에서 실행하고 결과와 상관없이 되돌려서 데이터는 바뀌지 않아요. 일부러
                  막지 않기로 한 규칙(Q13, Q15)은 "들어감"이 기대값이에요.
                </p>
                <p>
                  거부할 때 DB는 SQLSTATE라는 다섯 글자 코드를 돌려줘요. 아래 표에서 코드의 뜻과 사용자 안내
                  예시를 볼 수 있어요.
                </p>
                {results && <Interpretation checks={checks} results={results} />}
              </>
            }
          />

          {error && (
            <Alert type="error" title="실행하지 못했어요">
              {error}
            </Alert>
          )}

          <Container
            title="검증 결과"
            description="행을 누르면 보낸 SQL과 DB 메시지가 보여요"
            flush
          >
            <div className="table-scroll">
              <table className="table checks-table">
                <thead>
                  <tr>
                    <th>문답</th>
                    <th>규칙</th>
                    <th>시도</th>
                    <th>기대</th>
                    <th>DB 응답</th>
                    <th>판정</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((check) => {
                    const result = results?.get(check.id);
                    const open = expanded.has(check.id);
                    return (
                      <Fragment key={check.id}>
                        <tr className="expandable" onClick={() => toggle(check.id)}>
                          <td className="q">{check.decision}</td>
                          <td className="mono rule">{check.rule}</td>
                          <td>
                            <button
                              type="button"
                              className="row-toggle"
                              aria-expanded={open}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(check.id);
                              }}
                            >
                              <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
                              {check.label}
                            </button>
                          </td>
                          <td className="nowrap">
                            {OUTCOME[check.expect]}
                            {check.code && <code className="sqlstate">{check.code}</code>}
                          </td>
                          <td className="nowrap">
                            {result ? (
                              <>
                                {OUTCOME[result.outcome]}
                                {result.code && <code className="sqlstate">{result.code}</code>}
                              </>
                            ) : (
                              <span className="muted">-</span>
                            )}
                          </td>
                          <td className="nowrap">
                            {result ? (
                              matches(check, result) ? (
                                <StatusIndicator type="success">기대대로</StatusIndicator>
                              ) : (
                                <StatusIndicator type="error">기대와 다름</StatusIndicator>
                              )
                            ) : (
                              <StatusIndicator type="stopped">실행 전</StatusIndicator>
                            )}
                          </td>
                        </tr>
                        {open && (
                          <tr className="detail-row">
                            <td />
                            <td colSpan={5}>
                              <div className="detail-grid">
                                <div>
                                  <h4>
                                    보낸 SQL <CopyButton text={check.sql} />
                                  </h4>
                                  <pre>{check.sql}</pre>
                                </div>
                                <div>
                                  <h4>DB 메시지</h4>
                                  <pre>
                                    {result
                                      ? result.message ?? '에러 없이 들어갔어요 (실행 후 ROLLBACK)'
                                      : '실행하면 여기에 나와요'}
                                  </pre>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Container>

          <Container
            title="SQLSTATE 코드"
            info="constraints"
            description="애플리케이션은 메시지가 아니라 이 코드로 사용자 안내를 만들어요"
            flush
          >
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>코드</th>
                    <th>이름</th>
                    <th>뜻</th>
                    <th>이 실험에서</th>
                    <th>사용자 안내 예시</th>
                  </tr>
                </thead>
                <tbody>
                  {SQLSTATES.map((s) => (
                    <tr key={s.code}>
                      <td className="mono q">{s.code}</td>
                      <td className="mono muted">{s.name}</td>
                      <td>{s.meaning}</td>
                      <td>{s.here}</td>
                      <td className="muted">{s.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Container>
        </div>
      </RequireSchema>
    </div>
  );
}

function ResultHeadline({
  checks,
  results,
}: {
  checks: ConstraintCheck[];
  results: Map<string, ConstraintCheckResult>;
}) {
  const matched = checks.filter((c) => matches(c, results.get(c.id))).length;
  const rejected = checks.filter((c) => results.get(c.id)?.outcome === 'rejected').length;
  return (
    <StatusIndicator type={matched === checks.length ? 'success' : 'error'}>
      {matched}/{checks.length} 기대대로 · 거부 {rejected} · 허용 {checks.length - rejected}
    </StatusIndicator>
  );
}

function Interpretation({
  checks,
  results,
}: {
  checks: ConstraintCheck[];
  results: Map<string, ConstraintCheckResult>;
}) {
  const matched = checks.filter((c) => matches(c, results.get(c.id)));
  const rejected = checks.filter((c) => results.get(c.id)?.outcome === 'rejected');
  const accepted = checks.filter((c) => results.get(c.id)?.outcome === 'accepted');
  const codes = [...new Set(rejected.map((c) => results.get(c.id)?.code).filter(Boolean))];
  const mismatched = checks.filter((c) => !matches(c, results.get(c.id)));

  return (
    <>
      <p>
        <strong>
          {checks.length}개 중 {matched.length}개가 기대대로
        </strong>{' '}
        동작했어요. 거부 {rejected.length}건은 {codes.join(', ')} 코드로 막혔고, 일부러 허용한{' '}
        {accepted.length}건은 그대로 들어갔어요.
      </p>
      {mismatched.length === 0 ? (
        <p>애플리케이션이 검증을 빠뜨려도 DB가 마지막에 막는다는 뜻이에요.</p>
      ) : (
        <p>
          기대와 다른 규칙: {mismatched.map((c) => `${c.decision} ${c.rule}`).join(', ')}. schema.sql을
          확인하세요.
        </p>
      )}
    </>
  );
}
