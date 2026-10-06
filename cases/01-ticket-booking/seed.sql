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
-- 예매 오픈 (Q23, Q24): 12/24는 1차 오픈, 12/25는 일주일 뒤 여는 추가 회차
INSERT INTO schedules (concert_id, starts_at, booking_opens_at)
SELECT c.id, s.starts_at, s.booking_opens_at
FROM concerts c,
     (VALUES ('2026-12-24 19:00+09'::timestamptz, '2026-10-01 20:00+09'::timestamptz),
             ('2026-12-25 18:00+09'::timestamptz, '2026-10-08 20:00+09'::timestamptz)) AS s (starts_at, booking_opens_at)
WHERE c.title = '스터디 콘서트';

-- 등급 3개 (Q25–Q31): 스터디 콘서트의 등급 목록, 팔레트 키, 범례 순서(10 간격이라 사이에 끼워 넣기 쉽다)
INSERT INTO grades (concert_id, name, color, sort_order)
SELECT c.id, g.name, g.color, g.sort_order
FROM concerts c,
     (VALUES ('VIP', 'red', 10), ('R', 'green', 20), ('S', 'blue', 30)) AS g (name, color, sort_order)
WHERE c.title = '스터디 콘서트';

-- 회차별 좌석 (Q2, Q33): 회차를 만들 때 공연장 좌석 수만큼 미리 만든다. 회차 2개 × 1,000석 = 2,000행
-- 상태는 기본값 available(예약 가능)으로 시작한다 (Q34)
-- 등급 배치는 실험용 예시다: A구역 VIP, B구역 R, C · D구역 S (회차를 만들 때 등급을 어디서 가져올지는 아직 정하지 않았다)
INSERT INTO schedule_seats (schedule_id, seat_id, grade_id)
SELECT sc.id, se.id, g.id
FROM schedules sc
JOIN concerts c ON c.id = sc.concert_id
JOIN seats se ON se.venue_id = c.venue_id
JOIN grades g ON g.concert_id = c.id
 AND g.name = CASE se.section WHEN 'A' THEN 'VIP' WHEN 'B' THEN 'R' ELSE 'S' END;
