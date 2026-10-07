/**
 * step01-erd.md 문답의 요약 색인. 개요 화면의 "결정 기록" 표가 쓴다.
 * 문답이 늘어나면 문서와 함께 여기도 갱신한다.
 */
export interface Decision {
  q: string;
  topic: string;
  decision: string;
  why: string;
  /** 이 결정을 확인할 수 있는 화면 */
  verify?: { page: string; label: string };
  /** 아직 정하지 않은 결정 */
  open?: boolean;
}

export const DECISIONS: Decision[] = [
  {
    q: 'Q1',
    topic: '테이블 나누기',
    decision: '좌석 자체(정적), 회차별 좌석 상태(동적), 예약 이력을 서로 다른 테이블에 둔다',
    why: '변경 빈도와 생명주기가 다른 데이터는 나눈다',
    verify: { page: 'schema', label: 'ERD' },
  },
  {
    q: 'Q2',
    topic: '회차별 좌석 행',
    decision: '회차를 만들 때 좌석 수만큼 미리 만든다',
    why: '동시에 몰릴 때 잠글 대상(행)이 있어야 모든 동시성 전략을 쓸 수 있다',
  },
  {
    q: 'Q3',
    topic: '진실의 원천',
    decision: '예약 이력을 진실로 본다. 상태와 이력은 같은 트랜잭션과 제약조건으로 맞춘다',
    why: '같은 정보를 두 곳에 두는 것 자체는 안전장치가 아니라 어긋날 위험이다',
  },
  {
    q: 'Q4',
    topic: 'seats 컬럼',
    decision: 'venue_id · section · row_no · seat_no, 모두 NOT NULL',
    why: '열과 번호를 정수로 나눠야 정렬 · 범위 조회 · 좌석맵이 쉽다',
    verify: { page: 'constraints', label: '제약조건 검증' },
  },
  {
    q: 'Q5',
    topic: '값 검증 위치',
    decision: '애플리케이션 검증과 DB 제약을 둘 다 둔다',
    why: 'DB에 데이터가 들어오는 길은 애플리케이션 하나가 아니다',
    verify: { page: 'constraints', label: '제약조건 검증' },
  },
  {
    q: 'Q6',
    topic: '등급 관리',
    decision: '등급은 참조 테이블(grades)로 관리한다',
    why: '운영자가 어드민에서 바꾸는 값이다',
  },
  {
    q: 'Q7 · Q8',
    topic: '등급의 위치',
    decision: '등급은 seats가 아니라 회차별 좌석(schedule_seats)에 둔다',
    why: '같은 좌석도 공연마다 등급이 다르다. 회차별로 적으면 판매 기록의 스냅샷이 된다',
  },
  {
    q: 'Q9',
    topic: '좌석 중복 방지',
    decision: 'UNIQUE (venue_id, section, row_no, seat_no)',
    why: '대리 키(id)는 중복을 막지 못한다. 동시 요청에도 DB가 하나만 남긴다',
    verify: { page: 'race', label: '동시 INSERT 경쟁' },
  },
  {
    q: 'Q10',
    topic: 'PK 타입',
    decision: '내부 PK는 BIGINT GENERATED ALWAYS AS IDENTITY',
    why: '바깥에 노출되지 않는 id이고, PK 타입은 나중에 바꾸기 어렵다',
    verify: { page: 'constraints', label: '제약조건 검증' },
  },
  {
    q: 'Q11',
    topic: '구역 이름',
    decision: 'VARCHAR(10), 빈 문자열 금지',
    why: '길이는 늘리기 쉽고 줄이기 어렵다. 빈 문자열은 NOT NULL을 통과한다',
    verify: { page: 'constraints', label: '제약조건 검증' },
  },
  {
    q: 'Q12',
    topic: 'venues',
    decision: 'id · name만 둔다. 총 좌석 수는 저장하지 않고 센다',
    why: '계산으로 얻는 값을 저장하면 어긋날 위험이 생긴다',
    verify: { page: 'schema', label: 'ERD · 데이터' },
  },
  {
    q: 'Q13',
    topic: '공연장 이름',
    decision: 'UNIQUE를 걸지 않는다',
    why: '이름이 같은 다른 공연장이 있을 수 있다',
    verify: { page: 'constraints', label: '제약조건 검증' },
  },
  {
    q: 'Q14',
    topic: '공연장은 어디에',
    decision: 'venue_id는 concerts에 둔다 (공연 = 한 공연장에서 열리는 공연 상품)',
    why: '한 행이 현실의 무엇인지 먼저 정하면 답이 정해진다',
    verify: { page: 'schema', label: 'ERD' },
  },
  {
    q: 'Q15',
    topic: 'concerts 컬럼',
    decision: 'id · venue_id · title(VARCHAR(100), 빈 문자열 금지, UNIQUE 없음)',
    why: '같은 제목이 다른 공연장이나 다른 해에 다시 열린다',
    verify: { page: 'constraints', label: '제약조건 검증' },
  },
  {
    q: 'Q16 · Q17',
    topic: 'FK 인덱스',
    decision: 'concerts.venue_id에 인덱스를 만든다',
    why: '공연장별 조회와 공연장 삭제 FK 검사가 잦고, 공연 등록(쓰기)은 드물다',
    verify: { page: 'index', label: 'FK 인덱스 비교' },
  },
  {
    q: 'Q18 · Q19',
    topic: 'schedules',
    decision: 'id · concert_id · starts_at(timestamptz), 모두 NOT NULL',
    why: '공연 시각은 실제로 일어나는 한 순간이라 어디서 읽어도 같은 순간이어야 한다',
    verify: { page: 'time', label: '시간 타입 비교' },
  },
  {
    q: 'Q20 · Q21',
    topic: '회차 중복',
    decision: '같은 공연 · 같은 시각 회차는 UNIQUE로 막는다',
    why: '같은 커넥션 · 한 트랜잭션 · FOR UPDATE로 확인해도 다른 커넥션의 동시 INSERT는 못 막는다',
    verify: { page: 'race', label: '동시 INSERT 경쟁' },
  },
  {
    q: 'Q22',
    topic: '회차 UNIQUE 순서',
    decision: 'UNIQUE (concert_id, starts_at). concert_id FK 인덱스는 따로 만들지 않는다',
    why: '공연을 먼저 정하고 시각을 찾는다. 앞 컬럼이 concert_id라 공연별 조회와 FK 검사를 이 인덱스가 맡는다',
    verify: { page: 'index-order', label: '복합 인덱스 순서' },
  },
  {
    q: 'Q23 · Q24',
    topic: '예매 오픈 시각',
    decision: 'schedules.booking_opens_at TIMESTAMPTZ NOT NULL, CHECK (booking_opens_at < starts_at)',
    why: '한 공연 안에서도 1차 오픈 · 추가 회차처럼 회차마다 오픈 시각이 다르고, 예매는 공연 전에 열려야 한다',
    verify: { page: 'constraints', label: '제약조건 검증' },
  },
  {
    q: 'Q25 – Q31',
    topic: 'grades',
    decision: '공연마다 정한다 (concerts 1 : N grades). name VARCHAR(20) · color 팔레트 키 CHECK · sort_order > 0(10 간격), 공연 안에서 name과 sort_order는 각각 UNIQUE',
    why: '공연마다 등급 구성과 이름이 다르다. 색은 디자인 시스템과 함께 배포로 바뀐다. 끼워 넣기는 INSERT 한 번으로 끝나야 한다',
    verify: { page: 'constraints', label: '제약조건 검증' },
  },
  {
    q: 'Q32 – Q34',
    topic: 'schedule_seats',
    decision: '한 행 = 한 회차의 한 좌석. UNIQUE (schedule_id, seat_id), status는 ENUM (available · held · sold)',
    why: '같은 좌석도 회차마다 따로 팔린다. 상태 목록은 코드와 함께 드물게 바뀌고 값이 빠질 일이 거의 없다',
    verify: { page: 'constraints', label: '제약조건 검증' },
  },
  {
    q: 'Q35 · Q36',
    topic: '공연 · 공연장 맞추기',
    decision: 'schedule_seats에 concert_id · venue_id를 복사하고 복합 FK 넷으로 회차 · 등급 · 좌석이 같은 공연 · 공연장인지 강제한다',
    why: 'FK 하나는 행이 있는지만 본다. 규칙을 테이블 정의에 두면 모든 쓰기 경로를 DB가 막는다',
    verify: { page: 'constraints', label: '제약조건 검증' },
  },
  {
    q: 'Q37',
    topic: '회차 좌석의 FK 인덱스',
    decision: '등급 · 좌석 · 공연 쪽 복합 FK에는 인덱스를 두지 않는다',
    why: '부모 삭제는 드물고, 이 테이블은 쓰기가 가장 잦다 (Q16의 기준)',
    verify: { page: 'index', label: 'FK 인덱스 비교' },
  },
  {
    q: 'Q38 · Q39',
    topic: '가격',
    decision: '판매 가격은 (회차, 등급) 가격 테이블, 결제 금액은 예약 이력에 스냅샷. 좌석별 차이는 별도 등급으로. 컬럼은 다음 문답에서',
    why: '가격은 회차와 등급이 정한다. 좌석에 두면 같은 값이 좌석 수만큼 반복되고 일부만 고쳐질 수 있다',
    open: true,
  },
];
