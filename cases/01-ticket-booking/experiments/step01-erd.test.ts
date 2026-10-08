import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { introspectSchema, previewTable } from '../../../lab/introspect';
import {
  CONSTRAINT_CHECKS,
  createTicketPool,
  getVenueSeats,
  plannedArrivals,
  reset,
  runConstraintCheck,
  runRace,
  SCHEMA,
  UNPRICED_SEATS_SQL,
} from '../ticket';

const pool = createTicketPool();

beforeAll(() => reset(pool));
afterAll(() => pool.end());

describe('Step 1. venues · seats', () => {
  it('시드: 스터디 아레나에 4개 구역 × 10열 × 25석 = 1,000석', async () => {
    const { venue, seats } = await getVenueSeats(pool);
    expect(venue).toMatchObject({ name: '스터디 아레나', seatCount: 1000 });
    expect(new Set(seats.map((s) => s.section))).toEqual(new Set(['A', 'B', 'C', 'D']));
  });

  it('ERD: DB 카탈로그에서 seats → venues FK와 자연 키 UNIQUE를 읽는다', async () => {
    const seats = (await introspectSchema(pool, SCHEMA)).find((t) => t.name === 'seats');
    expect(seats?.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'FOREIGN KEY', columns: ['venue_id'], refTable: 'venues' }),
        expect.objectContaining({
          name: 'seats_position_uq',
          kind: 'UNIQUE',
          columns: ['venue_id', 'section', 'row_no', 'seat_no'],
        }),
      ]),
    );
  });

  it.each(CONSTRAINT_CHECKS)('$decision: $label → $expect', async (check) => {
    const result = await runConstraintCheck(pool, check);
    expect(result.outcome).toBe(check.expect);
    // 다른 규칙 때문에 거부된 것이 아닌지까지 확인한다
    if (check.code) expect(result.code).toBe(check.code);
  });
});

describe('Q9. 동시 INSERT 경쟁', () => {
  const options = { users: 20, spreadMs: 0, gapMs: 10, seed: 42, txMode: 'autocommit' } as const;

  it('같은 시드는 같은 도착 시각을 만든다', () => {
    const spread = { ...options, spreadMs: 100 };
    expect(plannedArrivals(spread)).toEqual(plannedArrivals(spread));
  });

  it('애플리케이션 확인만으로는 동시에 도착한 요청이 모두 "없음"을 보고 중복으로 들어간다', async () => {
    const trace = await runRace(pool, 'check-only', options);
    expect(trace.rowsAfter).toBeGreaterThan(1);
    expect(trace.attempts.filter((a) => a.outcome === 'duplicate')).toHaveLength(
      trace.rowsAfter - 1,
    );
  });

  it('UNIQUE 제약이 있으면 확인을 통과한 요청도 DB가 막아 정확히 한 행만 남는다', async () => {
    const trace = await runRace(pool, 'check-and-unique', options);
    expect(trace.rowsAfter).toBe(1);
    expect(trace.attempts.filter((a) => a.outcome === 'inserted')).toHaveLength(1);
    expect(trace.attempts.some((a) => a.outcome === 'blocked-by-unique')).toBe(true);
  });

  it('첫 커밋보다 먼저 SELECT한 요청은 모두 행을 보지 못한다', async () => {
    const trace = await runRace(pool, 'check-only', { ...options, spreadMs: 80, gapMs: 20 });
    const early = trace.attempts.filter((a) => a.select[1] < trace.firstCommitAt!);
    expect(early.every((a) => !a.sawRow)).toBe(true);
  });
});

