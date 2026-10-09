import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { introspectSchema, previewTable } from '../../lab/introspect';
import { runIndexLab } from './indexLab';
import { runIndexOrderLab } from './indexOrderLab';
import { runNumberLab } from './numberLab';
import { runTimeLab } from './timeLab';
import {
  CONSTRAINT_CHECKS,
  createTicketPool,
  getVenueSeats,
  reset,
  runConstraintCheck,
  runRace,
  runSweep,
  SCHEMA,
  type RaceOptions,
  type RaceTxMode,
} from './ticket';

const pool = createTicketPool();

// 시뮬레이션은 한 번에 하나만 돈다. 둘이 겹치면 같은 좌석과 커넥션을 두고 서로 간섭한다
let running: Promise<unknown> = Promise.resolve();
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const next = running.then(job, job);
  running = next.catch(() => undefined);
  return next;
}

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const value = Number(n);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
};

const TX_MODES: RaceTxMode[] = ['autocommit', 'transaction', 'for-update'];

function raceOptions(body: Partial<RaceOptions>): RaceOptions {
  return {
    users: clamp(body.users, 2, 50, 20),
    spreadMs: clamp(body.spreadMs, 0, 1000, 100),
    gapMs: clamp(body.gapMs, 0, 500, 20),
    seed: clamp(body.seed, 0, 2 ** 31 - 1, 1),
    txMode: TX_MODES.includes(body.txMode as RaceTxMode) ? (body.txMode as RaceTxMode) : 'autocommit',
  };
}

export const ticketApi = new Hono()
  .post('/reset', async (c) => {
    await exclusive(() => reset(pool));
    return c.json({ ok: true });
  })
  .get('/erd', async (c) => c.json(await introspectSchema(pool, SCHEMA)))
  .get('/tables/:name/preview', async (c) => {
    const preview = await previewTable(pool, SCHEMA, c.req.param('name'));
    return preview ? c.json(preview) : c.json({ error: 'TABLE_NOT_FOUND' }, 404);
  })
  .get('/venue-seats', async (c) => c.json(await getVenueSeats(pool)))
  .get('/constraint-checks', (c) => c.json(CONSTRAINT_CHECKS))
  .post('/constraint-checks/run', async (c) => {
    const results = [];
    for (const check of CONSTRAINT_CHECKS) results.push(await runConstraintCheck(pool, check));
    return c.json(results);
  })
  .post('/race', async (c) => {
    const options = raceOptions(await c.req.json());
    const result = await exclusive(async () => ({
      options,
      checkOnly: await runRace(pool, 'check-only', options),
      checkAndUnique: await runRace(pool, 'check-and-unique', options),
    }));
    return c.json(result);
  })
  .post('/time-lab', async (c) => c.json(await runTimeLab(pool)))
  .post('/number-lab', async (c) => c.json(await runNumberLab(pool)))
  .post('/index-lab', async (c) => {
    const body = await c.req.json();
    const allowed = [10_000, 100_000, 1_000_000];
    const sizes = (Array.isArray(body.sizes) ? body.sizes : allowed)
      .map(Number)
      .filter((n: number) => allowed.includes(n));
    const options = { sizes, venues: 1000 };
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'start', data: JSON.stringify(options) });
      await exclusive(() =>
        runIndexLab(pool, options, (result) => {
          void stream.writeSSE({ event: 'size', data: JSON.stringify(result) });
        }),
      );
      await stream.writeSSE({ event: 'done', data: '{}' });
    });
  })
  .post('/index-order-lab', async (c) => {
    const body = await c.req.json();
    const rows = body.rows === 1_000_000 ? 1_000_000 : 100_000;
    return streamSSE(c, async (stream) => {
      await exclusive(() =>
        runIndexOrderLab(
          pool,
          { rows },
          (start) => void stream.writeSSE({ event: 'start', data: JSON.stringify(start) }),
          (result) => void stream.writeSSE({ event: 'variant', data: JSON.stringify(result) }),
        ),
      );
      await stream.writeSSE({ event: 'done', data: '{}' });
    });
  })
  .post('/race/sweep', async (c) => {
    const body = await c.req.json();
    const options = {
      users: clamp(body.users, 2, 50, 20),
      spreads: [0, 50, 100, 200, 400],
      gaps: [0, 10, 20, 50, 100],
      reps: clamp(body.reps, 1, 5, 3),
      seed: clamp(body.seed, 0, 2 ** 31 - 1, 1),
    };
    // 격자 한 칸이 끝날 때마다 바로 보낸다 (Server-Sent Events)
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ event: 'start', data: JSON.stringify(options) });
      await exclusive(() =>
        runSweep(pool, options, (cell) => {
          void stream.writeSSE({ event: 'cell', data: JSON.stringify(cell) });
        }),
      );
      await stream.writeSSE({ event: 'done', data: '{}' });
    });
  });
