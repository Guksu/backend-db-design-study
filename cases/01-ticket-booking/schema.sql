-- Case 01. 콘서트 티켓 예매
-- 문답으로 합의한 테이블만 여기에 추가한다. 주석의 Q번호는 step01-erd.md의 문답

-- 공연장 (Q12, Q13). 이름이 같은 공연장이 있을 수 있어 name에 UNIQUE를 걸지 않는다
CREATE TABLE venues (
  id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(50) NOT NULL CHECK (name <> '')
);

-- 공연장 좌석 (Q4~Q11). 어느 공연이든 같은 배치다.
-- 등급은 공연마다 달라서 여기에 두지 않는다 (Q7, Q8)
CREATE TABLE seats (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id BIGINT      NOT NULL REFERENCES venues (id),
  section  VARCHAR(10) NOT NULL CHECK (section <> ''),
  row_no   INTEGER     NOT NULL,
  seat_no  INTEGER     NOT NULL,
  CONSTRAINT seats_position_uq UNIQUE (venue_id, section, row_no, seat_no)
);

-- 공연 (Q14, Q15). 공연 = 한 공연장에서 열리는 공연 상품. 투어의 도시별 공연은 서로 다른 공연이다.
CREATE TABLE concerts (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id BIGINT       NOT NULL REFERENCES venues (id),
  title    VARCHAR(100) NOT NULL CHECK (title <> '')
);

-- FK 인덱스 (Q16 실험, Q17 결정). PostgreSQL은 FK 컬럼에 인덱스를 자동으로 만들지 않는다.
-- 공연장별 목록 조회와 공연장 삭제 시 FK 검사가 잦고, 공연 등록(쓰기)은 드물다
CREATE INDEX concerts_venue_id_idx ON concerts (venue_id);

-- 회차 (Q18, Q19). 공연장은 공연에 붙으므로 여기에 두지 않는다 (Q14)
CREATE TABLE schedules (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  concert_id BIGINT      NOT NULL REFERENCES concerts (id),
  starts_at  TIMESTAMPTZ NOT NULL,
  booking_opens_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT schedules_concert_starts_uq UNIQUE (concert_id, starts_at),
  CONSTRAINT schedules_opens_before_start_check CHECK (booking_opens_at < starts_at)
);

-- 설계 결정을 DB에도 남긴다. 시각화 화면의 ERD가 이 주석을 읽는다
COMMENT ON TABLE venues IS '공연장 (정적). 총 좌석 수는 저장하지 않고 seats를 센다 (Q12)';
COMMENT ON COLUMN venues.id IS '내부 PK는 BIGINT IDENTITY로 통일 (Q10)';
COMMENT ON COLUMN venues.name IS '이름이 같은 공연장이 있을 수 있어 UNIQUE 없음 (Q13)';
COMMENT ON CONSTRAINT venues_name_check ON venues IS '빈 문자열 금지 (Q12)';

COMMENT ON TABLE seats IS '공연장 좌석 (정적). 등급은 공연마다 달라 schedule_seats에 둔다 (Q7, Q8)';
COMMENT ON COLUMN seats.id IS '내부 PK는 BIGINT IDENTITY로 통일 (Q10)';
COMMENT ON COLUMN seats.venue_id IS '어느 공연장의 좌석인가 (Q4)';
COMMENT ON COLUMN seats.section IS '구역 이름. 10글자 제한 (Q11)';
COMMENT ON COLUMN seats.row_no IS '열. 문자열이 아닌 정수로 나눠 정렬 · 범위 조회가 쉽다 (Q4)';
COMMENT ON COLUMN seats.seat_no IS '번호 (Q4)';
COMMENT ON CONSTRAINT seats_position_uq ON seats IS '같은 좌석 중복 방지. 자연 키 (Q9)';
COMMENT ON CONSTRAINT seats_section_check ON seats IS '빈 문자열 금지 (Q11)';

COMMENT ON TABLE concerts IS '공연 = 한 공연장에서 열리는 공연 상품. 투어의 도시별 공연은 서로 다른 공연 (Q14, Q15)';
COMMENT ON COLUMN concerts.id IS '내부 PK는 BIGINT IDENTITY로 통일 (Q10)';
COMMENT ON COLUMN concerts.venue_id IS '공연마다 공연장은 하나 (Q14)';
COMMENT ON COLUMN concerts.title IS '같은 제목이 다른 공연장 · 다른 해에 다시 열릴 수 있어 UNIQUE 없음 (Q15)';
COMMENT ON CONSTRAINT concerts_title_check ON concerts IS '빈 문자열 금지 (Q15)';
COMMENT ON INDEX concerts_venue_id_idx IS '공연장별 조회 · 공연장 삭제 FK 검사용. 조회가 잦고 쓰기는 드물다 (Q16, Q17)';

COMMENT ON TABLE schedules IS '회차. 공연 하나에 여러 회차, 공연장은 공연에 붙는다 (Q14, Q18)';
COMMENT ON COLUMN schedules.id IS '내부 PK는 BIGINT IDENTITY로 통일 (Q10)';
COMMENT ON COLUMN schedules.concert_id IS '어느 공연의 회차인가 (Q18)';
COMMENT ON COLUMN schedules.starts_at IS '실제로 일어나는 한 순간이라 timestamptz. 화면 표시 시간대는 따로 정한다 (Q19)';
COMMENT ON CONSTRAINT schedules_concert_starts_uq ON schedules IS '같은 공연 · 같은 시각 회차 중복 방지 (Q20, Q21). concert_id가 앞이라 공연별 회차 조회와 FK 검사도 이 인덱스로 한다. 별도 FK 인덱스 없음 (Q22)';
COMMENT ON COLUMN schedules.booking_opens_at IS '예매 오픈 시각. 1차 오픈 · 추가 회차처럼 회차마다 다를 수 있어 회차에 둔다 (Q23, Q24)';
COMMENT ON CONSTRAINT schedules_opens_before_start_check ON schedules IS '예매는 공연 시작 전에 열려야 한다. 같은 시각도 안 된다 (Q24)';