describe('Q20. 같은 커넥션 · 한 트랜잭션 · FOR UPDATE로 확인해도', () => {
  const base = { users: 20, spreadMs: 0, gapMs: 10, seed: 42 };

  it('사용자마다 커넥션이 하나씩이고, 서로 다른 커넥션끼리 부딪힌다', async () => {
    const trace = await runRace(pool, 'check-only', { ...base, txMode: 'autocommit' });
    expect(new Set(trace.attempts.map((a) => a.pid)).size).toBe(base.users);
    expect(trace.rowsAfter).toBeGreaterThan(1);
  });

  it.each(['transaction', 'for-update'] as const)(
    '%s: UNIQUE가 없으면 여전히 중복이 들어가고, UNIQUE가 있으면 한 행만 남는다',
    async (txMode) => {
      const checkOnly = await runRace(pool, 'check-only', { ...base, txMode });
      expect(checkOnly.rowsAfter).toBeGreaterThan(1);
      expect(checkOnly.attempts.every((a) => a.outcome === 'blocked-by-check' || a.commit)).toBe(true);

      const withUnique = await runRace(pool, 'check-and-unique', { ...base, txMode });
      expect(withUnique.rowsAfter).toBe(1);
    },
  );
});

describe('Q16. concerts.venue_id 인덱스', () => {
  it('인덱스가 없으면 Seq Scan, 있으면 인덱스로 찾고, 공연장 삭제 시 FK 검사도 빨라진다', async () => {
    const { runIndexLab } = await import('../indexLab');
    const results: import('../indexLab').SizeResult[] = [];
    await runIndexLab(pool, { sizes: [100_000], venues: 1000 }, (r) => results.push(r));
    const [{ noIndex, index }] = results;

    expect(noIndex.select.plan.type).toMatch(/Seq Scan|Gather/);
    expect(JSON.stringify(index.select.plan)).toMatch(/Index/);
    expect(index.venueIndexBytes).toBeGreaterThan(0);
    expect(noIndex.venueIndexBytes).toBeNull();
    expect(index.select.ms).toBeLessThan(noIndex.select.ms);
    expect(index.deleteParent.fkCheckMs).toBeLessThan(noIndex.deleteParent.fkCheckMs);
  });
});

describe('Q17. 결정 반영', () => {
  it('concerts.venue_id에 인덱스가 있다', async () => {
    const preview = await previewTable(pool, SCHEMA, 'concerts');
    expect(preview?.indexes.map((i) => i.name)).toContain('concerts_venue_id_idx');
  });
});

describe('Q18. timestamp vs timestamptz', () => {
  it('timestamptz는 어느 세션에서 읽어도 같은 순간, timestamp는 세션마다 다른 순간을 가리킨다', async () => {
    const { runTimeLab } = await import('../timeLab');
    const { rows } = await runTimeLab(pool);
    expect(new Set(rows.map((r) => r.timestamptzInstant)).size).toBe(1);
    expect(new Set(rows.map((r) => r.timestampInstant)).size).toBe(rows.length);
  });
});

describe('Q18 · Q19. schedules', () => {
  it('시드 회차 2개가 서울 시각 그대로의 순간으로 저장된다', async () => {
    const { rows } = await pool.query(`
      SELECT to_char(starts_at AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI') AS seoul,
             pg_typeof(starts_at)::text AS type
      FROM schedules ORDER BY starts_at
    `);
    expect(rows).toEqual([
      { seoul: '12-24 19:00', type: 'timestamp with time zone' },
      { seoul: '12-25 18:00', type: 'timestamp with time zone' },
    ]);
  });
});

describe('Q22. 복합 인덱스 순서', () => {
  it('앞 컬럼으로 찾는 질문만 인덱스를 쓴다. concert_id가 앞이면 FK 검사도 빠르다', async () => {
    const { runIndexOrderLab } = await import('../indexOrderLab');
    const results: Record<string, import('../indexOrderLab').OrderVariantResult> = {};
    await runIndexOrderLab(pool, { rows: 100_000 }, () => {}, (r) => (results[r.variant] = r));
    const plan = (m: { plan: unknown }) => JSON.stringify(m.plan);
    const concertFirst = results['concert-first'];
    const timeFirst = results['time-first'];
    const plus = results['time-first-plus'];

    expect(plan(concertFirst.byConcert)).not.toMatch(/Seq Scan/);
    expect(plan(concertFirst.byDay)).toMatch(/Seq Scan/);
    expect(plan(timeFirst.byConcert)).toMatch(/Seq Scan/);
    expect(plan(timeFirst.byDay)).not.toMatch(/Seq Scan/);
    expect(plan(plus.byConcert)).not.toMatch(/Seq Scan/);
    expect(timeFirst.fkCheckMs).toBeGreaterThan(concertFirst.fkCheckMs * 3);
    expect(plus.indexes.map((i) => i.kind)).toEqual(['pk', 'unique', 'concert']);
  });
});

