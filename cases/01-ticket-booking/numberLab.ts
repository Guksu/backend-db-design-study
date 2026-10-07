import type pg from 'pg';

/**
 * Q40 실험: 가격을 담을 숫자 타입마다 같은 계산을 시켜 보고, 결과가 정확한지 비교한다.
 * 테이블을 만들지 않고 값만 계산한다.
 */

export const NUMBER_TYPES = ['integer', 'bigint', 'numeric', 'real', 'double precision', 'money'] as const;
export type NumberType = (typeof NUMBER_TYPES)[number];

/**
 * 계산 결과가 정답과 정확히 같은가. 실수 타입은 float8끼리 비교한다.
 * numeric으로 바꾸면 15자리에서 반올림돼 0.9999999999999999가 1로 보이기 때문이다
 */
const equals = (expr: string, type: NumberType, answer: string) =>
  type === 'real' || type === 'double precision'
    ? `(${expr})::float8 = ${answer}::float8`
    : `(${expr})::numeric = ${answer}`;

/** 실수 타입은 화면 표시(9.990131e+07)가 실제 값을 가린다. float8을 거쳐 실제로 담긴 정수를 꺼낸다 */
const actual = (expr: string, type: NumberType) =>
  type === 'real' || type === 'double precision' ? `(${expr})::float8::numeric::text` : 'NULL';

interface ExperimentDef {
  id: string;
  label: string;
  /** 정답. 화면에 "기대"로 보여 준다 */
  expected: string;
  /** 판정이 없는 줄 (크기처럼 참고용) */
  informational?: boolean;
  /** 이 타입으로는 해 볼 수 없는 실험이면 null. shown(보이는 값)과 ok(정답과 같은지)를 돌려주는 SQL */
  sql: (type: NumberType) => string | null;
}

const isInteger = (type: NumberType) => type === 'integer' || type === 'bigint';

export const NUMBER_EXPERIMENTS: ExperimentDef[] = [
  {
    id: 'sum',
    label: '99,900원 티켓 1,000장 매출 합계',
    expected: '99,900,000',
    sql: (t) => `
      WITH x AS (SELECT sum(99900::${t}) AS v FROM generate_series(1, 1000))
      SELECT v::text AS shown, ${equals('v', t, '99900000')} AS ok, ${actual('v', t)} AS actual FROM x`,
  },
  {
    id: 'tenths',
    label: '0.1원을 10번 더하기 (수수료 · 할인 계산처럼 소수가 생길 때)',
    expected: '1',
    sql: (t) =>
      isInteger(t)
        ? null
        : `
      WITH x AS (SELECT sum(0.1::${t}) AS v FROM generate_series(1, 10))
      SELECT v::text AS shown, ${equals('v', t, '1')} AS ok FROM x`,
  },
  {
    id: 'large',
    label: '16,777,217원을 저장했다가 읽기',
    expected: '16,777,217',
    sql: (t) =>
      `SELECT 16777217::${t}::text AS shown, ${equals(`16777217::${t}`, t, '16777217')} AS ok, ${actual(`16777217::${t}`, t)} AS actual`,
  },
  {
    id: 'multiply',
    label: '165,000원 × 20,000장 곱하기',
    expected: '3,300,000,000',
    sql: (t) => `SELECT (165000::${t} * 20000)::text AS shown, ${equals(`165000::${t} * 20000`, t, '3300000000')} AS ok`,
  },
  {
    id: 'display',
    label: '165,000원을 그대로 꺼내 보이기',
    expected: '165000',
    sql: (t) => `SELECT 165000::${t}::text AS shown, 165000::${t}::text = '165000' AS ok`,
  },
  {
    id: 'size',
    label: '값 하나의 크기',
    expected: '작을수록 좋음',
    informational: true,
    sql: (t) => `SELECT pg_column_size(165000::${t}) || ' 바이트' AS shown, NULL::boolean AS ok`,
  },
];

export interface NumberCell {
  type: NumberType;
  /** 실행하지 않은 칸 (정수 타입에 소수 넣기처럼) */
  skipped?: boolean;
  shown?: string;
  ok?: boolean | null;
  /** 실수 타입이 실제로 담고 있는 값 (표시와 다를 때 보여 준다) */
  actual?: string | null;
  /** 실패했을 때의 SQLSTATE */
  code?: string;
  error?: string;
}

export interface NumberRow {
  id: string;
  label: string;
  expected: string;
  informational: boolean;
  cells: NumberCell[];
}

export async function runNumberLab(pool: pg.Pool): Promise<NumberRow[]> {
  const client = await pool.connect();
  try {
    const rows: NumberRow[] = [];
    for (const experiment of NUMBER_EXPERIMENTS) {
      const cells: NumberCell[] = [];
      for (const type of NUMBER_TYPES) {
        const sql = experiment.sql(type);
        if (!sql) {
          cells.push({ type, skipped: true });
          continue;
        }
        try {
          const { rows: result } = await client.query(sql);
          cells.push({ type, shown: result[0].shown, ok: result[0].ok, actual: result[0].actual ?? null });
        } catch (err) {
          const { code, message } = err as { code?: string; message: string };
          cells.push({ type, ok: false, code, error: message });
        }
      }
      rows.push({
        id: experiment.id,
        label: experiment.label,
        expected: experiment.expected,
        informational: Boolean(experiment.informational),
        cells,
      });
    }
    return rows;
  } finally {
    client.release();
  }
}
