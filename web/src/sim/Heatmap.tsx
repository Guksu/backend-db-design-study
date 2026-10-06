import { useState } from 'react';

// dataviz 순차 램프(파랑 100 → 700). 다크 모드에서는 어두운 쪽이 "0"이 되도록 뒤집는다
const RAMP = [
  '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5',
  '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b',
];

const isDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

function colorFor(value: number, max: number) {
  const ramp = isDark() ? [...RAMP].reverse() : RAMP;
  const index = Math.round((Math.min(value, max) / Math.max(max, 1)) * (ramp.length - 1));
  const lightText = isDark() ? index < 6 : index >= 7;
  return { background: ramp[index], color: lightText ? '#ffffff' : '#0f1419' };
}

export interface HeatmapProps {
  xs: number[];
  ys: number[];
  xLabel: string;
  yLabel: string;
  /** `${x}:${y}` → 반복마다의 값. 아직 없으면 측정 중 */
  cells: Map<string, number[]>;
  /** 색의 최댓값 */
  max: number;
  unit: string;
  formatAxis: (v: number) => string;
}

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;

export function Heatmap({ xs, ys, xLabel, yLabel, cells, max, unit, formatAxis }: HeatmapProps) {
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div className="heatmap">
      <div className="heatmap-y-label">세로: {yLabel}</div>
      <div
        className="heatmap-grid"
        style={{ gridTemplateColumns: `56px repeat(${xs.length}, minmax(48px, 1fr))` }}
        role="table"
        aria-label={`${yLabel} × ${xLabel}`}
      >
        {[...ys].reverse().map((y) => (
          <div className="heatmap-row" role="row" key={y}>
            <div className="heatmap-axis" role="rowheader">
              {formatAxis(y)}
            </div>
            {xs.map((x) => {
              const key = `${x}:${y}`;
              const values = cells.get(key);
              const value = values ? mean(values) : null;
              return (
                <div
                  key={key}
                  role="cell"
                  className="heatmap-cell"
                  data-pending={values ? undefined : true}
                  style={value === null ? undefined : colorFor(value, max)}
                  onMouseEnter={() => setHover(key)}
                  onMouseLeave={() => setHover(null)}
                  tabIndex={0}
                  onFocus={() => setHover(key)}
                  onBlur={() => setHover(null)}
                  aria-label={
                    values
                      ? `${xLabel} ${formatAxis(x)}, ${yLabel} ${formatAxis(y)}: 평균 ${value!.toFixed(1)}${unit}`
                      : '측정 중'
                  }
                >
                  {value === null ? '' : value.toFixed(1)}
                  {hover === key && values && (
                    <div className="heatmap-tooltip" role="tooltip">
                      <strong>
                        평균 {value!.toFixed(1)}
                        {unit}
                      </strong>
                      <span>
                        {xLabel} {formatAxis(x)} · {yLabel} {formatAxis(y)}
                      </span>
                      <span>반복별: {values.join(', ')}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div className="heatmap-row" role="row">
          <div />
          {xs.map((x) => (
            <div key={x} className="heatmap-axis heatmap-axis-x" role="columnheader">
              {formatAxis(x)}
            </div>
          ))}
        </div>
      </div>
      <div className="heatmap-x-label">가로: {xLabel}</div>
      <div className="heatmap-scale" aria-hidden="true">
        <span>0{unit}</span>
        <span
          className="heatmap-scale-bar"
          style={{
            background: `linear-gradient(90deg, ${(isDark() ? [...RAMP].reverse() : RAMP).join(',')})`,
          }}
        />
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}