describe('Q23 · Q24. 예매 오픈 시각', () => {
  it('회차마다 예매 오픈 시각이 있고, 모두 공연 시작보다 앞선다', async () => {
    const { rows } = await pool.query(`
      SELECT to_char(starts_at AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI') AS starts,
             to_char(booking_opens_at AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI') AS opens
      FROM schedules ORDER BY starts_at
    `);
    expect(rows).toEqual([
      { starts: '12-24 19:00', opens: '10-01 20:00' },
      { starts: '12-25 18:00', opens: '10-08 20:00' },
    ]);
  });
});

describe('Q20 · Q21 · Q22. 결정 반영', () => {
  it('schedules에 UNIQUE (concert_id, starts_at)가 있고, concert_id만의 인덱스는 따로 없다', async () => {
    const schedules = (await introspectSchema(pool, SCHEMA)).find((t) => t.name === 'schedules');
    expect(schedules?.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'UNIQUE', columns: ['concert_id', 'starts_at'] }),
      ]),
    );
    const preview = await previewTable(pool, SCHEMA, 'schedules');
    // schedules_id_concert_uq(Q36)는 id가 앞이라 concert_id만으로 찾는 인덱스가 아니다
    expect(preview?.indexes.map((i) => i.name).sort()).toEqual([
      'schedules_concert_starts_uq',
      'schedules_id_concert_uq',
      'schedules_pkey',
    ]);
  });
});

describe('Q25 – Q30. grades', () => {
  it('스터디 콘서트의 등급 3개가 있고, UNIQUE (concert_id, name)이 FK 인덱스를 겸한다', async () => {
    const { rows } = await pool.query(`
      SELECT g.name, g.color, g.sort_order FROM grades g JOIN concerts c ON c.id = g.concert_id
      WHERE c.title = '스터디 콘서트' ORDER BY g.sort_order
    `);
    expect(rows).toEqual([
      { name: 'VIP', color: 'red', sort_order: 10 },
      { name: 'R', color: 'green', sort_order: 20 },
      { name: 'S', color: 'blue', sort_order: 30 },
    ]);

    const grades = (await introspectSchema(pool, SCHEMA)).find((t) => t.name === 'grades');
    expect(grades?.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'UNIQUE', columns: ['concert_id', 'name'] }),
        expect.objectContaining({ kind: 'FOREIGN KEY', columns: ['concert_id'], refTable: 'concerts' }),
      ]),
    );
    const preview = await previewTable(pool, SCHEMA, 'grades');
    expect(preview?.indexes.map((i) => i.name).sort()).toEqual([
      'grades_concert_name_uq',
      'grades_concert_sort_uq',
      'grades_id_concert_uq',
      'grades_pkey',
    ]);
  });
});

