import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createPool } from '../lab/db';

const app = new Hono().basePath('/api');
const healthPool = createPool('public', 2);

// 화면 상단의 연결 상태 표시용
app.get('/health', async (c) => {
  const { rows } = await healthPool.query(`SELECT current_setting('server_version') AS version`);
  return c.json({ postgres: rows[0].version as string });
});

app.onError((err, c) => {
  // 42P01 undefined_table: 케이스 스키마를 아직 만들지 않았다
  if ((err as { code?: string }).code === '42P01') {
    return c.json({ error: 'NOT_INITIALIZED' }, 409);
  }
  console.error(err);
  return c.json({ error: err.message }, 500);
});

// PORT는 웹 개발 서버 몫이라 API는 API_PORT를 쓴다
const port = Number(process.env.API_PORT ?? 4000);
serve({ fetch: app.fetch, port }, () => {
  console.log(`lab api → http://localhost:${port}/api`);
});
