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

describe('Q20 · Q21 · Q22. 결정 반영', () => {
  it('schedules에 UNIQUE (concert_id, starts_at)가 있고, concert_id만의 인덱스는 따로 없다', async () => {
    const schedules = (await introspectSchema(pool, SCHEMA)).find((t) => t.name === 'schedules');
    expect(schedules?.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'UNIQUE', columns: ['concert_id', 'starts_at'] }),
      ]),
    );
    const preview = await previewTable(pool, SCHEMA, 'schedules');
    expect(preview?.indexes.map((i) => i.name).sort()).toEqual(['schedules_concert_starts_uq', 'schedules_pkey']);
  });
});
