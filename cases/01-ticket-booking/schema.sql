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
  CONSTRAINT seats_position_uq UNIQUE (venue_id, section, row_no, seat_no),
  -- 복합 FK의 대상 (Q36): 회차 좌석이 "이 좌석은 이 공연장의 것"임을 함께 가리킨다
  CONSTRAINT seats_id_venue_uq UNIQUE (id, venue_id)
);

-- 공연 (Q14, Q15). 공연 = 한 공연장에서 열리는 공연 상품. 투어의 도시별 공연은 서로 다른 공연이다.
CREATE TABLE concerts (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_id BIGINT       NOT NULL REFERENCES venues (id),
  title    VARCHAR(100) NOT NULL CHECK (title <> ''),
  CONSTRAINT concerts_id_venue_uq UNIQUE (id, venue_id)
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
  CONSTRAINT schedules_opens_before_start_check CHECK (booking_opens_at < starts_at),
  CONSTRAINT schedules_id_concert_uq UNIQUE (id, concert_id)
);

CREATE TABLE grades (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  concert_id BIGINT      NOT NULL REFERENCES concerts (id),
  name       VARCHAR(20) NOT NULL CHECK (name <> ''),
  -- 키 목록은 gradePalette.ts(디자인 시스템)와 같아야 한다. 색을 더할 때 같은 배포에서 함께 고친다
  color      VARCHAR(20) NOT NULL CHECK (color IN ('red', 'orange', 'gold', 'green', 'teal', 'blue', 'pink', 'gray')),
  sort_order INTEGER     NOT NULL CHECK (sort_order > 0),
  CONSTRAINT grades_concert_name_uq UNIQUE (concert_id, name),
  CONSTRAINT grades_concert_sort_uq UNIQUE (concert_id, sort_order),
  CONSTRAINT grades_id_concert_uq UNIQUE (id, concert_id)
);

-- 좌석 상태 (Q34): 예약 가능 · 예약 진행 중 · 예약 완료. 선언한 순서가 곧 정렬 순서다
CREATE TYPE seat_status AS ENUM ('available', 'held', 'sold');

