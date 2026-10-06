import type pg from 'pg';
import { toPlanNode, type PlanNode } from '../../lab/plan';

/**
 * Q22 실험: 회차 UNIQUE의 컬럼 순서가 조회 · FK 검사 · 쓰기에 어떤 차이를 만드는지 비교한다.
 * 같은 회차 데이터를 구성만 다른 실험용 테이블 세 개(lab_ord_*)에 넣고 끝나면 지운다.
 * 실제 schedules에는 손대지 않는다.
 */

export type OrderVariant = 'concert-first' | 'time-first' | 'time-first-plus';

export const ORDER_VARIANTS: { id: OrderVariant; label: string; ddl: string[] }[] = [
  {
    id: 'concert-first',
    label: 'UNIQUE (concert_id, starts_at)',
    ddl: ['UNIQUE (concert_id, starts_at)'],
  },
  {
    id: 'time-first',
    label: 'UNIQUE (starts_at, concert_id)',
    ddl: ['UNIQUE (starts_at, concert_id)'],
  },
  {
    id: 'time-first-plus',
    label: 'UNIQUE (starts_at, concert_id) + INDEX (concert_id)',
    ddl: ['UNIQUE (starts_at, concert_id)', 'INDEX (concert_id)'],
  },
];

/** 공연마다 회차 수. 회차 N행 = 공연 N/5개 */
export const SCHEDULES_PER_CONCERT = 5;
/** 공연 시작일을 이 기간(일)에 고르게 퍼뜨린다. 약 5년 */
const SPAN_DAYS = 1826;
const BASE = '2025-01-01 00:00+09';

export interface QueryMeasure {
  /** 다섯 번 다른 값으로 돌린 실행 시간의 중앙값 */
  ms: number;
  /** 읽은 8KB 페이지 수 (shared hit + read) */
  pages: number;
  rows: number;
  plan: PlanNode;
  sql: string;
}

export interface IndexSize {
  kind: 'pk' | 'unique' | 'concert';
  columns: string;
  bytes: number;
}

export interface OrderVariantResult {
  variant: OrderVariant;
  /** 모든 회차를 한 번에 넣는 시간 (인덱스가 많을수록 행마다 갱신할 곳이 는다) */
  insertMs: number;
  tableBytes: number;
  indexes: IndexSize[];
  /** 이 공연의 회차 목록: WHERE concert_id = ? ORDER BY starts_at */
  byConcert: QueryMeasure;
  /** 하루에 열리는 모든 회차: WHERE starts_at이 그날 ORDER BY starts_at */
  byDay: QueryMeasure;
  /** 회차가 없는 공연을 지울 때 FK를 지키려고 회차 테이블을 확인하는 시간 */
  fkCheckMs: number;
}

/** 정렬 순서 그림용: 시작일이 하루씩 어긋나 회차가 겹치는 공연 세 개의 실제 행 */
export interface OrderSample {
  concertIds: number[];
  /** 세 공연이 모두 회차를 여는 날 (서울 기준 YYYY-MM-DD) */
  day: string;
  rows: { concertId: number; startsAt: string; day: string }[];
}

