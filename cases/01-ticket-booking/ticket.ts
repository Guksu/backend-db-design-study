import type pg from 'pg';
import { createPool, resetSchema } from '../../lab/db';

export const SCHEMA = 'ticket';

// 시뮬레이션이 가상 사용자마다 커넥션을 하나씩 잡으므로 넉넉히 둔다 (최대 사용자 50명)
export const createTicketPool = (max = 60) => createPool(SCHEMA, max);

export const reset = (pool: pg.Pool) =>
  resetSchema(pool, SCHEMA, [
    new URL('./schema.sql', import.meta.url),
    new URL('./seed.sql', import.meta.url),
  ]);

// node-postgres는 BIGINT를 문자열로 돌려준다 (Q10). 아직 숫자로 바꾸지 않았다
export interface Venue {
  id: string;
  name: string;
  seatCount: number;
}

export interface Seat {
  id: string;
  section: string;
  rowNo: number;
  seatNo: number;
}

export async function getVenueSeats(pool: pg.Pool): Promise<{ venue: Venue; seats: Seat[] }> {
  // 총 좌석 수는 저장하지 않고 센다 (Q12)
  const { rows: venues } = await pool.query(`
    SELECT v.id, v.name, count(s.id)::int AS "seatCount"
    FROM venues v
    LEFT JOIN seats s ON s.venue_id = v.id
    GROUP BY v.id
    ORDER BY v.id
    LIMIT 1
  `);
  const venue = venues[0] as Venue;
  const { rows: seats } = await pool.query(
    `
    SELECT id, section, row_no AS "rowNo", seat_no AS "seatNo"
    FROM seats
    WHERE venue_id = $1
    ORDER BY section, row_no, seat_no
    `,
    [venue.id],
  );
  return { venue, seats };
}

// ── 제약조건 확인: 합의한 결정이 DB에서 실제로 막히는지 ─────────────────────

export interface ConstraintCheck {
  id: string;
  /** 이 동작을 정한 문답 */
  decision: string;
  /** 시험하는 규칙 */
  rule: string;
  label: string;
  sql: string;
  expect: 'rejected' | 'accepted';
  /** 거부될 때 기대하는 SQLSTATE. 다른 규칙 때문에 거부되면 기대와 다르다고 본다 */
  code?: string;
}

const STUDY_ARENA = `(SELECT id FROM venues WHERE name = '스터디 아레나' LIMIT 1)`;
const STUDY_CONCERT = `(SELECT id FROM concerts WHERE title = '스터디 콘서트' ORDER BY id LIMIT 1)`;

