import { useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface TimelineSegment {
  kind: string;
  start: number;
  end: number;
}

export interface TimelineLane {
  id: string;
  label: string;
  segments: TimelineSegment[];
  outcome?: { at: number; kind: string };
  /** 마우스를 올렸을 때 보여 줄 줄 */
  detail: string[];
}

export interface SegmentStyle {
  label: string;
  color: string;
  hatch?: boolean;
}

export type OutcomeIcon = 'check' | 'cross' | 'minus' | 'shield';

export interface OutcomeStyle {
  label: string;
  color: string;
  icon: OutcomeIcon;
}

export interface TimelineMarker {
  at: number;
  label: string;
}

interface TimelineProps {
  lanes: TimelineLane[];
  /** 시간 축의 끝 (ms) */
  domain: number;
  /** 재생 위치 (ms). 이 시각까지 일어난 일만 그린다 */
  t: number;
  segmentStyles: Record<string, SegmentStyle>;
  outcomeStyles: Record<string, OutcomeStyle>;
  /** 이 시각 이전을 "경쟁 구간"으로 칠한다 */
  window?: TimelineMarker;
  ariaLabel: string;
  /** 고른 레인. 누르면 상세 패널을 여는 데 쓴다 */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

const GUTTER = 44;
/** 맨 위 줄은 첫 커밋 라벨, 그 아래 줄은 눈금 */
const LABEL_ROW = 16;
const AXIS = LABEL_ROW + 22;
const ROW = 20;
const BAR = 12;

function niceStep(domain: number, targetTicks = 7) {
  const raw = domain / targetTicks;
  const steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  return steps.find((s) => s >= raw) ?? 1000;
}

export function Timeline({
  lanes,
  domain,
  t,
  segmentStyles,
  outcomeStyles,
  window: raceWindow,
  ariaLabel,
  selectedId,
  onSelect,
}: TimelineProps) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ lane: TimelineLane; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(100, width - GUTTER - 12);
  const x = (ms: number) => GUTTER + (Math.min(ms, domain) / domain) * plotWidth;
  const height = AXIS + lanes.length * ROW + 6;
  const step = niceStep(domain);
  const ticks = useMemo(
    () => Array.from({ length: Math.floor(domain / step) + 1 }, (_, i) => i * step),
    [domain, step],
  );
  const hatchId = useMemo(() => `hatch-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div className="timeline" ref={container}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <defs>
          <pattern
            id={hatchId}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="5" className="timeline-hatch" />
          </pattern>
        </defs>

        {/* 경쟁 구간: 첫 커밋 전 */}
        {raceWindow && (
          <g>
            <rect
              x={GUTTER}
              y={AXIS - 4}
              width={Math.max(0, x(Math.min(t, raceWindow.at)) - GUTTER)}
              height={height - AXIS + 2}
              className="timeline-window"
            />
            {t >= raceWindow.at && (
              <>
                <line
                  x1={x(raceWindow.at)}
                  x2={x(raceWindow.at)}
                  y1={2}
                  y2={height}
                  className="timeline-commit"
                />
                <text
                  x={x(raceWindow.at) + 5}
                  y={11}
                  className="timeline-commit-label"
                  textAnchor={x(raceWindow.at) > width - 180 ? 'end' : 'start'}
                  dx={x(raceWindow.at) > width - 180 ? -10 : 0}
                >
                  {raceWindow.label}
                </text>
              </>
            )}
          </g>
        )}

        {/* 축 */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={AXIS - 4} y2={height} className="timeline-grid" />
            <text x={x(tick)} y={LABEL_ROW + 12} className="timeline-tick" textAnchor="middle">
              {tick}ms
            </text>
          </g>
        ))}

        {/* 레인 */}
        {lanes.map((lane, i) => {
          const y = AXIS + i * ROW;
          const barY = y + (ROW - BAR) / 2;
          const outcome = lane.outcome && t >= lane.outcome.at ? lane.outcome : null;
          const outcomeStyle = outcome ? outcomeStyles[outcome.kind] : null;
          return (
            <g
              key={lane.id}
              className={onSelect ? 'timeline-lane is-selectable' : 'timeline-lane'}
              data-selected={lane.id === selectedId || undefined}
              onMouseMove={(e) => {
                const box = container.current!.getBoundingClientRect();
                setHover({ lane, x: e.clientX - box.left, y: e.clientY - box.top });
              }}
              onMouseLeave={() => setHover(null)}
              onClick={onSelect ? () => onSelect(lane.id) : undefined}
              onKeyDown={
                onSelect
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(lane.id);
                      }
                    }
                  : undefined
              }
              tabIndex={onSelect ? 0 : undefined}
              role={onSelect ? 'button' : undefined}
              aria-label={onSelect ? lane.detail[0] : undefined}
            >
              <rect x={0} y={y} width={width} height={ROW} className="timeline-hit" />
              <text x={GUTTER - 8} y={y + ROW / 2 + 4} className="timeline-lane-label" textAnchor="end">
                {lane.label}
              </text>
              {lane.segments
                .filter((s) => s.start < t)
                .map((s, si) => {
                  const style = segmentStyles[s.kind];
                  const end = Math.min(s.end, t);
                  return (
                    <rect
                      key={si}
                      x={x(s.start)}
                      y={barY}
                      width={Math.max(1.5, x(end) - x(s.start))}
                      height={BAR}
                      rx={2}
                      style={{ fill: style.hatch ? `url(#${hatchId})` : style.color }}
                      className={style.hatch ? 'timeline-bar-hatch' : undefined}
                    />
                  );
                })}
              {outcomeStyle && outcome && (
                <OutcomeGlyph
                  cx={x(outcome.at) + 9}
                  cy={y + ROW / 2}
                  color={outcomeStyle.color}
                  icon={outcomeStyle.icon}
                />
              )}
            </g>
          );
        })}

        {/* 재생 위치 */}
        {t < domain && (
          <line x1={x(t)} x2={x(t)} y1={AXIS - 6} y2={height} className="timeline-playhead" />
        )}
      </svg>

      {hover && (
        <div
          className="timeline-tooltip"
          style={{
            left: Math.min(hover.x + 14, width - 260),
            top: hover.y + 14,
          }}
          role="tooltip"
        >
          {hover.lane.detail.map((line, i) => (
            <div key={i} className={i === 0 ? 'timeline-tooltip-title' : undefined}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OutcomeGlyph({
  cx,
  cy,
  color,
  icon,
  r = 7,
}: {
  cx: number;
  cy: number;
  color: string;
  icon: OutcomeIcon;
  r?: number;
}) {
  const s = r * 0.5;
  return (
    <g className="timeline-outcome">
      <circle cx={cx} cy={cy} r={r} style={{ fill: color }} className="timeline-outcome-ring" />
      {icon === 'check' && (
        <path d={`M${cx - s} ${cy}l${s * 0.7} ${s * 0.7}l${s * 1.3} ${-s * 1.4}`} className="timeline-outcome-icon" />
      )}
      {icon === 'cross' && (
        <path
          d={`M${cx - s * 0.8} ${cy - s * 0.8}l${s * 1.6} ${s * 1.6}M${cx + s * 0.8} ${cy - s * 0.8}l${-s * 1.6} ${s * 1.6}`}
          className="timeline-outcome-icon"
        />
      )}
      {icon === 'minus' && <path d={`M${cx - s} ${cy}h${s * 2}`} className="timeline-outcome-icon" />}
      {icon === 'shield' && (
        <path
          d={`M${cx} ${cy - s * 1.1}l${s} ${s * 0.45}v${s * 0.55}c0 ${s * 0.7} ${-s * 0.5} ${s * 1.1} ${-s} ${s * 1.3}c${-s * 0.5} ${-s * 0.2} ${-s} ${-s * 0.6} ${-s} ${-s * 1.3}v${-s * 0.55}z`}
          className="timeline-outcome-icon"
        />
      )}
    </g>
  );
}

/** 범례: 막대 종류와 결과 기호. 색만으로 구분하지 않도록 기호와 글자를 같이 쓴다 */
export function TimelineLegend({
  segmentStyles,
  outcomeStyles,
  markers = [],
}: {
  segmentStyles: Record<string, SegmentStyle>;
  outcomeStyles: Record<string, OutcomeStyle>;
  /** 막대 · 결과 말고 차트 위의 표시 (첫 커밋 선, 경쟁 구간) */
  markers?: { kind: 'commit' | 'window'; label: string }[];
}) {
  return (
    <ul className="timeline-legend">
      {markers.map((m) => (
        <li key={m.kind}>
          <span className="timeline-legend-marker" data-kind={m.kind} />
          {m.label}
        </li>
      ))}
      {Object.entries(segmentStyles).map(([kind, style]) => (
        <li key={kind}>
          <span
            className="timeline-legend-bar"
            data-hatch={style.hatch || undefined}
            style={style.hatch ? undefined : { background: style.color }}
          />
          {style.label}
        </li>
      ))}
      {Object.entries(outcomeStyles).map(([kind, style]) => (
        <li key={kind}>
          <svg width="16" height="16" aria-hidden="true">
            <OutcomeGlyph cx={8} cy={8} r={7} color={style.color} icon={style.icon} />
          </svg>
          {style.label}
        </li>
      ))}
    </ul>
  );
}
