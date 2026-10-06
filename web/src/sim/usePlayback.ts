import { useCallback, useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 기록된 실험(트레이스)을 느리게 재생한다.
 * 실제로는 수십 ms에 끝나는 경쟁을 사람이 볼 수 있는 속도로 늘리기 위함.
 * runKey가 바뀌면(새 실행) 처음부터 다시 재생한다.
 */
export function usePlayback(duration: number, runKey: unknown, initialSpeed = 0.01) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);
  const frame = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setT(duration);
      setPlaying(false);
    } else {
      setT(0);
      setPlaying(duration > 0);
    }
  }, [runKey, duration]);

  useEffect(() => {
    if (!playing) return;
    let last: number | null = null;
    const tick = (now: number) => {
      if (last !== null) {
        const step = (now - last) * speed;
        setT((prev) => {
          const next = Math.min(duration, prev + step);
          if (next >= duration) setPlaying(false);
          return next;
        });
      }
      last = now;
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, speed, duration]);

  const play = useCallback(() => {
    setT((prev) => (prev >= duration ? 0 : prev));
    setPlaying(true);
  }, [duration]);

  return {
    t,
    playing,
    speed,
    setSpeed,
    play,
    pause: () => setPlaying(false),
    restart: () => {
      setT(0);
      setPlaying(true);
    },
    seek: (value: number) => {
      setPlaying(false);
      setT(Math.max(0, Math.min(duration, value)));
    },
  };
}