export const CONSTRAINT_CHECKS: ConstraintCheck[] = [
  {
    id: 'duplicate-seat',
    decision: 'Q9',
    rule: 'UNIQUE (venue_id, section, row_no, seat_no)',
    label: '이미 있는 좌석(A구역 1열 1번)을 한 번 더 넣는다',
    sql: `INSERT INTO seats (venue_id, section, row_no, seat_no) VALUES (${STUDY_ARENA}, 'A', 1, 1)`,
    expect: 'rejected',
    code: '23505',
  },
  {
    id: 'null-row',
    decision: 'Q4',
    rule: 'row_no NOT NULL',
    label: '열 번호 없이(NULL) 좌석을 넣는다',
    sql: `INSERT INTO seats (venue_id, section, row_no, seat_no) VALUES (${STUDY_ARENA}, 'E', NULL, 1)`,
    expect: 'rejected',
    code: '23502',
  },
  {
    id: 'unknown-venue',
    decision: 'Q4',
    rule: 'seats.venue_id → venues(id) FK',
    label: '없는 공연장(id 999999)의 좌석을 넣는다',
    sql: `INSERT INTO seats (venue_id, section, row_no, seat_no) VALUES (999999, 'A', 1, 1)`,
    expect: 'rejected',
    code: '23503',
  },
  {
    id: 'manual-id',
    decision: 'Q10',
    rule: 'id GENERATED ALWAYS AS IDENTITY',
    label: 'id를 직접 지정해서 좌석을 넣는다',
    sql: `INSERT INTO seats (id, venue_id, section, row_no, seat_no) VALUES (1, ${STUDY_ARENA}, 'E', 1, 1)`,
    expect: 'rejected',
    code: '428C9',
  },
  {
    id: 'empty-section',
    decision: 'Q11',
    rule: 'CHECK (section <> \'\')',
    label: '구역 이름을 빈 문자열로 넣는다',
    sql: `INSERT INTO seats (venue_id, section, row_no, seat_no) VALUES (${STUDY_ARENA}, '', 1, 1)`,
    expect: 'rejected',
    code: '23514',
  },
  {
    id: 'long-section',
    decision: 'Q11',
    rule: 'section VARCHAR(10)',
    label: '구역 이름을 11글자로 넣는다',
    sql: `INSERT INTO seats (venue_id, section, row_no, seat_no) VALUES (${STUDY_ARENA}, '가나다라마바사아자차카', 1, 1)`,
    expect: 'rejected',
    code: '22001',
  },
  {
    id: 'empty-venue-name',
    decision: 'Q12',
    rule: 'CHECK (name <> \'\')',
    label: '공연장 이름을 빈 문자열로 넣는다',
    sql: `INSERT INTO venues (name) VALUES ('')`,
    expect: 'rejected',
    code: '23514',
  },
  {
    id: 'duplicate-venue-name',
    decision: 'Q13',
    rule: 'name에 UNIQUE 없음 (의도)',
    label: '같은 이름의 공연장을 하나 더 넣는다',
    sql: `INSERT INTO venues (name) VALUES ('스터디 아레나')`,
    expect: 'accepted',
  },
  {
    id: 'concert-unknown-venue',
    decision: 'Q14',
    rule: 'concerts.venue_id → venues(id) FK',
    label: '없는 공연장(id 999999)에서 열리는 공연을 넣는다',
    sql: `INSERT INTO concerts (venue_id, title) VALUES (999999, '없는 곳 공연')`,
    expect: 'rejected',
    code: '23503',
  },
  {
    id: 'concert-empty-title',
    decision: 'Q15',
    rule: 'CHECK (title <> \'\')',
    label: '공연 제목을 빈 문자열로 넣는다',
    sql: `INSERT INTO concerts (venue_id, title) VALUES (${STUDY_ARENA}, '')`,
    expect: 'rejected',
    code: '23514',
  },
  {
    id: 'schedule-unknown-concert',
    decision: 'Q18',
    rule: 'schedules.concert_id → concerts(id) FK',
    label: '없는 공연(id 999999)의 회차를 넣는다',
    sql: `INSERT INTO schedules (concert_id, starts_at, booking_opens_at) VALUES (999999, '2026-12-31 19:00+09', '2026-10-01 20:00+09')`,
    expect: 'rejected',
    code: '23503',
  },
  {
    id: 'schedule-null-start',
    decision: 'Q18',
    rule: 'starts_at NOT NULL',
    label: '시작 시각 없이 회차를 넣는다',
    sql: `INSERT INTO schedules (concert_id, starts_at, booking_opens_at) VALUES (${STUDY_CONCERT}, NULL, '2026-10-01 20:00+09')`,
    expect: 'rejected',
    code: '23502',
  },
  {
    id: 'schedule-duplicate',
    decision: 'Q21',
    rule: 'UNIQUE (concert_id, starts_at)',
    label: '이미 있는 회차(12/24 19:00)를 한 번 더 넣는다',
    sql: `INSERT INTO schedules (concert_id, starts_at, booking_opens_at) VALUES (${STUDY_CONCERT}, '2026-12-24 19:00+09', '2026-10-01 20:00+09')`,
    expect: 'rejected',
    code: '23505',
  },
  {
    id: 'schedule-duplicate-utc',
    decision: 'Q19 · Q21',
    rule: 'timestamptz라 같은 순간이면 같은 값',
    label: '같은 순간을 UTC로 적어(10:00Z) 한 번 더 넣는다',
    sql: `INSERT INTO schedules (concert_id, starts_at, booking_opens_at) VALUES (${STUDY_CONCERT}, '2026-12-24T10:00:00Z', '2026-10-01 20:00+09')`,
    expect: 'rejected',
    code: '23505',
  },
  {
    id: 'schedule-same-day',
    decision: 'Q21',
    rule: '시각이 다르면 다른 회차 (의도)',
    label: '같은 날 낮 공연(12/24 14:00)을 넣는다',
    sql: `INSERT INTO schedules (concert_id, starts_at, booking_opens_at) VALUES (${STUDY_CONCERT}, '2026-12-24 14:00+09', '2026-10-01 20:00+09')`,
    expect: 'accepted',
  },
  {
    id: 'schedule-null-opens',
    decision: 'Q24',
    rule: 'booking_opens_at NOT NULL',
    label: '예매 오픈 시각 없이 회차를 넣는다',
    sql: `INSERT INTO schedules (concert_id, starts_at, booking_opens_at) VALUES (${STUDY_CONCERT}, '2026-12-31 19:00+09', NULL)`,
    expect: 'rejected',
    code: '23502',
  },
  {
    id: 'schedule-opens-after-start',
    decision: 'Q24',
    rule: 'CHECK (booking_opens_at < starts_at)',
    label: '공연이 시작한 뒤에 예매를 연다',
    sql: `INSERT INTO schedules (concert_id, starts_at, booking_opens_at) VALUES (${STUDY_CONCERT}, '2026-12-31 19:00+09', '2026-12-31 20:00+09')`,
    expect: 'rejected',
    code: '23514',
  },
  {
    id: 'schedule-opens-at-start',
    decision: 'Q24',
    rule: 'CHECK (booking_opens_at < starts_at)',
    label: '공연 시작과 같은 시각에 예매를 연다',
    sql: `INSERT INTO schedules (concert_id, starts_at, booking_opens_at) VALUES (${STUDY_CONCERT}, '2026-12-31 19:00+09', '2026-12-31 19:00+09')`,
    expect: 'rejected',
    code: '23514',
  },
  {
    id: 'schedule-move-start-before-open',
    decision: 'Q24',
    rule: 'CHECK는 UPDATE에도 적용',
    label: '12/24 회차의 시작을 예매 오픈(10/1)보다 앞으로 옮긴다',
    sql: `UPDATE schedules SET starts_at = '2026-09-30 19:00+09' WHERE concert_id = ${STUDY_CONCERT} AND starts_at = '2026-12-24 19:00+09'`,
    expect: 'rejected',
    code: '23514',
  },
  {
    id: 'grade-duplicate-name',
    decision: 'Q27',
    rule: 'UNIQUE (concert_id, name)',
    label: '스터디 콘서트에 VIP 등급을 하나 더 넣는다',
    sql: `INSERT INTO grades (concert_id, name, color, sort_order) VALUES (${STUDY_CONCERT}, 'VIP', 'red', 9)`,
    expect: 'rejected',
    code: '23505',
  },
  {
    id: 'grade-same-name-other-concert',
    decision: 'Q27',
    rule: '다른 공연이면 같은 이름 가능 (의도)',
    label: '새 공연을 만들고 거기에도 VIP 등급을 넣는다',
    sql: `WITH c AS (INSERT INTO concerts (venue_id, title) VALUES (${STUDY_ARENA}, '다른 공연') RETURNING id)
INSERT INTO grades (concert_id, name, color, sort_order) SELECT id, 'VIP', 'red', 1 FROM c`,
    expect: 'accepted',
  },
  {
    id: 'grade-null-name',
    decision: 'Q27',
    rule: 'name NOT NULL',
    label: '이름 없이(NULL) 등급을 넣는다',
    sql: `INSERT INTO grades (concert_id, name, color, sort_order) VALUES (${STUDY_CONCERT}, NULL, 'red', 9)`,
    expect: 'rejected',
    code: '23502',
  },
  {
    id: 'grade-empty-name',
    decision: 'Q27',
    rule: "CHECK (name <> '')",
    label: '등급 이름을 빈 문자열로 넣는다',
    sql: `INSERT INTO grades (concert_id, name, color, sort_order) VALUES (${STUDY_CONCERT}, '', 'red', 9)`,
    expect: 'rejected',
    code: '23514',
  },
  {
    id: 'grade-long-name',
    decision: 'Q27',
    rule: 'name VARCHAR(20)',
    label: '등급 이름을 21글자로 넣는다',
    sql: `INSERT INTO grades (concert_id, name, color, sort_order) VALUES (${STUDY_CONCERT}, '${'가'.repeat(21)}', 'red', 9)`,
    expect: 'rejected',
    code: '22001',
  },
  {
    id: 'grade-color-not-in-palette',
    decision: 'Q29',
    rule: 'CHECK (color IN 팔레트 키)',
    label: '팔레트에 없는 키(purple)로 등급을 넣는다',
    sql: `INSERT INTO grades (concert_id, name, color, sort_order) VALUES (${STUDY_CONCERT}, 'A', 'purple', 9)`,
    expect: 'rejected',
    code: '23514',
  },
  {
    id: 'grade-color-hex',
    decision: 'Q28',
    rule: '팔레트 키만, HEX는 안 됨',
    label: "색을 HEX('#E74C3C')로 넣는다",
    sql: `INSERT INTO grades (concert_id, name, color, sort_order) VALUES (${STUDY_CONCERT}, 'A', '#E74C3C', 9)`,
    expect: 'rejected',
    code: '23514',
  },
  {
    id: 'grade-null-color',
    decision: 'Q28',
    rule: 'color NOT NULL',
    label: '색 없이(NULL) 등급을 넣는다',
    sql: `INSERT INTO grades (concert_id, name, color, sort_order) VALUES (${STUDY_CONCERT}, 'A', NULL, 9)`,
    expect: 'rejected',
    code: '23502',
  },
  {
    id: 'grade-duplicate-sort',
    decision: 'Q30',
    rule: 'UNIQUE (concert_id, sort_order)',
    label: '스터디 콘서트에 순서 10(VIP와 같은 순서)인 등급을 넣는다',
    sql: `INSERT INTO grades (concert_id, name, color, sort_order) VALUES (${STUDY_CONCERT}, 'A', 'gold', 10)`,
    expect: 'rejected',
    code: '23505',
  },
  {
    id: 'grade-insert-between',
    decision: 'Q31',
    rule: '간격 사이에 끼워 넣기 (의도)',
    label: 'VIP(10)와 R(20) 사이에 SR(15)을 넣는다. 다른 행은 건드리지 않는다',
    sql: `INSERT INTO grades (concert_id, name, color, sort_order) VALUES (${STUDY_CONCERT}, 'SR', 'gold', 15)`,
    expect: 'accepted',
  },
  {
    id: 'grade-zero-sort',
    decision: 'Q30',
    rule: 'CHECK (sort_order > 0)',
    label: '순서 0인 등급을 넣는다',
    sql: `INSERT INTO grades (concert_id, name, color, sort_order) VALUES (${STUDY_CONCERT}, 'A', 'gold', 0)`,
    expect: 'rejected',
    code: '23514',
  },
  {
    id: 'grade-null-sort',
    decision: 'Q30',
    rule: 'sort_order NOT NULL',
    label: '순서 없이(NULL) 등급을 넣는다',
    sql: `INSERT INTO grades (concert_id, name, color, sort_order) VALUES (${STUDY_CONCERT}, 'A', 'gold', NULL)`,
    expect: 'rejected',
    code: '23502',
  },
  {
    id: 'grade-unknown-concert',
    decision: 'Q25',
    rule: 'grades.concert_id → concerts(id) FK',
    label: '없는 공연(id 999999)의 등급을 넣는다',
    sql: `INSERT INTO grades (concert_id, name, color, sort_order) VALUES (999999, 'VIP', 'red', 9)`,
    expect: 'rejected',
    code: '23503',
  },
  {
    id: 'schedule-seat-duplicate',
    decision: 'Q33',
    rule: 'UNIQUE (schedule_id, seat_id)',
    label: '12/24 회차에 이미 있는 좌석을 한 번 더 넣는다',
    sql: `INSERT INTO schedule_seats (schedule_id, seat_id, grade_id, concert_id, venue_id)
SELECT schedule_id, seat_id, grade_id, concert_id, venue_id FROM schedule_seats ORDER BY id LIMIT 1`,
    expect: 'rejected',
    code: '23505',
  },
  {
    id: 'schedule-seat-unknown-schedule',
    decision: 'Q32',
    rule: '(schedule_id, concert_id) → schedules FK',
    label: '없는 회차(id 999999)의 좌석을 넣는다',
    sql: `INSERT INTO schedule_seats (schedule_id, seat_id, grade_id, concert_id, venue_id)
SELECT 999999, seat_id, grade_id, concert_id, venue_id FROM schedule_seats ORDER BY id LIMIT 1`,
    expect: 'rejected',
    code: '23503',
  },
  {
    id: 'schedule-seat-null-grade',
    decision: 'Q33',
    rule: 'grade_id NOT NULL',
    label: '등급 없이(NULL) 회차 좌석을 넣는다',
    sql: `WITH s AS (INSERT INTO seats (venue_id, section, row_no, seat_no) VALUES (${STUDY_ARENA}, 'Z', 1, 1) RETURNING id)
INSERT INTO schedule_seats (schedule_id, seat_id, grade_id, concert_id, venue_id)
SELECT (SELECT min(id) FROM schedules), s.id, NULL, ${STUDY_CONCERT}, ${STUDY_ARENA} FROM s`,
    expect: 'rejected',
    code: '23502',
  },
  {
    id: 'schedule-seat-unknown-status',
    decision: 'Q34',
    rule: 'status는 seat_status ENUM',
    label: "상태를 화면 문구('예약완료')로 바꾼다",
    sql: `UPDATE schedule_seats SET status = '예약완료' WHERE id = (SELECT min(id) FROM schedule_seats)`,
    expect: 'rejected',
    code: '22P02',
  },
  {
    id: 'schedule-seat-null-status',
    decision: 'Q34',
    rule: 'status NOT NULL',
    label: '상태를 NULL로 바꾼다',
    sql: `UPDATE schedule_seats SET status = NULL WHERE id = (SELECT min(id) FROM schedule_seats)`,
    expect: 'rejected',
    code: '23502',
  },
  {
    id: 'schedule-seat-other-concert-grade',
    decision: 'Q25 · Q36',
    rule: '(grade_id, concert_id) → grades FK',
    label: '스터디 콘서트 회차의 좌석에 다른 공연의 등급을 붙인다',
    sql: `WITH c AS (INSERT INTO concerts (venue_id, title) VALUES (${STUDY_ARENA}, '다른 공연') RETURNING id),
     g AS (INSERT INTO grades (concert_id, name, color, sort_order) SELECT id, 'VIP', 'red', 10 FROM c RETURNING id),
     s AS (INSERT INTO seats (venue_id, section, row_no, seat_no) VALUES (${STUDY_ARENA}, 'Z', 1, 1) RETURNING id)
INSERT INTO schedule_seats (schedule_id, seat_id, grade_id, concert_id, venue_id)
SELECT (SELECT min(id) FROM schedules), s.id, g.id, ${STUDY_CONCERT}, ${STUDY_ARENA} FROM s, g`,
    expect: 'rejected',
    code: '23503',
  },
  {
    id: 'schedule-seat-lie-concert',
    decision: 'Q36',
    rule: '(schedule_id, concert_id) → schedules FK',
    label: '다른 공연의 등급에 맞춰 concert_id를 거짓으로 적는다',
    sql: `WITH c AS (INSERT INTO concerts (venue_id, title) VALUES (${STUDY_ARENA}, '다른 공연') RETURNING id),
     g AS (INSERT INTO grades (concert_id, name, color, sort_order) SELECT id, 'VIP', 'red', 10 FROM c RETURNING id),
     s AS (INSERT INTO seats (venue_id, section, row_no, seat_no) VALUES (${STUDY_ARENA}, 'Z', 1, 1) RETURNING id)
INSERT INTO schedule_seats (schedule_id, seat_id, grade_id, concert_id, venue_id)
SELECT (SELECT min(id) FROM schedules), s.id, g.id, c.id, ${STUDY_ARENA} FROM s, g, c`,
    expect: 'rejected',
    code: '23503',
  },
  {
    id: 'schedule-seat-other-venue-seat',
    decision: 'Q35 · Q36',
    rule: '(seat_id, venue_id) → seats FK',
    label: '스터디 아레나 공연의 회차에 다른 공연장 좌석을 붙인다',
    sql: `WITH v AS (INSERT INTO venues (name) VALUES ('다른 공연장') RETURNING id),
     s AS (INSERT INTO seats (venue_id, section, row_no, seat_no) SELECT id, 'A', 1, 1 FROM v RETURNING id)
INSERT INTO schedule_seats (schedule_id, seat_id, grade_id, concert_id, venue_id)
SELECT (SELECT min(id) FROM schedules), s.id, (SELECT min(id) FROM grades), ${STUDY_CONCERT}, ${STUDY_ARENA} FROM s`,
    expect: 'rejected',
    code: '23503',
  },
  {
    id: 'concert-move-venue',
    decision: 'Q36',
    rule: '(concert_id, venue_id) → concerts FK',
    label: '회차 좌석이 있는 공연의 공연장을 바꾼다',
    sql: `WITH v AS (INSERT INTO venues (name) VALUES ('다른 공연장') RETURNING id)
UPDATE concerts SET venue_id = v.id FROM v WHERE concerts.title = '스터디 콘서트'`,
    expect: 'rejected',
    code: '23503',
  },
  {
    id: 'price-duplicate',
    decision: 'Q40',
    rule: 'UNIQUE (schedule_id, grade_id)',
    label: '12/24 회차 VIP에 가격을 하나 더 넣는다',
    sql: `INSERT INTO schedule_grade_prices (schedule_id, grade_id, concert_id, price)
SELECT schedule_id, grade_id, concert_id, 99000 FROM schedule_grade_prices ORDER BY id LIMIT 1`,
    expect: 'rejected',
    code: '23505',
  },
  {
    id: 'price-negative',
    decision: 'Q40',
    rule: 'CHECK (price >= 0)',
    label: '가격을 -1,000원으로 바꾼다',
    sql: `UPDATE schedule_grade_prices SET price = -1000 WHERE id = (SELECT min(id) FROM schedule_grade_prices)`,
    expect: 'rejected',
    code: '23514',
  },
  {
    id: 'price-null',
    decision: 'Q40',
    rule: 'price NOT NULL',
    label: '가격을 NULL로 바꾼다',
    sql: `UPDATE schedule_grade_prices SET price = NULL WHERE id = (SELECT min(id) FROM schedule_grade_prices)`,
    expect: 'rejected',
    code: '23502',
  },
  {
    id: 'price-zero',
    decision: 'Q40',
    rule: '0원은 허용 (의도: 초대권)',
    label: '가격을 0원으로 바꾼다',
    sql: `UPDATE schedule_grade_prices SET price = 0 WHERE id = (SELECT min(id) FROM schedule_grade_prices)`,
    expect: 'accepted',
  },
  {
    id: 'price-over-integer',
    decision: 'Q40',
    rule: 'price INTEGER (약 21억까지)',
    label: '가격을 2,147,483,648원으로 바꾼다',
    sql: `UPDATE schedule_grade_prices SET price = 2147483648 WHERE id = (SELECT min(id) FROM schedule_grade_prices)`,
    expect: 'rejected',
    code: '22003',
  },
  {
    id: 'price-other-concert-grade',
    decision: 'Q40 · Q41',
    rule: '(grade_id, concert_id) → grades FK',
    label: '스터디 콘서트 회차에 다른 공연 등급의 가격을 매긴다',
    sql: `WITH c AS (INSERT INTO concerts (venue_id, title) VALUES (${STUDY_ARENA}, '다른 공연') RETURNING id),
     g AS (INSERT INTO grades (concert_id, name, color, sort_order) SELECT id, 'VIP', 'red', 10 FROM c RETURNING id)
INSERT INTO schedule_grade_prices (schedule_id, grade_id, concert_id, price)
SELECT (SELECT min(id) FROM schedules), g.id, ${STUDY_CONCERT}, 99000 FROM g`,
    expect: 'rejected',
    code: '23503',
  },
  {
    id: 'seat-grade-without-price',
    decision: 'Q42',
    rule: '좌석 → 가격 FK 없음 (의도: 판매 전에 애플리케이션이 점검)',
    label: '가격이 없는 등급(VIP 시야제한)으로 회차 좌석 하나의 등급을 바꾼다',
    sql: `WITH g AS (INSERT INTO grades (concert_id, name, color, sort_order) VALUES (${STUDY_CONCERT}, 'VIP 시야제한', 'gray', 40) RETURNING id)
UPDATE schedule_seats SET grade_id = g.id FROM g WHERE schedule_seats.id = (SELECT min(id) FROM schedule_seats)`,
    expect: 'accepted',
  },
  {
    id: 'concert-duplicate-title',
    decision: 'Q15',
    rule: 'title에 UNIQUE 없음 (의도)',
    label: '같은 제목의 공연을 하나 더 넣는다',
    sql: `INSERT INTO concerts (venue_id, title) VALUES (${STUDY_ARENA}, '스터디 콘서트')`,
    expect: 'accepted',
  },
];

