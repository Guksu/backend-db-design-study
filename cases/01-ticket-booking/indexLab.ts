import type pg from 'pg';
import { toPlanNode, type PlanNode } from '../../lab/plan';

export type { PlanNode };

/**
 * Q16 실험: concerts.venue_id에 인덱스가 있을 때와 없을 때를 같은 데이터로 비교한다.
 * 실험용 테이블(lab_ix_*)을 만들고 끝나면 지운다. 실제 concerts에는 손대지 않는다.
 */

export type IndexVariant = 'no-index' | 'index';
export interface VariantResult {
  variant: IndexVariant;
  /** 행 N개를 한 번에 넣는 데 걸린 시간 */
  insertMs: number;
  tableBytes: number;
  /** venue_id 인덱스 크기. 인덱스가 없으면 null */
  venueIndexBytes: number | null;
  /** PK 인덱스 크기. 두 변형 모두 있다 */
  pkIndexBytes: number;
  /** "이 공연장의 공연 목록" 조회. 여러 공연장으로 돌린 실행 시간의 중앙값 */
  select: { ms: number; rows: number; plan: PlanNode; sql: string };
  /** 공연이 하나도 없는 공연장을 지울 때, FK를 지키려고 concerts를 확인하는 시간 */
  deleteParent: { ms: number; fkCheckMs: number };
}

export interface SizeResult {
  rows: number;
  venues: number;
  noIndex: VariantResult;
  index: VariantResult;
}

export interface IndexLabOptions {
  sizes: number[];
  venues: number;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

async function runVariant(
  client: pg.PoolClient,
  variant: IndexVariant,
  rows: number,
  venues: number,
): Promise<VariantResult> {
  const suffix = variant === 'index' ? 'idx' : 'noidx';
  const venueTable = `lab_ix_venues_${suffix}`;
  const concertTable = `lab_ix_concerts_${suffix}`;
  const venueIndex = `${concertTable}_venue_id_idx`;

  await client.query(`DROP TABLE IF EXISTS ${concertTable}, ${venueTable}`);
  await client.query(`
    CREATE TABLE ${venueTable} (
      id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name VARCHAR(50) NOT NULL
    );
    CREATE TABLE ${concertTable} (
      id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      venue_id BIGINT       NOT NULL REFERENCES ${venueTable} (id),
      title    VARCHAR(100) NOT NULL
    );
  `);
  // 마지막 공연장(venues + 1)에는 공연을 넣지 않는다. 삭제 실험용
  await client.query(
    `INSERT INTO ${venueTable} (name) SELECT '공연장 ' || g FROM generate_series(1, $1) g`,
    [venues + 1],
  );
  if (variant === 'index') {
    await client.query(`CREATE INDEX ${venueIndex} ON ${concertTable} (venue_id)`);
  }

  // 쓰기 비용: 인덱스가 있으면 행마다 인덱스도 함께 갱신해야 한다.
  // 작은 크기는 한 번 재면 흔들림이 커서 세 번 넣고(사이사이 비움) 중앙값을 쓴다
  const insertOnce = async () => {
    const start = performance.now();
    await client.query(
      `INSERT INTO ${concertTable} (venue_id, title)
       SELECT 1 + (g % $2), '공연 ' || g FROM generate_series(1, $1) g`,
      [rows, venues],
    );
    return performance.now() - start;
  };
  const repeats = rows <= 100_000 ? 3 : 1;
  const insertTimes: number[] = [];
  for (let i = 0; i < repeats; i++) {
    if (i > 0) await client.query(`TRUNCATE ${concertTable}`);
    insertTimes.push(await insertOnce());
  }
  const insertMs = median(insertTimes);
  await client.query(`VACUUM ANALYZE ${concertTable}`);

  const { rows: sizeRows } = await client.query(
    // to_regclass는 인덱스가 없으면 NULL을 돌려준다
    `SELECT pg_relation_size($1::regclass) AS "table",
            pg_relation_size($2::regclass) AS pk,
            pg_relation_size(to_regclass($3)) AS venue`,
    [concertTable, `${concertTable}_pkey`, venueIndex],
  );

  // 읽기: 공연장 다섯 곳의 공연 목록. 한 번 데워 두고 중앙값을 쓴다
  const venueIds = [1, Math.ceil(venues / 4), Math.ceil(venues / 2), Math.ceil((venues * 3) / 4), venues];
  const sqlFor = (id: number) => `SELECT id, title FROM ${concertTable} WHERE venue_id = ${id}`;
  await client.query(sqlFor(venueIds[0]));
  const selects = [];
  for (const id of venueIds) {
    const { rows: explain } = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sqlFor(id)}`,
    );
    const result = explain[0]['QUERY PLAN'][0];
    selects.push({
      ms: result['Execution Time'] as number,
      plan: toPlanNode(result.Plan),
      rows: result.Plan['Actual Rows'] as number,
    });
  }
  const selectMs = median(selects.map((s) => s.ms));
  // 계획은 두 변형 모두 가운데 공연장의 것을 보여 준다. 화면에서 같은 SQL로 나란히 비교하기 위함
  const representative = selects[2];

  // 부모 삭제: 공연이 없는 공연장을 지운다. DB는 FK 때문에 concerts에 참조하는 행이 있는지 찾아야 한다
  await client.query('BEGIN');
  const { rows: deleteExplain } = await client.query(
    `EXPLAIN (ANALYZE, FORMAT JSON) DELETE FROM ${venueTable} WHERE id = ${venues + 1}`,
  );
  await client.query('ROLLBACK');
  const deleteResult = deleteExplain[0]['QUERY PLAN'][0];
  const fkCheckMs = (deleteResult.Triggers ?? [])
    .filter((t: { 'Constraint Name'?: string }) => t['Constraint Name'])
    .reduce((sum: number, t: { Time: number }) => sum + t.Time, 0);

  await client.query(`DROP TABLE IF EXISTS ${concertTable}, ${venueTable}`);

  return {
    variant,
    insertMs,
    tableBytes: Number(sizeRows[0].table),
    pkIndexBytes: Number(sizeRows[0].pk),
    venueIndexBytes: sizeRows[0].venue === null ? null : Number(sizeRows[0].venue),
    select: { ms: selectMs, rows: representative.rows, plan: representative.plan, sql: sqlFor(venueIds[2]) },
    deleteParent: { ms: deleteResult['Execution Time'], fkCheckMs },
  };
}

export async function runIndexLab(
  pool: pg.Pool,
  { sizes, venues }: IndexLabOptions,
  onResult: (result: SizeResult) => void,
): Promise<void> {
  const client = await pool.connect();
  try {
    // 예열: 처음 도는 변형만 차가운 캐시에서 시작해 손해 보지 않도록 한 번 미리 써 본다
    await client.query(`
      CREATE TEMP TABLE lab_ix_warmup AS SELECT g AS id, '공연 ' || g AS title FROM generate_series(1, 50000) g;
      DROP TABLE lab_ix_warmup;
    `);
    for (const rows of sizes) {
      const noIndex = await runVariant(client, 'no-index', rows, venues);
      const index = await runVariant(client, 'index', rows, venues);
      onResult({ rows, venues, noIndex, index });
    }
  } finally {
    await client.query(`DROP TABLE IF EXISTS lab_ix_concerts_noidx, lab_ix_venues_noidx, lab_ix_concerts_idx, lab_ix_venues_idx`);
    client.release();
  }
}
