-- 시드 (Q13): 스터디 아레나 1곳, A~D 4개 구역 × 10열 × 25석 = 1,000석
WITH venue AS (
  INSERT INTO venues (name) VALUES ('스터디 아레나') RETURNING id
)
INSERT INTO seats (venue_id, section, row_no, seat_no)
SELECT venue.id, section, row_no, seat_no
FROM venue,
     unnest(ARRAY['A', 'B', 'C', 'D']) AS section,
     generate_series(1, 10) AS row_no,
     generate_series(1, 25) AS seat_no;

-- 공연 1개 (Q15): 스터디 아레나에서 열린다
INSERT INTO concerts (venue_id, title)
SELECT id, '스터디 콘서트' FROM venues WHERE name = '스터디 아레나';

-- 회차 2개 (Q18, Q19): 서울 시각으로 입력하고 timestamptz로 저장한다
INSERT INTO schedules (concert_id, starts_at)
SELECT c.id, starts_at
FROM concerts c,
     unnest(ARRAY['2026-12-24 19:00+09', '2026-12-25 18:00+09']::timestamptz[]) AS starts_at
WHERE c.title = '스터디 콘서트';
