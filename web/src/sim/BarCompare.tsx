import { useState } from 'react';

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarGroup {
  label: string;
  values: Record<string, number | null>;
}

interface BarCompareProps {
  title: string;
  description: string;
  series: BarSeries[];
  groups: BarGroup[];
  format: (value: number) => string;
  /** 막대 옆에 붙일 비교 문구 (예: "21배 빠름") */
  annotate?: (group: BarGroup) => string | null;
}

/**
 * 그룹(데이터 크기)마다 두 막대를 나란히 놓는 작은 비교 차트.
 * 축은 차트마다 따로라 서로 다른 단위를 한 축에 섞지 않는다.
 */
export function BarCompare({ title, description, series, groups, format, annotate }: BarCompareProps) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1e-9, ...groups.flatMap((g) => series.map((s) => g.values[s.key] ?? 0)));

  return (
    <figure className="bars">
      <figcaption>
        <h3>{title}</h3>
        <p>{description}</p>
      </figcaption>
      <ul className="bars-legend">
        {series.map((s) => (
          <li key={s.key}>
            <span style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="bars-groups">
        {groups.map((group) => {
          const note = annotate?.(group);
          return (
            <div className="bars-group" key={group.label}>
              <div className="bars-group-head">
                <span>{group.label}</span>
                {note && <strong>{note}</strong>}
              </div>
              {series.map((s) => {
                const value = group.values[s.key];
                const key = `${group.label}:${s.key}`;
                return (
                  <div
                    className="bars-row"
                    key={s.key}
                    onMouseEnter={() => setHover(key)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <span className="bars-track">
                      {value !== null && (
                        <span
                          className="bars-fill"
                          style={{ width: `${Math.max(0.6, (value / max) * 100)}%`, background: s.color }}
                        />
                      )}
                    </span>
                    <span className="bars-value">{value === null ? '없음' : format(value)}</span>
                    {hover === key && (
                      <span className="bars-tooltip" role="tooltip">
                        {group.label} · {s.label}: {value === null ? '없음' : format(value)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </figure>
  );
}