CREATE TABLE schedule_seats (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  schedule_id BIGINT      NOT NULL,
  seat_id     BIGINT      NOT NULL,
  grade_id    BIGINT      NOT NULL,
  -- 검증용 복사본 (Q36). 복합 FK가 원본과 같은 값만 허용해 어긋날 수 없다.
  -- 하나라도 NULL이면 복합 FK가 검사를 건너뛰므로 NOT NULL이 필수다
  concert_id  BIGINT      NOT NULL,
  venue_id    BIGINT      NOT NULL,
  status      seat_status NOT NULL DEFAULT 'available',
  CONSTRAINT schedule_seats_schedule_seat_uq UNIQUE (schedule_id, seat_id),
  -- 회차 · 등급은 같은 공연, 공연 · 좌석은 같은 공연장 (Q35, Q36)
  CONSTRAINT schedule_seats_schedule_fk FOREIGN KEY (schedule_id, concert_id) REFERENCES schedules (id, concert_id),
  CONSTRAINT schedule_seats_grade_fk    FOREIGN KEY (grade_id, concert_id)    REFERENCES grades (id, concert_id),
  CONSTRAINT schedule_seats_concert_fk  FOREIGN KEY (concert_id, venue_id)    REFERENCES concerts (id, venue_id),
  CONSTRAINT schedule_seats_seat_fk     FOREIGN KEY (seat_id, venue_id)       REFERENCES seats (id, venue_id)
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

COMMENT ON TABLE grades IS '공연별 등급. 공연마다 등급 구성과 이름이 다르다 (Q25, Q26)';
COMMENT ON COLUMN grades.id IS '내부 PK는 BIGINT IDENTITY로 통일 (Q10)';
COMMENT ON COLUMN grades.concert_id IS '어느 공연의 등급인가 (Q25)';
COMMENT ON COLUMN grades.name IS '화면에 보이는 등급 이름. 20글자 제한 (Q27)';
COMMENT ON CONSTRAINT grades_name_check ON grades IS '빈 문자열 금지 (Q27)';
COMMENT ON COLUMN grades.color IS '디자인 시스템의 팔레트 키. 실제 색은 화면이 정한다 (Q28)';
COMMENT ON CONSTRAINT grades_color_check ON grades IS '팔레트 키만 허용. 색 추가는 디자인 시스템 배포와 함께 가므로 CHECK (Q29)';
COMMENT ON COLUMN grades.sort_order IS '범례 · 가격표에 보일 순서. 1부터 (Q30)';
COMMENT ON CONSTRAINT grades_sort_order_check ON grades IS '0 이하 금지 (Q30)';
COMMENT ON CONSTRAINT grades_concert_sort_uq ON grades IS '한 공연 안에서 순서가 겹치면 범례 순서가 정해지지 않는다 (Q30)';
COMMENT ON CONSTRAINT grades_concert_name_uq ON grades IS '한 공연에 같은 이름의 등급 금지 (Q27). concert_id가 앞이라 FK 인덱스도 겸한다 (Q22와 같은 이유)';

COMMENT ON TABLE schedule_seats IS '회차별 좌석 (동적). 한 행 = 한 회차의 한 좌석. 회차를 만들 때 좌석 수만큼 미리 만든다 (Q1, Q2, Q32)';
COMMENT ON COLUMN schedule_seats.id IS '내부 PK는 BIGINT IDENTITY로 통일 (Q10)';
COMMENT ON COLUMN schedule_seats.schedule_id IS '어느 회차인가. 공연이 아니라 회차를 가리켜야 회차별 상태를 구분한다 (Q32)';
COMMENT ON COLUMN schedule_seats.seat_id IS '어느 좌석인가 (Q33)';
COMMENT ON COLUMN schedule_seats.grade_id IS '이 회차에서 이 좌석의 등급. 판매 기록의 스냅샷 (Q7, Q8)';
COMMENT ON COLUMN schedule_seats.status IS '지금 상태. 진실은 예약 이력이고, 상태는 이력과 같은 트랜잭션에서 바꾼다 (Q3, Q34). 회차를 만들 때는 모두 예약 가능';
COMMENT ON TYPE seat_status IS 'available 예약 가능 · held 예약 진행 중 · sold 예약 완료. 상태 목록은 코드와 함께 배포로 바뀐다 (Q34)';
COMMENT ON CONSTRAINT schedule_seats_schedule_seat_uq ON schedule_seats IS '한 회차에 같은 좌석 두 번 금지. 자연 키. schedule_id가 앞이라 회차별 좌석맵 조회와 FK 검사도 겸한다 (Q33)';

COMMENT ON COLUMN schedule_seats.concert_id IS '검증용 복사본. 회차와 등급이 같은 공연의 것임을 복합 FK로 강제한다 (Q36)';
COMMENT ON COLUMN schedule_seats.venue_id IS '검증용 복사본. 좌석이 공연의 공연장 것임을 복합 FK로 강제한다 (Q36)';
COMMENT ON CONSTRAINT schedule_seats_schedule_fk ON schedule_seats IS '회차와 그 회차의 공연 (Q36)';
COMMENT ON CONSTRAINT schedule_seats_grade_fk ON schedule_seats IS '등급이 같은 공연의 것이어야 한다. 다른 공연의 등급 금지 (Q25, Q36)';
COMMENT ON CONSTRAINT schedule_seats_concert_fk ON schedule_seats IS '공연과 그 공연의 공연장 (Q36)';
COMMENT ON CONSTRAINT schedule_seats_seat_fk ON schedule_seats IS '좌석이 공연의 공연장 것이어야 한다. 다른 공연장 좌석 금지 (Q35, Q36)';
COMMENT ON CONSTRAINT seats_id_venue_uq ON seats IS '복합 FK (seat_id, venue_id)의 대상 (Q36)';
COMMENT ON CONSTRAINT concerts_id_venue_uq ON concerts IS '복합 FK (concert_id, venue_id)의 대상 (Q36)';
COMMENT ON CONSTRAINT schedules_id_concert_uq ON schedules IS '복합 FK (schedule_id, concert_id)의 대상 (Q36)';
COMMENT ON CONSTRAINT grades_id_concert_uq ON grades IS '복합 FK (grade_id, concert_id)의 대상 (Q36)';
