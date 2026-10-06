import { readFile } from 'node:fs/promises';
import pg from 'pg';

const DEFAULT_URL = 'postgres://study:study@localhost:5432/study';

/** 케이스 스키마를 기본 search_path로 쓰는 커넥션 풀. 쿼리에서 스키마 이름을 생략할 수 있다 */
export function createPool(schema: string, max = 20): pg.Pool {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_URL,
    options: `-c search_path=${schema}`,
    max,
  });
}

/** fn 안의 쿼리를 하나의 트랜잭션으로 묶는다. 에러가 나면 전부 되돌린다 */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** 스키마를 지우고 SQL 파일을 순서대로 적용한다. 실험이 매번 같은 상태에서 출발하게 하기 위함 */
export async function resetSchema(
  pool: pg.Pool,
  schema: string,
  sqlFiles: URL[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.query(`CREATE SCHEMA ${schema}`);
    for (const file of sqlFiles) {
      await client.query(await readFile(file, 'utf8'));
    }
  } finally {
    client.release();
  }
}
