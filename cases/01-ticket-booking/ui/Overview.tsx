import { readLastRun } from '@web/lib/lastRun';
import { Icon } from '@web/ui/Icon';
import { Container, KeyValue, PageHeader, StatusIndicator } from '@web/ui/Layout';
import { DECISIONS } from './decisions';
import { crumbs, pageHref, ResetButton, useCase } from './TicketCase';

const PLANNED_TABLES = ['schedules', 'grades', 'schedule_seats', 'reservations', 'users'];

interface ExperimentRow {
  id: string;
  title: string;
  question: string;
  decisions: string;
  last: () => { status: 'success' | 'error' | 'warning' | 'stopped'; text: string };
}

const EXPERIMENTS: ExperimentRow[] = [
  {
    id: 'constraints',
    title: '제약조건 검증',
    question: '정한 규칙을 어기는 INSERT를 DB가 실제로 거부하나요?',
    decisions: 'Q4 · Q5 · Q9–Q15 · Q21 · Q24 · Q27–Q36 · Q40',
    last: () => {
      const r = readLastRun<{ passed: number; total: number }>('constraints');
      if (!r) return { status: 'stopped', text: '아직 실행 안 함' };
      return r.passed === r.total
        ? { status: 'success', text: `${r.total}개 모두 기대대로` }
        : { status: 'error', text: `${r.total}개 중 ${r.total - r.passed}개 어긋남` };
    },
  },
  {
    id: 'race',
    title: '동시 INSERT 경쟁',
    question: '"확인 후 INSERT"만으로 동시 요청의 중복을 막을 수 있나요?',
    decisions: 'Q5 · Q9 · Q20 · Q21',
    last: () => {
      const r = readLastRun<{ users: number; duplicates: number; uniqueRows: number }>('race');
      if (!r) return { status: 'stopped', text: '아직 실행 안 함' };
      return {
        status: r.duplicates > 0 ? 'warning' : 'success',
        text: `확인만: 중복 ${r.duplicates}행 · UNIQUE: ${r.uniqueRows}행`,
      };
    },
  },
  {
    id: 'index',
    title: 'FK 인덱스 비교',
    question: 'concerts.venue_id에 인덱스가 있으면 무엇이 빨라지고 무엇을 치르나요?',
    decisions: 'Q16 · Q17',
    last: () => {
      const r = readLastRun<{ rows: number; lookupSpeedup: number; insertCost: number }>('index');
      if (!r) return { status: 'stopped', text: '아직 실행 안 함' };
      return {
        status: 'success',
        text: `${r.rows.toLocaleString()}행: 조회 ${r.lookupSpeedup.toFixed(0)}배 · 쓰기 +${r.insertCost.toFixed(0)}%`,
      };
    },
  },
  {
    id: 'time',
    title: '시간 타입 비교',
    question: '공연 시각은 timestamp와 timestamptz 중 무엇으로 저장해야 하나요?',
    decisions: 'Q18 · Q19',
    last: () => {
      const r = readLastRun<{ sameInstant: boolean }>('time');
      if (!r) return { status: 'stopped', text: '아직 실행 안 함' };
      return { status: 'success', text: 'timestamptz만 어디서나 같은 순간' };
    },
  },
  {
    id: 'index-order',
    title: '복합 인덱스 순서',
    question: 'UNIQUE 컬럼 순서에 따라 어떤 조회와 FK 검사가 빨라지나요?',
    decisions: 'Q22',
    last: () => {
      const r = readLastRun<{ rows: number; fkRatio: number }>('index-order');
      if (!r) return { status: 'stopped', text: '아직 실행 안 함' };
      return {
        status: 'success',
        text: `${r.rows.toLocaleString()}행: 순서를 뒤집으면 FK 검사 ${r.fkRatio.toFixed(0)}배 느림`,
      };
    },
  },
  {
    id: 'number',
    title: '숫자 타입 비교',
    question: '원화 가격은 INTEGER · NUMERIC · REAL · MONEY 중 무엇에 담아야 하나요?',
    decisions: 'Q40',
    last: () => {
      const r = readLastRun<{ realWrong: number }>('number');
      if (!r) return { status: 'stopped', text: '아직 실행 안 함' };
      return { status: 'success', text: `REAL은 ${r.realWrong}개 계산에서 틀림` };
    },
  },
];

export function Overview() {
  const { tables } = useCase();
  const built = tables?.map((t) => t.name) ?? [];

  return (
    <div className="page">
      <PageHeader
        crumbs={crumbs('개요')}
        title="Step 1 · ERD"
        info="lab"
        description="수만 명이 1,000석을 두고 경쟁하는 예매 서비스. 테이블을 한 결정씩 정하고 실제 DB로 검증해요."
        actions={
          <a className="btn btn-primary" href={pageHref('constraints')}>
            <Icon name="flask" />
            실험 시작하기
          </a>
        }
      />

      <div className="page-stack">
        <Container title="이 단계 요약" actions={<ResetButton />}>
          <KeyValue
            items={[
              {
                label: '만든 테이블',
                value: built.length ? `${built.length}개` : '-',
                hint: built.join(', ') || '아직 없음',
              },
              {
                label: '설계 예정',
                value: `${PLANNED_TABLES.filter((t) => !built.includes(t)).length}개`,
                hint: PLANNED_TABLES.filter((t) => !built.includes(t)).join(', '),
              },
              { label: '문답', value: 'Q1 – Q40' },
              { label: '실험', value: `${EXPERIMENTS.length}개`, hint: '실제 PostgreSQL에서 실행' },
            ]}
          />
        </Container>

        <Container title="처음 오셨다면">
          <ol className="guide">
            <li>
              <strong>결정 기록 읽기</strong>
              <p>Q번호별 결정과 이유</p>
            </li>
            <li>
              <strong>검증 실험 열기</strong>
              <p>표의 "검증" 링크</p>
            </li>
            <li>
              <strong>실행하고 결과 보기</strong>
              <p>낯선 개념은 "정보"</p>
            </li>
          </ol>
        </Container>

        <Container
          title={
            <>
              결정 기록 <span className="count">({DECISIONS.length})</span>
            </>
          }
          description="전체 문답은 cases/01-ticket-booking/step01-erd.md"
          flush
        >
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>문답</th>
                  <th>주제</th>
                  <th>결정</th>
                  <th>이유</th>
                  <th>검증</th>
                </tr>
              </thead>
              <tbody>
                {DECISIONS.map((d) => (
                  <tr key={d.q}>
                    <td className="q">{d.q}</td>
                    <td className="nowrap">{d.topic}</td>
                    <td>
                      {d.open ? <StatusIndicator type="pending">{d.decision}</StatusIndicator> : d.decision}
                    </td>
                    <td className="muted">{d.why}</td>
                    <td className="nowrap">
                      {d.verify ? <a href={pageHref(d.verify.page)}>{d.verify.label}</a> : <span className="muted">뒤 단계에서</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>

        <Container title="실험" description="최근 결과는 이 브라우저 기준" flush>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>실험</th>
                  <th>확인하는 질문</th>
                  <th>관련 문답</th>
                  <th>최근 결과</th>
                </tr>
              </thead>
              <tbody>
                {EXPERIMENTS.map((e) => {
                  const last = e.last();
                  return (
                    <tr key={e.id}>
                      <td className="nowrap">
                        <a href={pageHref(e.id)}>{e.title}</a>
                      </td>
                      <td>{e.question}</td>
                      <td className="q">{e.decisions}</td>
                      <td>
                        <StatusIndicator type={last.status}>{last.text}</StatusIndicator>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Container>
      </div>
    </div>
  );
}
