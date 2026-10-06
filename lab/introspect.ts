import type pg from 'pg';

export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  identity: boolean;
  comment: string | null;
}

export type ConstraintKind = 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK';

export interface ConstraintInfo {
  name: string;
  kind: ConstraintKind;
  columns: string[];
  refTable: string | null;
  refColumns: string[];
  definition: string;
  comment: string | null;
}

export interface TableInfo {
  name: string;
  comment: string | null;
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
}

/**
 * 실제 DB 카탈로그(pg_catalog)를 읽어 테이블 · 컬럼 · 제약조건을 돌려준다.
 * ERD를 문서가 아니라 DB에서 그리기 위함. 실험용 임시 테이블(lab_*)은 뺀다.
 */
export async function introspectSchema(pool: pg.Pool, schema: string): Promise<TableInfo[]> {
  const [tables, columns, constraints] = await Promise.all([
    pool.query(
      `
      SELECT c.relname AS name, obj_description(c.oid, 'pg_class') AS comment
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname NOT LIKE 'lab\\_%'
      ORDER BY c.relname
      `,
      [schema],
    ),
    pool.query(
      `
      SELECT c.relname AS "table", a.attname AS name,
             format_type(a.atttypid, a.atttypmod) AS type,
             a.attnotnull AS "notNull",
             a.attidentity <> '' AS identity,
             col_description(c.oid, a.attnum) AS comment
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum
      `,
      [schema],
    ),
    pool.query(
      `
      SELECT c.relname AS "table", con.conname AS name,
             CASE con.contype
               WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY'
               WHEN 'u' THEN 'UNIQUE' ELSE 'CHECK'
             END AS kind,
             ARRAY(
               SELECT a.attname::text
               FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
               ORDER BY k.ord
             ) AS columns,
             fc.relname AS "refTable",
             ARRAY(
               SELECT a.attname::text
               FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
               ORDER BY k.ord
             ) AS "refColumns",
             pg_get_constraintdef(con.oid) AS definition,
             obj_description(con.oid, 'pg_constraint') AS comment
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_class fc ON fc.oid = con.confrelid
      WHERE n.nspname = $1 AND con.contype IN ('p', 'f', 'u', 'c') AND c.relname NOT LIKE 'lab\\_%'
      ORDER BY c.relname, con.contype, con.conname
      `,
      [schema],
    ),
  ]);

  return tables.rows.map((t) => ({
    name: t.name,
    comment: t.comment,
    columns: columns.rows
      .filter((c) => c.table === t.name)
      .map(({ table: _table, ...column }) => column as ColumnInfo),
    constraints: constraints.rows
      .filter((c) => c.table === t.name)
      .map(({ table: _table, ...constraint }) => constraint as ConstraintInfo),
  }));
}

export interface TablePreview {
  name: string;
  /** 정확한 행 수 (count(*)) */
  rowCount: number;
  tableBytes: number;
  indexes: { name: string; bytes: number }[];
  columns: string[];
  /** 앞쪽 몇 행 */
  sample: Record<string, unknown>[];
}

/**
 * 테이블 하나의 행 수 · 크기 · 인덱스 크기 · 앞쪽 행을 돌려준다.
 * 테이블 이름은 카탈로그에 실제로 있는 것만 받는다 (SQL에 이름을 끼워 넣기 때문).
 */
export async function previewTable(
  pool: pg.Pool,
  schema: string,
  name: string,
  limit = 8,
): Promise<TablePreview | null> {
  const tables = await introspectSchema(pool, schema);
  const table = tables.find((t) => t.name === name);
  if (!table) return null;

  const qualified = `${schema}.${name}`;
  const pk = table.constraints.find((c) => c.kind === 'PRIMARY KEY')?.columns ?? [];
  const order = pk.length ? `ORDER BY ${pk.map((c) => `"${c}"`).join(', ')}` : '';
  const [count, size, indexes, sample] = await Promise.all([
    pool.query(`SELECT count(*)::bigint AS n FROM ${qualified}`),
    pool.query(`SELECT pg_relation_size($1::regclass) AS bytes`, [qualified]),
    pool.query(
      `SELECT i.relname AS name, pg_relation_size(i.oid) AS bytes
       FROM pg_index x
       JOIN pg_class i ON i.oid = x.indexrelid
       WHERE x.indrelid = $1::regclass
       ORDER BY i.relname`,
      [qualified],
    ),
    pool.query(`SELECT * FROM ${qualified} ${order} LIMIT ${limit}`),
  ]);
  return {
    name,
    rowCount: Number(count.rows[0].n),
    tableBytes: Number(size.rows[0].bytes),
    indexes: indexes.rows.map((r) => ({ name: r.name, bytes: Number(r.bytes) })),
    columns: table.columns.map((c) => c.name),
    sample: sample.rows,
  };
}