export interface OrderLabStart {
  rows: number;
  concerts: number;
  sample: OrderSample;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const tableOf = (variant: OrderVariant) => `lab_ord_schedules_${variant.replaceAll('-', '_')}`;
const parentOf = (variant: OrderVariant) => `lab_ord_concerts_${variant.replaceAll('-', '_')}`;

async function explain(client: pg.PoolClient, sql: string) {
  const { rows } = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
  const result = rows[0]['QUERY PLAN'][0];
  const plan = toPlanNode(result.Plan);
  return {
    ms: result['Execution Time'] as number,
    pages: plan.sharedHit + plan.sharedRead,
    rows: plan.actualRows,
    plan,
  };
}

/** 같은 SQL을 값만 바꿔 다섯 번 돌린다. 계획은 가운데 값의 것을 보여 준다 */
async function measure(client: pg.PoolClient, sqlFor: (i: number) => string): Promise<QueryMeasure> {
  await client.query(sqlFor(0));
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(await explain(client, sqlFor(i)));
  const middle = runs[2];
  return { ms: median(runs.map((r) => r.ms)), pages: middle.pages, rows: middle.rows, plan: middle.plan, sql: sqlFor(2) };
}

async function runVariant(
  client: pg.PoolClient,
  variant: OrderVariant,
  concerts: number,
  concertIds: number[],
  days: string[],
): Promise<OrderVariantResult> {
  const table = tableOf(variant);
  const parent = parentOf(variant);
  const def = ORDER_VARIANTS.find((v) => v.id === variant)!;

  await client.query(`DROP TABLE IF EXISTS ${table}, ${parent}`);
  await client.query(`CREATE TABLE ${parent} (id BIGINT PRIMARY KEY)`);
  // 마지막 공연(concerts + 1)에는 회차를 넣지 않는다. 삭제 실험용
  await client.query(`INSERT INTO ${parent} SELECT generate_series(1, $1)`, [concerts + 1]);
  const unique = def.ddl.find((d) => d.startsWith('UNIQUE'))!;
  await client.query(`
    CREATE TABLE ${table} (
      id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      concert_id BIGINT      NOT NULL REFERENCES ${parent} (id),
      starts_at  TIMESTAMPTZ NOT NULL,
      CONSTRAINT ${table}_uq ${unique}
    )
  `);
  if (def.ddl.includes('INDEX (concert_id)')) {
    await client.query(`CREATE INDEX ${table}_concert_idx ON ${table} (concert_id)`);
  }

  // 작은 크기는 한 번 재면 흔들림이 커서 세 번 넣고(사이사이 비움) 가장 빠른 값을 쓴다. 방해(체크포인트 등)를 덜 받은 값이다
  const insertTimes: number[] = [];
  for (let i = 0; i < (concerts * SCHEDULES_PER_CONCERT <= 100_000 ? 3 : 1); i++) {
    if (i > 0) await client.query(`TRUNCATE ${table}`);
    const start = performance.now();
    await client.query(`INSERT INTO ${table} (concert_id, starts_at) SELECT concert_id, starts_at FROM lab_ord_src`);
    insertTimes.push(performance.now() - start);
  }
  const insertMs = Math.min(...insertTimes);
  await client.query(`VACUUM ANALYZE ${table}`);

  const { rows: sizeRows } = await client.query(
    `SELECT pg_relation_size($1::regclass) AS bytes,
            (SELECT json_agg(json_build_object(
                      'name', i.indexrelid::regclass::text,
                      'columns', (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
                                  FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
                                  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum),
                      'primary', i.indisprimary,
                      'unique', i.indisunique,
                      'bytes', pg_relation_size(i.indexrelid)))
             FROM pg_index i WHERE i.indrelid = $1::regclass) AS indexes`,
    [table],
  );
  const indexes: IndexSize[] = (sizeRows[0].indexes as { columns: string; primary: boolean; unique: boolean; bytes: number }[])
    .map((i) => ({
      kind: i.primary ? ('pk' as const) : i.unique ? ('unique' as const) : ('concert' as const),
      columns: `(${i.columns})`,
      bytes: Number(i.bytes),
    }))
    .sort((a, b) => ['pk', 'unique', 'concert'].indexOf(a.kind) - ['pk', 'unique', 'concert'].indexOf(b.kind));

  const byConcert = await measure(
    client,
    (i) => `SELECT id, starts_at FROM ${table} WHERE concert_id = ${concertIds[i]} ORDER BY starts_at`,
  );
  const byDay = await measure(
    client,
    (i) =>
      `SELECT id, concert_id, starts_at FROM ${table} WHERE starts_at >= '${days[i]} 00:00+09' AND starts_at < '${days[i]} 00:00+09'::timestamptz + interval '1 day' ORDER BY starts_at`,
  );

  // 부모 삭제: 회차가 없는 공연을 지운다. DB는 FK 때문에 회차 테이블에 참조하는 행이 있는지 찾아야 한다
  await client.query('BEGIN');
  const { rows: deleteExplain } = await client.query(
    `EXPLAIN (ANALYZE, FORMAT JSON) DELETE FROM ${parent} WHERE id = ${concerts + 1}`,
  );
  await client.query('ROLLBACK');
  const fkCheckMs = (deleteExplain[0]['QUERY PLAN'][0].Triggers ?? [])
    .filter((t: { 'Constraint Name'?: string }) => t['Constraint Name'])
    .reduce((sum: number, t: { Time: number }) => sum + t.Time, 0);

  await client.query(`DROP TABLE IF EXISTS ${table}, ${parent}`);

  return { variant, insertMs, tableBytes: Number(sizeRows[0].bytes), indexes, byConcert, byDay, fkCheckMs };
}

export async function runIndexOrderLab(
  pool: pg.Pool,
  { rows }: { rows: number },
  onStart: (start: OrderLabStart) => void,
  onVariant: (result: OrderVariantResult) => void,
): Promise<void> {
  const concerts = Math.floor(rows / SCHEDULES_PER_CONCERT);
  const client = await pool.connect();
  try {
    // 공연 c는 5년 중 (c 비율)번째 날부터 5일 연속 공연한다. 시작 시각은 공연마다 14 · 17 · 19 · 20시 중 하나
    await client.query(`DROP TABLE IF EXISTS lab_ord_src`);
    await client.query(
      `CREATE UNLOGGED TABLE lab_ord_src AS
       SELECT c AS concert_id,
              timestamptz '${BASE}'
                + make_interval(days => (c::bigint * ${SPAN_DAYS} / $1)::int + k,
                                hours => (ARRAY[14, 17, 19, 20])[1 + c % 4]) AS starts_at
       FROM generate_series(1, $1) c, generate_series(0, ${SCHEDULES_PER_CONCERT - 1}) k`,
      [concerts],
    );

    // 그림용 표본: 시작일이 하루씩 어긋난 공연 세 개
    const perDay = concerts / SPAN_DAYS;
    const first = Math.floor(concerts / 2);
    const sampleIds = [0, 1, 2].map((i) => first + Math.round(i * perDay));
    const { rows: sampleRows } = await client.query(
      `SELECT concert_id::int AS "concertId",
              to_char(starts_at AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI') AS "startsAt",
              to_char(starts_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS day
       FROM lab_ord_src WHERE concert_id = ANY($1) ORDER BY concert_id, starts_at`,
      [sampleIds],
    );
    const dayCounts = new Map<string, Set<number>>();
    for (const r of sampleRows) dayCounts.set(r.day, (dayCounts.get(r.day) ?? new Set()).add(r.concertId));
    const sharedDay = [...dayCounts].find(([, ids]) => ids.size === sampleIds.length)?.[0] ?? sampleRows[0].day;
    onStart({ rows: concerts * SCHEDULES_PER_CONCERT, concerts, sample: { concertIds: sampleIds, day: sharedDay, rows: sampleRows } });

    // 조회에 쓸 값: 공연 다섯 곳, 날짜 다섯 날 (모두 데이터 가운데쯤)
    const concertIds = [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => Math.round(concerts * f));
    const { rows: dayRows } = await client.query(
      `SELECT to_char(timestamptz '${BASE}' AT TIME ZONE 'Asia/Seoul' + make_interval(days => d), 'YYYY-MM-DD') AS day
       FROM unnest($1::int[]) d`,
      [[0.2, 0.35, 0.5, 0.65, 0.8].map((f) => Math.round(SPAN_DAYS * f))],
    );
    const days = dayRows.map((r) => r.day as string);

    // 예열: 처음 도는 변형만 차가운 캐시에서 손해 보지 않도록 원본을 한 번 읽어 둔다
    await client.query(`SELECT count(*) FROM lab_ord_src`);
    for (const v of ORDER_VARIANTS) onVariant(await runVariant(client, v.id, concerts, concertIds, days));
  } finally {
    await client.query(
      `DROP TABLE IF EXISTS lab_ord_src, ${ORDER_VARIANTS.flatMap((v) => [tableOf(v.id), parentOf(v.id)]).join(', ')}`,
    );
    client.release();
  }
}
