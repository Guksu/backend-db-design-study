/**
 * 실험별 최근 결과를 이 브라우저에만 기억한다. 개요 화면의 "최근 결과"용이라
 * 저장소를 못 쓰면 그냥 비어 있을 뿐이다.
 */
export function readLastRun<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`lab:last:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeLastRun(key: string, value: unknown) {
  try {
    localStorage.setItem(`lab:last:${key}`, JSON.stringify(value));
  } catch {
    // 기억하지 못해도 실험에는 지장이 없다
  }
}
