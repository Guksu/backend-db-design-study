import type { HelpTopic } from '../ui/Help';

/** 케이스와 상관없는 DB 개념 도움말. 각 페이지의 "정보" 링크가 연다 */
export const HELP_TOPICS: Record<string, HelpTopic> = {
  lab: {
    title: '이 실험실은 어떻게 동작하나요',
    body: (
      <>
        <p>
          모든 화면은 실제로 돌아가는 <strong>PostgreSQL 17</strong>에 연결돼 있어요. 그림이나
          미리 만든 수치가 아니라, 버튼을 누를 때마다 DB에 진짜 SQL을 보내고 그 응답을 그려요.
        </p>
        <ul>
          <li>
            <strong>설계 결정</strong>은 한 번에 질문 하나씩 묻고 답하는 문답(Q번호)으로 정하고,
            저장소의 <code>cases/01-ticket-booking/step01-erd.md</code>에 기록해요.
          </li>
          <li>
            <strong>스키마</strong> 화면의 ERD는 문서가 아니라 DB 카탈로그(<code>pg_catalog</code>)에서
            읽어요. 결정 근거는 <code>COMMENT ON</code>으로 DB 안에도 남겨 뒀어요.
          </li>
          <li>
            <strong>실험</strong>은 같은 코드가 자동 테스트로도 돌아요. 실험이 만든 데이터는 끝나면
            지우거나 되돌려요(ROLLBACK).
          </li>
          <li>
            실험은 한 번에 하나만 돌아요. 동시에 돌면 같은 좌석과 DB 커넥션을 두고 서로 간섭하기
            때문이에요.
          </li>
        </ul>
      </>
    ),
  },

  erd: {
    title: 'ERD 읽는 법',
    body: (
      <>
        <p>카드 하나가 테이블 하나예요. 컬럼 옆 표시는 이런 뜻이에요.</p>
        <dl className="help-terms">
          <dt>열쇠</dt>
          <dd>PK(기본 키). 행 하나를 가리키는 번호</dd>
          <dt>고리</dt>
          <dd>FK(외래 키). 다른 테이블의 행을 가리킴</dd>
          <dt>UQ</dt>
          <dd>UNIQUE 제약에 포함된 컬럼. 조합이 겹치면 DB가 거부</dd>
          <dt>NN</dt>
          <dd>NOT NULL. 값이 반드시 있어야 함</dd>
        </dl>
        <p>
          선의 양 끝은 <strong>까마귀발 표기</strong>예요. 부모 쪽 <code>||</code>는 "반드시
          하나", 자식 쪽 <code>o&lt;</code>는 "0개 이상"이에요. 예를 들어 공연장 하나에 좌석이 0개
          이상 있어요.
        </p>
        <p>
          <strong>실선</strong>은 DB에 실제로 만든 FK이고, <strong>점선</strong>은 문서에 적힌 설계
          예정 관계예요. 점선 끝의 카드는 아직 컬럼을 정하지 않은 테이블이에요.
        </p>
      </>
    ),
  },

  constraints: {
    title: '제약조건과 SQLSTATE',
    body: (
      <>
        <p>
          <strong>제약조건</strong>은 DB가 직접 지키는 규칙이에요. 애플리케이션을 거치지 않는
          INSERT(시드 스크립트, 배치 작업, 사람이 직접 실행한 SQL)에도 똑같이 적용돼요. 그래서
          애플리케이션 검증과 별개로 마지막 보증 역할을 해요(Q5).
        </p>
        <p>
          규칙을 어기면 그 문장 전체가 실패하고, 행은 하나도 들어가지 않아요. 이때 DB는{' '}
          <strong>SQLSTATE</strong>라는 다섯 글자 에러 코드를 돌려줘요. 앞 두 글자가 분류예요.
        </p>
        <dl className="help-terms">
          <dt>23</dt>
          <dd>무결성 제약 위반 (NOT NULL, FK, UNIQUE, CHECK)</dd>
          <dt>22</dt>
          <dd>데이터 예외 (길이 초과, 형식 오류)</dd>
          <dt>42</dt>
          <dd>문법 · 이름 · 권한 문제 (없는 테이블 등)</dd>
          <dt>428C9</dt>
          <dd>GENERATED ALWAYS 컬럼에 값을 직접 넣으려 함</dd>
        </dl>
        <p>
          애플리케이션은 에러 <em>메시지</em>가 아니라 <strong>코드와 제약 이름</strong>(예:{' '}
          <code>23505</code> + <code>seats_position_uq</code>)으로 분기해야 해요. 메시지 문장은 DB
          버전이나 언어 설정에 따라 바뀌기 때문이에요.
        </p>
      </>
    ),
  },

  race: {
    title: '경쟁 조건: 확인하고 나서 쓰기',
    body: (
      <>
        <p>
          "SELECT로 없는지 확인하고, 없으면 INSERT"는 두 단계예요. 두 단계 사이에는 반드시{' '}
          <strong>틈</strong>이 있어요. SELECT 응답이 돌아오고, 애플리케이션이 처리하고, INSERT가
          DB에 도착하기까지의 시간이에요.
        </p>
        <p>
          그 틈 안에 다른 요청이 같은 확인을 하면, 둘 다 "없음"을 보고 둘 다 INSERT해요. 요청이
          몰릴수록 틈 안에 들어오는 요청이 많아지고, 틈이 길수록 더 많이 겹쳐요. 이런 버그를{' '}
          <strong>경쟁 조건</strong>(race condition) 또는 TOCTOU(time-of-check to
          time-of-use)라고 불러요.
        </p>
        <p>
          같은 커넥션에서 보내거나 한 트랜잭션으로 묶어도 이 틈은 그대로예요. 중복은 한 요청 안이
          아니라 <strong>서로 다른 요청(다른 커넥션)끼리</strong> 부딪혀서 생기기 때문이에요. "한
          커넥션 안에서 묶기"를 바꿔 직접 확인할 수 있어요.
        </p>
        <p>
          <code>SELECT … FOR UPDATE</code>도 이 경우엔 소용없어요. 찾은 행만 잠그는데, 새로 넣으려는
          행은 아직 없으니까요. 행이 미리 있을 때(Q2의 회차별 좌석처럼 UPDATE하는 경우)에만 잠글 수
          있어요.
        </p>
        <p>
          새 행의 중복은 <strong>UNIQUE 제약</strong>처럼 DB가 쓰는 순간에 직접 검사하게 해야
          막혀요.
        </p>
      </>
    ),
  },

  visibility: {
    title: '커밋 전의 행은 보이지 않아요',
    body: (
      <>
        <p>
          PostgreSQL의 기본 격리 수준은 <strong>READ COMMITTED</strong>예요. 각 문장은 그 문장이
          시작된 순간까지 <strong>커밋된</strong> 데이터만 봐요.
        </p>
        <p>
          그래서 다른 요청의 INSERT가 아직 커밋되지 않았다면, 그 행은 내 SELECT에 보이지 않아요.
          타임라인의 빨간 점선(첫 커밋)보다 먼저 SELECT를 끝낸 요청이 모두 "없음"을 보는 이유예요.
        </p>
        <p>
          "자동 커밋"에서는 INSERT 막대가 끝나는 순간이 곧 커밋 순간이에요. "트랜잭션"과 "FOR
          UPDATE"에서는 INSERT 뒤의 짧은 COMMIT 막대가 끝나야 다른 커넥션에 보여요.
        </p>
        <p>
          트랜잭션으로 묶어도 READ COMMITTED에서는 SELECT 문장마다 그 순간의 커밋된 데이터를 새로 봐요.
          그래서 다른 커넥션이 아직 커밋하지 않았다면 "없음"을 보는 건 똑같아요.
        </p>
      </>
    ),
  },

  'unique-concurrency': {
    title: 'UNIQUE는 동시 INSERT를 어떻게 막나요',
    body: (
      <>
        <p>
          UNIQUE 제약은 <strong>유니크 인덱스</strong>로 구현돼요. INSERT할 때 DB는 인덱스에서 같은
          키를 찾아요.
        </p>
        <ul>
          <li>이미 커밋된 같은 키가 있으면 바로 <code>23505</code>로 거부해요.</li>
          <li>
            같은 키를 아직 커밋 안 한 다른 트랜잭션이 넣고 있으면, 그 트랜잭션이 끝날 때까지
            기다려요. 그쪽이 커밋하면 거부되고, 롤백하면 내 행이 들어가요.
          </li>
        </ul>
        <p>
          그래서 요청이 정확히 같은 순간에 와도 <strong>딱 하나만</strong> 남아요. 애플리케이션의 확인 단계는
          그래도 남겨 둬요(Q5). 대부분의 중복은 확인에서 친절한 안내와 함께 걸러지고, 틈을
          빠져나온 소수만 DB가 막아요.
        </p>
      </>
    ),
  },

  sweep: {
    title: '민감도 스윕',
    body: (
      <>
        <p>
          두 변수를 격자로 바꿔 가며 같은 실험을 여러 번 돌리는 방법이에요. 한 번의 실행으로는 우연인지
          경향인지 알 수 없지만, 격자 전체를 보면 결과가 <strong>무엇에 민감한지</strong> 보여요.
        </p>
        <p>
          여기서는 가로가 <strong>도착 시간 폭</strong>(요청이 얼마나 몰려 오나), 세로가{' '}
          <strong>확인 → INSERT 간격</strong>(틈이 얼마나 긴가)이에요. 칸의 숫자는 3번 돌린 평균
          중복 행 수이고, 진할수록 중복이 많아요.
        </p>
      </>
    ),
  },

  explain: {
    title: '실행 계획 읽는 법',
    body: (
      <>
        <p>
          <code>EXPLAIN ANALYZE</code>는 쿼리를 실제로 실행하고, DB가 고른 방법과 단계별 실제 시간 ·
          행 수를 보여 줘요. 안쪽(아래) 단계부터 실행돼 바깥으로 결과를 올려 보내요.
        </p>
        <dl className="help-terms">
          <dt>Seq Scan</dt>
          <dd>
            테이블 전체를 처음부터 끝까지 읽으며 조건에 맞는 행을 고름. "Rows Removed by Filter"는
            읽었지만 버린 행 수
          </dd>
          <dt>Index Scan</dt>
          <dd>인덱스로 위치를 찾아 그 행만 읽음</dd>
          <dt>Bitmap Index Scan</dt>
          <dd>인덱스로 맞는 행의 위치를 모아 둠(비트맵)</dd>
          <dt>Bitmap Heap Scan</dt>
          <dd>모아 둔 위치를 페이지 순서대로 한 번에 읽음. 맞는 행이 여럿일 때 자주 고름</dd>
          <dt>Gather</dt>
          <dd>여러 워커가 나눠 읽은 결과를 모음. 큰 테이블의 Seq Scan을 병렬로 돌릴 때 나타남</dd>
          <dt>버퍼</dt>
          <dd>hit = 메모리에서 읽은 페이지 수, read = 디스크에서 읽은 페이지 수 (페이지 하나 8KB)</dd>
        </dl>
      </>
    ),
  },

  'index-cost': {
    title: '인덱스의 비용',
    body: (
      <>
        <p>인덱스는 읽기를 빠르게 하는 대신 세 가지 비용이 있어요.</p>
        <ul>
          <li>
            <strong>저장 공간</strong>: 고정 비율이 아니에요. 항목마다 키 크기 + 행 위치(6바이트) +
            헤더가 들고, 같은 값이 많이 반복되면 PostgreSQL 13부터 들어간 B-tree 중복 제거로
            작아져요. 값이 모두 다른 PK 인덱스는 상대적으로 커요.
          </li>
          <li>
            <strong>쓰기</strong>: 행을 넣거나 인덱스 컬럼을 바꿀 때마다 인덱스도 같이 고쳐야 해서
            INSERT · UPDATE가 느려져요.
          </li>
          <li>
            <strong>메모리</strong>: 인덱스도 테이블처럼 디스크에 있고, 자주 쓰이면 공유 버퍼(메모리)에
            올라와 자리를 차지해요.
          </li>
        </ul>
        <p>
          그래서 기준은 "규모가 크냐"가 아니라 <strong>그 컬럼으로 얼마나 자주 찾느냐 대 얼마나 자주
          쓰느냐</strong>예요. FK 컬럼이라면 부모 삭제 · 수정도 "찾는 일"에 들어가요.
        </p>
      </>
    ),
  },

  'composite-index': {
    title: '복합 인덱스는 왼쪽 컬럼부터',
    body: (
      <>
        <p>
          <code>(성, 이름)</code> 순으로 정렬한 전화번호부를 떠올려 보세요. "김"씨는 바로 펼쳐 찾지만, 이름이 "민수"인
          사람은 처음부터 끝까지 넘겨야 해요.
        </p>
        <p>
          복합 B-tree 인덱스도 같아요. <strong>앞 컬럼으로 먼저 정렬</strong>하고, 앞 컬럼 값이 같을 때만 뒤 컬럼으로
          정렬해요. 그래서 인덱스를 쓸 수 있는 조건은 왼쪽부터 이어져야 해요.
        </p>
        <ul>
          <li>
            <code>(concert_id, starts_at)</code>: <code>concert_id = ?</code>, <code>concert_id = ? AND starts_at …</code>
            에 쓸 수 있어요. 결과도 이미 시각순이라 정렬을 건너뛸 수 있어요.
          </li>
          <li>
            <code>starts_at</code>만으로 찾을 때는 못 써요. 그 시각의 항목이 공연마다 흩어져 있어서예요.
          </li>
        </ul>
        <p>
          UNIQUE 제약도 이런 인덱스로 만들어져요. 그래서 FK 컬럼이 UNIQUE의 <strong>맨 앞</strong>에 있으면 FK
          인덱스를 따로 만들 필요가 없어요. 중복을 막는 효과는 컬럼 순서와 상관없이 같아요.
        </p>
        <p>
          PostgreSQL 18부터는 앞 컬럼을 건너뛰며 찾는 skip scan이 생겼어요. 하지만 앞 컬럼 값의 종류가 적을 때만
          효과가 있고, 시각처럼 종류가 많은 컬럼이 앞이면 도움이 거의 안 돼요. 이 실험실은 PostgreSQL 17이에요.
        </p>
      </>
    ),
  },

  'fk-check': {
    title: 'FK와 부모 삭제',
    body: (
      <>
        <p>
          공연장(부모)을 지우면, DB는 그 공연장을 가리키는 공연(자식)이 남아 있는지 확인해야 해요.
          남아 있으면 삭제를 거부해야 하니까요(참조 무결성).
        </p>
        <p>
          PostgreSQL은 이 확인을 내부 트리거로 자식 테이블에{' '}
          <code>WHERE venue_id = 지우려는 id</code> 조회를 보내서 해요. 자식의 <code>venue_id</code>에
          인덱스가 없으면 이 조회가 <strong>자식 테이블 전체를 읽는 Seq Scan</strong>이 돼요. 부모를
          하나 지울 때마다 자식 전체를 훑는 거예요.
        </p>
        <p>
          PostgreSQL은 FK 컬럼에 인덱스를 <strong>자동으로 만들지 않아요</strong>(MySQL InnoDB는
          자동으로 만들어요).
        </p>
      </>
    ),
  },

  'number-types': {
    title: '돈은 어떤 숫자 타입에',
    body: (
      <>
        <dl className="help-terms">
          <dt>INTEGER · BIGINT</dt>
          <dd>
            정수를 정확히 담아요. INTEGER는 4바이트로 약 21억까지, BIGINT는 8바이트로 훨씬 커요. 원화처럼 소수가 없는
            돈에 맞아요. INTEGER끼리 곱해 21억을 넘으면 <code>22003</code>으로 실패해요. SUM은 알아서 BIGINT로 돌려줘요.
          </dd>
          <dt>NUMERIC</dt>
          <dd>
            10진수를 정확히 담아요. 달러의 센트, 할인율, 수수료처럼 소수가 필요한 계산에 써요. 정수보다 크고 조금
            느려요.
          </dd>
          <dt>REAL · DOUBLE PRECISION</dt>
          <dd>
            2진수 실수예요. 0.1을 2진수로 정확히 못 나타내서, 더할수록 오차가 쌓여요. 과학 계산용이고 돈에는 쓰지
            않아요.
          </dd>
          <dt>MONEY</dt>
          <dd>
            정확하지만 서버의 통화 설정(<code>lc_monetary</code>)을 따라 기호와 소수 자리가 붙어요. 원화인데
            "$165,000.00"으로 나올 수 있어서, 보통 쓰지 않아요.
          </dd>
        </dl>
        <p>
          실무 규칙: 원화 단가는 INTEGER(또는 BIGINT), 합계는 BIGINT, 비율 계산은 NUMERIC으로 한 뒤 반올림 규칙을 정해
          정수로 되돌려요.
        </p>
      </>
    ),
  },

  timezone: {
    title: 'timestamp와 timestamptz',
    body: (
      <>
        <dl className="help-terms">
          <dt>timestamp</dt>
          <dd>
            날짜와 시각 글자만 저장해요. 어느 시간대의 19시인지 모르고, 입력에 붙은 <code>+09</code>도 조용히
            버려요.
          </dd>
          <dt>timestamptz</dt>
          <dd>
            입력을 UTC 기준의 한 순간으로 바꿔 저장하고, 읽을 때 세션 시간대로 바꿔 보여 줘요. 이름과 달리
            시간대 자체를 저장하지는 않아요.
          </dd>
        </dl>
        <p>
          공연 시작, 예매 오픈, 결제, 점유 만료처럼 <strong>실제로 일어나는 한 순간</strong>은 timestamptz로
          저장해요. <code>now()</code>와 비교할 때도 같은 순간끼리 비교돼요.
        </p>
        <p>
          timestamp는 "매일 오전 9시"처럼 장소와 상관없는 벽시계 시각에만 써요. node-postgres는 timestamp를
          Node 서버의 시간대로 해석해서, 서버를 옮기면 값이 바뀌어 보이는 버그가 생겨요.
        </p>
      </>
    ),
  },
};
