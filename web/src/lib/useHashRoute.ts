import { useEffect, useState } from 'react';

/** `#/step1/race` 같은 해시 경로. 라우터 없이 새로고침과 링크 공유가 되게 한다 */
export function useHashRoute(fallback: string): string {
  const read = () => window.location.hash.replace(/^#/, '') || fallback;
  const [path, setPath] = useState(read);

  useEffect(() => {
    const onChange = () => setPath(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  });

  return path;
}