describe('Q28 · Q29. 등급 색은 팔레트 키', () => {
  it('DB의 CHECK 목록과 프론트엔드 팔레트의 키가 같다', async () => {
    const { GRADE_COLORS } = await import('../gradePalette');
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = $1 AND c.conname = 'grades_color_check'`,
      [SCHEMA],
    );
    // 예: CHECK (((color)::text = ANY ((ARRAY['red'::character varying, ...])::text[])))
    const keys = [...(rows[0].def as string).matchAll(/'([^']+)'::/g)].map((m) => m[1]);
    expect([...keys].sort()).toEqual([...GRADE_COLORS].sort());
  });

  it('팔레트의 모든 색은 밝은 · 어두운 배경 모두에서 3:1 이상 대비가 난다', async () => {
    const { GRADE_PALETTE } = await import('../gradePalette');
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    // styles.css의 --surface (밝은 화면 · 어두운 화면)
    for (const { light, dark } of Object.values(GRADE_PALETTE)) {
      expect(contrast(light, '#ffffff')).toBeGreaterThanOrEqual(3);
      expect(contrast(dark, '#161a20')).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Q30 · Q31. 등급 순서 미루기', () => {
  /** 임시 테이블에 행을 주어진 순서로 저장한 뒤, 2 이상을 한 칸씩 미루는 UPDATE를 보낸다 */
  async function shift(stored: number[], deferrable: boolean) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TEMP TABLE lab_sort (
          sort_order INTEGER NOT NULL CHECK (sort_order > 0),
          UNIQUE (sort_order) ${deferrable ? 'DEFERRABLE INITIALLY IMMEDIATE' : ''}
        ) ON COMMIT DROP
      `);
      for (const n of stored) await client.query(`INSERT INTO lab_sort VALUES ($1)`, [n]);
      await client.query(`UPDATE lab_sort SET sort_order = sort_order + 1 WHERE sort_order >= 2`);
      return 'ok';
    } catch (err) {
      return (err as { code?: string }).code;
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  it('일반 UNIQUE는 행마다 검사해서, 같은 UPDATE가 행이 저장된 순서에 따라 실패하거나 성공한다', async () => {
    expect(await shift([1, 2, 3], false)).toBe('23505');
    expect(await shift([3, 2, 1], false)).toBe('ok');
  });

  it('DEFERRABLE UNIQUE는 문장이 끝난 뒤 검사해서 저장 순서와 상관없이 성공한다', async () => {
    expect(await shift([1, 2, 3], true)).toBe('ok');
  });

  it('드물게 번호를 다시 매길 때: 큰 값으로 옮겼다가 내리면 CHECK (> 0)과 일반 UNIQUE를 지키며 성공한다', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TEMP TABLE lab_sort (name TEXT, sort_order INTEGER NOT NULL CHECK (sort_order > 0) UNIQUE)
        ON COMMIT DROP
      `);
      // 간격이 바닥난 상태: VIP 10, SR 11, R 12, S 13 (저장 순서도 그대로)
      for (const [name, n] of [['VIP', 10], ['SR', 11], ['R', 12], ['S', 13]] as const) {
        await client.query(`INSERT INTO lab_sort VALUES ($1, $2)`, [name, n]);
      }
      // 1단계: 지금 값과 절대 겹치지 않는 큰 값으로 옮긴다. 2단계: 10 간격으로 내린다
      await client.query(`
        UPDATE lab_sort s SET sort_order = 1000000 + r.rank * 10
        FROM (SELECT name, row_number() OVER (ORDER BY sort_order) AS rank FROM lab_sort) r
        WHERE r.name = s.name
      `);
      await client.query(`UPDATE lab_sort SET sort_order = sort_order - 1000000`);
      const { rows } = await client.query(`SELECT name, sort_order FROM lab_sort ORDER BY sort_order`);
      expect(rows).toEqual([
        { name: 'VIP', sort_order: 10 },
        { name: 'SR', sort_order: 20 },
        { name: 'R', sort_order: 30 },
        { name: 'S', sort_order: 40 },
      ]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

describe('Q32 · Q33. schedule_seats', () => {
  it('회차를 만들 때 좌석 수만큼 미리 만든다: 회차 2개 × 1,000석 = 2,000행, 등급은 같은 공연의 것', async () => {
    const { rows } = await pool.query(`
      SELECT count(*)::int AS total,
             count(DISTINCT ss.schedule_id)::int AS schedules,
             count(*) FILTER (WHERE g.concert_id <> sc.concert_id)::int AS other_concert_grade
      FROM schedule_seats ss
      JOIN schedules sc ON sc.id = ss.schedule_id
      JOIN grades g ON g.id = ss.grade_id
    `);
    expect(rows[0]).toEqual({ total: 2000, schedules: 2, other_concert_grade: 0 });
  });

  it('UNIQUE (schedule_id, seat_id)이 좌석맵 조회와 회차 FK 검사를 겸하고, 나머지 FK에는 인덱스를 두지 않는다 (Q37)', async () => {
    const preview = await previewTable(pool, SCHEMA, 'schedule_seats');
    expect(preview?.indexes.map((i) => i.name).sort()).toEqual(['schedule_seats_pkey', 'schedule_seats_schedule_seat_uq']);
    const schedules = (await introspectSchema(pool, SCHEMA)).find((t) => t.name === 'schedule_seats');
    expect(schedules?.constraints).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'UNIQUE', columns: ['schedule_id', 'seat_id'] })]),
    );
  });
});

describe('Q34. 좌석 상태 ENUM', () => {
  it('회차를 만들면 모든 좌석이 예약 가능(available)으로 시작한다', async () => {
    const { rows } = await pool.query(`SELECT status::text, count(*)::int AS n FROM schedule_seats GROUP BY status`);
    expect(rows).toEqual([{ status: 'available', n: 2000 }]);
  });

  it('ENUM은 선언한 순서로 정렬되고, 값을 뺄 수 없고, 새 값은 커밋 전에 쓸 수 없다', async () => {
    const { rows } = await pool.query(`SELECT enum_range(NULL::seat_status)::text AS values`);
    expect(rows[0].values).toBe('{available,held,sold}');

    const client = await pool.connect();
    const codeOf = async (sql: string) => {
      await client.query('SAVEPOINT s');
      try {
        await client.query(sql);
        return 'ok';
      } catch (err) {
        return (err as { code?: string }).code;
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT s');
      }
    };
    try {
      await client.query('BEGIN');
      expect(await codeOf(`ALTER TYPE seat_status DROP VALUE 'held'`)).toBe('0A000');
      await client.query(`ALTER TYPE seat_status ADD VALUE 'blocked'`);
      expect(await codeOf(`SELECT 'blocked'::seat_status`)).toBe('55P04');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

describe('Q35 · Q36. 복합 FK', () => {
  it('회차 좌석의 FK 넷이 concert_id · venue_id를 함께 써서 같은 공연 · 같은 공연장을 강제한다', async () => {
    const table = (await introspectSchema(pool, SCHEMA)).find((t) => t.name === 'schedule_seats');
    const fks = table?.constraints
      .filter((c) => c.kind === 'FOREIGN KEY')
      .map((c) => `${c.columns.join(',')}>${c.refTable}(${c.refColumns.join(',')})`)
      .sort();
    expect(fks).toEqual([
      'concert_id,venue_id>concerts(id,venue_id)',
      'grade_id,concert_id>grades(id,concert_id)',
      'schedule_id,concert_id>schedules(id,concert_id)',
      'seat_id,venue_id>seats(id,venue_id)',
    ]);
  });

  it('시드의 복사본은 원본과 모두 같다', async () => {
    const { rows } = await pool.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE ss.concert_id = sc.concert_id AND g.concert_id = sc.concert_id
                                AND ss.venue_id = c.venue_id AND se.venue_id = c.venue_id)::int AS consistent
      FROM schedule_seats ss
      JOIN schedules sc ON sc.id = ss.schedule_id
      JOIN concerts c ON c.id = sc.concert_id
      JOIN grades g ON g.id = ss.grade_id
      JOIN seats se ON se.id = ss.seat_id
    `);
    expect(rows[0]).toEqual({ total: 2000, consistent: 2000 });
  });
});

