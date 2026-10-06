import type pg from 'pg';

/**
 * Q18 실험: 같은 시각을 timestamptz와 timestamp에 한 번 저장하고,
 * 시간대가 다른 세션에서 읽으면 각각 어떻게 보이고 어떤 순간을 가리키는지 비교한다.
 * 임시 테이블을 쓰고 끝나면 되돌린다.
 */

export const SESSION_ZONES = ['Asia/Seoul', 'UTC', 'America/New_York'];
export const INSERT_ZONE = 'Asia/Seoul';
export const TIME_INPUT = '2026-12-24 19:00:00+09';

export interface TimeLabRow {
  zone: string;
  /** 세션에서 보이는 값 */
  timestamptz: string;
  timestamp: string;
  /** 그 값이 가리키는 실제 순간을 UTC로 */
  timestamptzInstant: string;
  timestampInstant: string;
}

export interface TimeLabResult {
  input: string;
  insertZone: string;
  rows: TimeLabRow[];
}

export async function runTimeLab(pool: pg.Pool): Promise<TimeLabResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE lab_time (tz timestamptz, ts timestamp) ON COMMIT DROP`);
    // 서울 세션에서 같은 글자를 두 컬럼에 넣는다. timestamp 쪽은 '+09'를 조용히 버린다
    await client.query(`SET LOCAL TIME ZONE '${INSERT_ZONE}'`);
    await client.query(`INSERT INTO lab_time VALUES ($1::timestamptz, $1::timestamp)`, [TIME_INPUT]);

    const rows: TimeLabRow[] = [];
    for (const zone of SESSION_ZONES) {
      await client.query(`SET LOCAL TIME ZONE '${zone}'`);
      // timestamp는 시간대가 없으므로, 이 세션의 시간대로 해석했을 때의 순간을 함께 구한다
      const { rows: result } = await client.query(`
        SELECT tz::text AS tz,
               ts::text AS ts,
               to_char(tz AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') AS tz_instant,
               to_char((ts AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') AS ts_instant
        FROM lab_time
      `);
      rows.push({
        zone,
        timestamptz: result[0].tz,
        timestamp: result[0].ts,
        timestamptzInstant: result[0].tz_instant,
        timestampInstant: result[0].ts_instant,
      });
    }
    return { input: TIME_INPUT, insertZone: INSERT_ZONE, rows };
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
