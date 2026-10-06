// 직접 그린 아이콘 한 벌. 16px 격자, 선 굵기 1.5로 통일한다
const PATHS = {
  info: 'M8 14.5A6.5 6.5 0 108 1.5a6.5 6.5 0 000 13zM8 7.2v4M8 4.8v.1',
  success: 'M8 14.5A6.5 6.5 0 108 1.5a6.5 6.5 0 000 13zM5.2 8.2l1.9 1.9 3.8-4',
  error: 'M8 14.5A6.5 6.5 0 108 1.5a6.5 6.5 0 000 13zM5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4',
  warning: 'M8 1.8l6.6 11.7H1.4L8 1.8zM8 6.3v3.5M8 11.6v.1',
  stopped: 'M8 14.5A6.5 6.5 0 108 1.5a6.5 6.5 0 000 13zM5.2 8h5.6',
  pending: 'M8 14.5A6.5 6.5 0 108 1.5a6.5 6.5 0 000 13zM8 4.6V8l2.3 1.5',
  shield: 'M8 1.6l5.4 2v4.1c0 3.2-2.3 5.6-5.4 6.7-3.1-1.1-5.4-3.5-5.4-6.7V3.6L8 1.6z',
  play: 'M4.5 2.8v10.4L13 8 4.5 2.8z',
  pause: 'M5 3v10M11 3v10',
  restart: 'M2.8 8a5.2 5.2 0 109.4-3.1M12.6 1.8v3.4H9.2',
  refresh: 'M13 3v3h-3M3 13v-3h3M12.6 6A5 5 0 004 4.5M3.4 10A5 5 0 0012 11.5',
  close: 'M3.5 3.5l9 9M12.5 3.5l-9 9',
  chevronRight: 'M6 3.5L10.5 8 6 12.5',
  chevronDown: 'M3.5 6L8 10.5 12.5 6',
  database:
    'M8 1.8c3.3 0 6 .9 6 2.2v8c0 1.3-2.7 2.2-6 2.2s-6-.9-6-2.2V4c0-1.3 2.7-2.2 6-2.2zM2 4c0 1.3 2.7 2.2 6 2.2S14 5.3 14 4M2 8c0 1.3 2.7 2.2 6 2.2S14 9.3 14 8',
  download: 'M8 2v8.5M4.5 7.2L8 10.7l3.5-3.5M2.5 13.5h11',
  flask: 'M6 1.8h4M6.6 1.8v4.4L2.8 12.6c-.5.9.1 1.9 1.1 1.9h8.2c1 0 1.6-1 1.1-1.9L9.4 6.2V1.8M4.6 9.6h6.8',
  table: 'M2 3h12v10H2zM2 6.3h12M2 9.6h12M6.3 3v10',
  book: 'M2.5 2.5h4.2c.7 0 1.3.6 1.3 1.3v10c0-.6-.5-1.1-1.1-1.1H2.5zM13.5 2.5H9.3c-.7 0-1.3.6-1.3 1.3v10c0-.6.5-1.1 1.1-1.1h4.4z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const filled = name === 'play';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