describe('Q40. 숫자 타입과 가격', () => {
  it('REAL은 합계 · 큰 값에서, DOUBLE은 소수 덧셈에서 틀리고, INTEGER는 큰 곱셈에서 넘치고, MONEY는 달러로 보인다', async () => {
    const { runNumberLab } = await import('../numberLab');
    const rows = await runNumberLab(pool);
    const cell = (id: string, type: string) => rows.find((r) => r.id === id)!.cells.find((c) => c.type === type)!;

    expect(cell('sum', 'real').ok).toBe(false);
    expect(cell('large', 'real').ok).toBe(false);
    expect(cell('tenths', 'double precision').ok).toBe(false);
    expect(cell('multiply', 'integer').code).toBe('22003');
    expect(cell('multiply', 'bigint').ok).toBe(true);
    expect(cell('display', 'money').shown).toMatch(/^\$/);
    for (const id of ['sum', 'tenths', 'large', 'multiply', 'display']) expect(cell(id, 'numeric').ok).toBe(true);
  });

  it('시드: 회차 2개 × 등급 3개 = 가격 6행, 회차마다 다를 수 있다', async () => {
    const { rows } = await pool.query(`
      SELECT to_char(sc.starts_at AT TIME ZONE 'Asia/Seoul', 'MM-DD') AS day, g.name, p.price
      FROM schedule_grade_prices p
      JOIN schedules sc ON sc.id = p.schedule_id
      JOIN grades g ON g.id = p.grade_id
      ORDER BY sc.starts_at, g.sort_order
    `);
    expect(rows.map((r) => `${r.day} ${r.name} ${r.price}`)).toEqual([
      '12-24 VIP 165000',
      '12-24 R 143000',
      '12-24 S 121000',
      '12-25 VIP 176000',
      '12-25 R 154000',
      '12-25 S 132000',
    ]);
  });
});

