export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** 실험 서버(/api) 호출. 실패하면 서버가 준 error 코드를 담은 ApiError를 던진다 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `HTTP_${res.status}`);
  return body as T;
}

export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });

const SERVER_DOWN = '실험 서버에 연결할 수 없어요. pnpm dev로 실행했는지 확인하세요.';
const DB_DOWN = 'PostgreSQL에 연결할 수 없어요. OrbStack을 켜고 pnpm infra:up을 실행하세요.';

/** 사용자에게 보여줄 에러 문구 */
export function describeError(err: unknown): string {
  // fetch 자체가 실패했거나, 서버 대신 Vite 프록시가 응답한 경우
  if (!(err instanceof ApiError) || err.code.startsWith('HTTP_5')) return SERVER_DOWN;
  if (err.code.includes('ECONNREFUSED')) return DB_DOWN;
  return err.code;
}