/**
 * 판매 전 점검 (Q42). 가격표에 없는 (회차, 등급)의 좌석을 센다.
 * 좌석을 먼저 깔고 가격은 오픈 전에 정할 수 있게 DB는 막지 않으므로, 애플리케이션이 판매를 열기 전에 돌린다
 */
export const UNPRICED_SEATS_SQL = `
SELECT ss.schedule_id, ss.grade_id, count(*)::int AS seats
FROM schedule_seats ss
WHERE NOT EXISTS (
  SELECT 1 FROM schedule_grade_prices p
  WHERE p.schedule_id = ss.schedule_id AND p.grade_id = ss.grade_id
)
GROUP BY ss.schedule_id, ss.grade_id
ORDER BY ss.schedule_id, ss.grade_id`;

export interface ConstraintCheckResult {
  id: string;
  outcome: 'rejected' | 'accepted';
  /** PostgreSQL 에러 코드 (SQLSTATE) */
  code?: string;
  message?: string;
}

/** 체크를 실행하고 결과와 상관없이 되돌린다. 데이터가 바뀌지 않는다 */
export async function runConstraintCheck(
  pool: pg.Pool,
  check: ConstraintCheck,
): Promise<ConstraintCheckResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(check.sql);
    return { id: check.id, outcome: 'accepted' };
  } catch (err) {
    const { code, message } = err as { code?: string; message: string };
    return { id: check.id, outcome: 'rejected', code, message };
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

// ── 동시 INSERT 경쟁 (Q9 · Q20): 애플리케이션 확인만 vs 애플리케이션 확인 + UNIQUE ────────

/**
 * - check-only: UNIQUE 제약이 없는 복사본 테이블에서 "SELECT로 확인 → 없으면 INSERT"
 * - check-and-unique: 같은 흐름을 UNIQUE 제약이 있는 실제 seats 테이블에서 (Q5: 앱 검증 + DB 제약)
 * 두 전략은 같은 시드로 같은 도착 시각을 쓴다. 차이는 UNIQUE 제약 하나뿐이다.
 */
export type RaceStrategy = 'check-only' | 'check-and-unique';

/**
 * 한 사용자가 자기 커넥션 하나에서 SELECT와 INSERT를 어떻게 묶나 (Q20)
 * - autocommit: 문장마다 바로 커밋
 * - transaction: BEGIN → SELECT → INSERT → COMMIT
 * - for-update: BEGIN → SELECT … FOR UPDATE → INSERT → COMMIT
 */
export type RaceTxMode = 'autocommit' | 'transaction' | 'for-update';

export interface RaceOptions {
  /** 가상 사용자 수. 사용자마다 같은 좌석을 한 번씩 넣으려 한다 */
  users: number;
  /** 도착 시간 폭. 사용자들이 0 ~ spreadMs 사이에 도착한다 */
  spreadMs: number;
  /** SELECT로 확인한 뒤 INSERT하기까지의 간격. 네트워크 왕복 · 애플리케이션 처리를 흉내 낸다 */
  gapMs: number;
  /** 도착 시각을 만드는 난수 시드. 같은 시드면 같은 도착 순서가 재현된다 */
  seed: number;
  txMode: RaceTxMode;
}

export type AttemptOutcome =
  | 'inserted' // 처음으로 들어간 행
  | 'duplicate' // 들어갔지만 이미 같은 좌석이 있었다 (중복)
  | 'blocked-by-check' // SELECT에서 이미 있는 것을 보고 멈췄다
  | 'blocked-by-unique' // 확인은 통과했지만 UNIQUE 제약이 거부했다
  | 'error';

/** 모든 시각은 실험 시작(t0)으로부터의 ms */
export interface AttemptTrace {
  user: number;
  /** 이 사용자가 SELECT와 INSERT에 함께 쓴 커넥션의 서버 프로세스 번호 (pg_backend_pid) */
  pid: number;
  /** 시드로 정한 도착 예정 시각 */
  plannedAt: number;
  select: [number, number];
  /** SELECT가 이미 있는 행을 봤나 */
  sawRow: boolean;
  insert: [number, number] | null;
  /** transaction · for-update 모드에서 INSERT 뒤 COMMIT 구간 */
  commit: [number, number] | null;
  endAt: number;
  outcome: AttemptOutcome;
  error?: string;
}

export interface RaceTrace {
  strategy: RaceStrategy;
  attempts: AttemptTrace[];
  /** 경쟁이 끝난 뒤 같은 좌석의 행 수. 1이어야 정상 */
  rowsAfter: number;
  /** 첫 행이 커밋된 시각. 이보다 먼저 SELECT한 요청은 모두 "없음"을 본다 */
  firstCommitAt: number | null;
  durationMs: number;
}

const RACE_SECTION = 'RACE';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 시드 고정 난수 (mulberry32) */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function plannedArrivals({ users, spreadMs, seed }: RaceOptions): number[] {
  const random = seededRandom(seed);
  return Array.from({ length: users }, () => Math.round(random() * spreadMs * 10) / 10);
}

const round = (ms: number) => Math.round(ms * 100) / 100;

export async function runRace(
  pool: pg.Pool,
  strategy: RaceStrategy,
  options: RaceOptions,
): Promise<RaceTrace> {
  // check-only는 실행마다 UNIQUE 없는 복사본 테이블을 만든다 (NOT NULL과 IDENTITY만 복사)
  const table =
    strategy === 'check-and-unique'
      ? 'seats'
      : `lab_race_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  if (strategy === 'check-only') {
    await pool.query(`CREATE TABLE ${table} (LIKE seats INCLUDING DEFAULTS INCLUDING IDENTITY)`);
  }

  const { rows } = await pool.query(`SELECT id FROM venues ORDER BY id LIMIT 1`);
  const position = [rows[0].id as string, RACE_SECTION, 1, 1];
  const arrivals = plannedArrivals(options);

  // 사용자마다 커넥션을 미리 잡아 둔다. 커넥션을 여는 시간 때문에 요청이 엇갈리면 동시성 실험이 안 된다
  const clients = await Promise.all(arrivals.map(() => pool.connect()));
  const pids = await Promise.all(
    clients.map(async (client) => (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number),
  );
  const inTransaction = options.txMode !== 'autocommit';
  const lock = options.txMode === 'for-update' ? ' FOR UPDATE' : '';

  try {
    const t0 = performance.now();
    const now = () => round(performance.now() - t0);

    const attempts = await Promise.all(
      clients.map(async (client, i): Promise<AttemptTrace> => {
        const plannedAt = arrivals[i];
        await sleep(plannedAt);
        if (inTransaction) await client.query('BEGIN');
        const selectStart = now();
        const found = await client.query(
          `SELECT 1 FROM ${table} WHERE venue_id = $1 AND section = $2 AND row_no = $3 AND seat_no = $4${lock}`,
          position,
        );
        const select: [number, number] = [selectStart, now()];
        const base = { user: i + 1, pid: pids[i], plannedAt, select, sawRow: Boolean(found.rowCount) };
        if (found.rowCount) {
          if (inTransaction) await client.query('ROLLBACK');
          return { ...base, insert: null, commit: null, endAt: select[1], outcome: 'blocked-by-check' };
        }

        await sleep(options.gapMs);
        const insertStart = now();
        try {
          await client.query(
            `INSERT INTO ${table} (venue_id, section, row_no, seat_no) VALUES ($1, $2, $3, $4)`,
            position,
          );
          const insert: [number, number] = [insertStart, now()];
          let commit: [number, number] | null = null;
          if (inTransaction) {
            const commitStart = now();
            await client.query('COMMIT');
            commit = [commitStart, now()];
          }
          return { ...base, insert, commit, endAt: (commit ?? insert)[1], outcome: 'inserted' };
        } catch (err) {
          const { code, message } = err as { code?: string; message: string };
          const end = now();
          if (inTransaction) await client.query('ROLLBACK');
          return {
            ...base,
            insert: [insertStart, end],
            commit: null,
            endAt: end,
            outcome: code === '23505' ? 'blocked-by-unique' : 'error',
            error: message,
          };
        }
      }),
    );

    // 들어간 행 중 가장 먼저 커밋된 것만 정상이고 나머지는 중복이다
    const inserted = attempts
      .filter((a) => a.outcome === 'inserted')
      .sort((a, b) => a.endAt - b.endAt);
    for (const attempt of inserted.slice(1)) attempt.outcome = 'duplicate';

    const count = await pool.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE section = $1`,
      [RACE_SECTION],
    );
    return {
      strategy,
      attempts,
      rowsAfter: count.rows[0].n,
      firstCommitAt: inserted[0]?.endAt ?? null,
      durationMs: Math.max(...attempts.map((a) => a.endAt)),
    };
  } finally {
    // 중간에 예외가 나도 열린 트랜잭션을 풀어 둔 채 풀로 돌려보내지 않는다
    if (inTransaction) await Promise.all(clients.map((c) => c.query('ROLLBACK').catch(() => {})));
    for (const client of clients) client.release();
    if (strategy === 'check-only') await pool.query(`DROP TABLE IF EXISTS ${table}`);
    else await pool.query(`DELETE FROM seats WHERE section = $1`, [RACE_SECTION]);
  }
}

export interface SweepCell {
  spreadMs: number;
  gapMs: number;
  /** 반복마다 생긴 중복 행 수 (행 수 - 1) */
  duplicates: number[];
}

/** 도착 시간 폭 × 확인→INSERT 간격 격자마다 check-only를 여러 번 돌려 중복 수를 모은다 */
export async function runSweep(
  pool: pg.Pool,
  {
    users,
    spreads,
    gaps,
    reps,
    seed,
  }: { users: number; spreads: number[]; gaps: number[]; reps: number; seed: number },
  onCell: (cell: SweepCell) => void,
): Promise<void> {
  for (const gapMs of gaps) {
    for (const spreadMs of spreads) {
      const duplicates: number[] = [];
      for (let r = 0; r < reps; r++) {
        const trace = await runRace(pool, 'check-only', {
          users,
          spreadMs,
          gapMs,
          seed: seed + r,
          txMode: 'autocommit',
        });
        duplicates.push(trace.rowsAfter - 1);
      }
      onCell({ spreadMs, gapMs, duplicates });
    }
  }
}