describe('Q41. 가격도 같은 공연의 회차 · 등급만', () => {
  it('가격 테이블의 FK 둘이 concert_id를 함께 쓰고, 시드 6행의 복사본이 원본과 같다', async () => {
    const table = (await introspectSchema(pool, SCHEMA)).find((t) => t.name === 'schedule_grade_prices');
    const fks = table?.constraints
      .filter((c) => c.kind === 'FOREIGN KEY')
      .map((c) => `${c.columns.join(',')}>${c.refTable}(${c.refColumns.join(',')})`)
      .sort();
    expect(fks).toEqual(['grade_id,concert_id>grades(id,concert_id)', 'schedule_id,concert_id>schedules(id,concert_id)']);

    const { rows } = await pool.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE p.concert_id = sc.concert_id AND g.concert_id = sc.concert_id)::int AS consistent
      FROM schedule_grade_prices p
      JOIN schedules sc ON sc.id = p.schedule_id
      JOIN grades g ON g.id = p.grade_id
    `);
    expect(rows[0]).toEqual({ total: 6, consistent: 6 });
  });
});

describe('Q42. 가격 없는 좌석은 애플리케이션이 점검', () => {
  it('DB는 막지 않고, 판매 전 점검 쿼리가 가격 없는 (회차, 등급)을 찾아낸다', async () => {
    expect((await pool.query(UNPRICED_SEATS_SQL)).rows).toEqual([]);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: grade } = await client.query(`
        INSERT INTO grades (concert_id, name, color, sort_order)
        SELECT concert_id, 'VIP 시야제한', 'gray', 40 FROM grades ORDER BY id LIMIT 1
        RETURNING id`);
      // 좌석부터 깔고 가격은 나중에 정하는 순서가 DB에서 허용된다
      const { rows: seats } = await client.query(
        `UPDATE schedule_seats SET grade_id = $1
         WHERE id IN (SELECT id FROM schedule_seats WHERE schedule_id = (SELECT min(id) FROM schedules) ORDER BY id LIMIT 4)
         RETURNING schedule_id`,
        [grade[0].id],
      );
      const { rows: found } = await client.query(UNPRICED_SEATS_SQL);
      expect(found).toEqual([{ schedule_id: seats[0].schedule_id, grade_id: grade[0].id, seats: 4 }]);

      // 오픈 전에 가격을 매기면 점검을 통과한다
      await client.query(
        `INSERT INTO schedule_grade_prices (schedule_id, grade_id, concert_id, price)
         SELECT $1, id, concert_id, 132000 FROM grades WHERE id = $2`,
        [seats[0].schedule_id, grade[0].id],
      );
      expect((await client.query(UNPRICED_SEATS_SQL)).rows).toEqual([]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
