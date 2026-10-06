import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TableInfo, TablePreview } from '../../../lab/introspect';
import { Icon } from '../ui/Icon';
import { layeredLayout, type PlannedRelation } from './layout';
import {
  HEADER_HEIGHT,
  NODE_WIDTH,
  PLANNED_HEIGHT,
  PLANNED_WIDTH,
  ROW_HEIGHT,
  TableNode,
  shortType,
  type TableNodeType,
} from './TableNode';
import './erd.css';

const nodeTypes = { table: TableNode };

interface ErdCanvasProps {
  /** DB 카탈로그에서 읽은 실제 테이블 */
  tables: TableInfo[];
  /** 문서에 적힌 관계. 아직 DB에 없는 테이블은 "설계 예정"으로 그린다 */
  relations: PlannedRelation[];
  /** 테이블 성격 (정적 · 동적 · 이력 · 참조) */
  roles: Record<string, string>;
  /** 끌어 옮긴 위치를 기억할 키 */
  storageKey: string;
  /** 테이블의 행 수 · 크기 · 앞쪽 행을 불러온다. 인스펙터의 "데이터" 탭 */
  loadPreview?: (name: string) => Promise<TablePreview>;
}

type Positions = Record<string, { x: number; y: number }>;

function loadPositions(key: string): Positions {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return {};
  }
}

function savePositions(key: string, positions: Positions) {
  try {
    localStorage.setItem(key, JSON.stringify(positions));
  } catch {
    // 저장소를 못 쓰면 위치를 기억하지 않을 뿐이다
  }
}

export function ErdCanvas(props: ErdCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ tables, relations, roles, storageKey, loadPreview }: ErdCanvasProps) {
  const { fitView } = useReactFlow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 문서에만 있는 테이블까지 합친 전체 테이블 목록
  const names = useMemo(() => {
    const all = new Set(tables.map((t) => t.name));
    for (const r of relations) all.add(r.parent).add(r.child);
    return [...all];
  }, [tables, relations]);

  const autoLayout = useMemo(() => {
    const byName = new Map(tables.map((t) => [t.name, t]));
    const fkEdges = tables.flatMap((t) =>
      t.constraints
        .filter((c) => c.kind === 'FOREIGN KEY' && c.refTable)
        .map((c) => ({ parent: c.refTable!, child: t.name })),
    );
    return layeredLayout(
      names.map((name) => {
        const table = byName.get(name);
        return {
          id: name,
          width: table ? NODE_WIDTH : PLANNED_WIDTH,
          height: table ? HEADER_HEIGHT + ROW_HEIGHT * table.columns.length + 8 : PLANNED_HEIGHT,
        };
      }),
      [...fkEdges, ...relations],
    );
  }, [names, tables, relations]);

  const buildNodes = useCallback(
    (positions: Positions): TableNodeType[] => {
      const byName = new Map(tables.map((t) => [t.name, t]));
      return names.map((name) => ({
        id: name,
        type: 'table',
        position: positions[name] ?? autoLayout[name],
        data: { name, role: roles[name], table: byName.get(name) ?? null },
      }));
    },
    [names, tables, roles, autoLayout],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>(
    buildNodes(loadPositions(storageKey)),
  );

  // 스키마가 바뀌면(테이블 추가 등) 노드를 다시 만든다. 옮겨 둔 위치는 유지한다
  useEffect(() => {
    setNodes(buildNodes(loadPositions(storageKey)));
  }, [buildNodes, setNodes, storageKey]);

  const edges = useMemo<Edge[]>(() => {
    const fk: Edge[] = tables.flatMap((t) =>
      t.constraints
        .filter((c) => c.kind === 'FOREIGN KEY' && c.refTable)
        .map((c) => ({
          id: `fk:${c.name}`,
          source: c.refTable!,
          sourceHandle: `${c.refColumns[0]}:r`,
          target: t.name,
          targetHandle: `${c.columns[0]}:l`,
          type: 'smoothstep',
          markerStart: 'erd-one',
          markerEnd: 'erd-many',
          className: 'erd-edge',
          data: { constraint: c.name },
        })),
    );
    const linked = new Set(fk.map((e) => `${e.source}>${e.target}`));
    // 부모가 이미 DB에 있으면 관계선을 부모의 PK 컬럼에서 시작한다 (자식이 결국 PK를 참조하므로)
    const pkOf = new Map(
      tables.map((t) => [t.name, t.constraints.find((c) => c.kind === 'PRIMARY KEY')?.columns[0]]),
    );
    const planned: Edge[] = relations
      .filter((r) => !linked.has(`${r.parent}>${r.child}`))
      .map((r) => ({
        id: `plan:${r.parent}>${r.child}`,
        source: r.parent,
        sourceHandle: pkOf.get(r.parent) ? `${pkOf.get(r.parent)}:r` : 'table:r',
        target: r.child,
        targetHandle: 'table:l',
        type: 'smoothstep',
        label: r.label,
        markerStart: 'erd-one',
        markerEnd: 'erd-many',
        className: 'erd-edge erd-edge-planned',
      }));
    return [...fk, ...planned].map((e) => ({
      ...e,
      className:
        e.className +
        (hoveredId && (e.source === hoveredId || e.target === hoveredId) ? ' is-active' : ''),
    }));
  }, [tables, relations, hoveredId]);

  const onNodeDragStop = useCallback(() => {
    setNodes((current) => {
      savePositions(
        storageKey,
        Object.fromEntries(current.map((n) => [n.id, n.position])),
      );
      return current;
    });
  }, [setNodes, storageKey]);

  const relayout = () => {
    savePositions(storageKey, {});
    setNodes(buildNodes({}));
    requestAnimationFrame(() => void fitView({ padding: 0.15, duration: 300 }));
  };

  const onNodeClick: NodeMouseHandler<TableNodeType> = (_, node) => setSelectedId(node.id);

  // 테이블을 고르면 인스펙터가 옆에 붙어 캔버스가 좁아진다.
  // 캔버스 크기가 바뀐 뒤에, 고른 테이블과 이웃 테이블이 모두 보이게 다시 맞춘다
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId || !canvasRef.current) return;
    const neighbors = edges
      .filter((e) => e.source === selectedId || e.target === selectedId)
      .flatMap((e) => [e.source, e.target]);
    const ids = [...new Set([selectedId, ...neighbors])];
    const fit = () => void fitView({ nodes: ids.map((id) => ({ id })), padding: 0.15, maxZoom: 1, duration: 250 });
    let timer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fit, 80);
    });
    observer.observe(canvasRef.current);
    timer = window.setTimeout(fit, 120);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
    // edges는 마우스를 올릴 때마다 바뀌므로 선택이 바뀔 때만 맞춘다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, fitView]);
  const selected = selectedId ? tables.find((t) => t.name === selectedId) ?? selectedId : null;

  return (
    <div className="erd" data-inspector={selectedId ? '' : undefined}>
      <div className="erd-canvas" ref={canvasRef}>
        <CrowFootMarkers />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelectedId(null)}
          onNodeMouseEnter={(_, n) => setHoveredId(n.id)}
          onNodeMouseLeave={() => setHoveredId(null)}
          nodesConnectable={false}
          edgesFocusable={false}
          fitView
          fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
          minZoom={0.3}
          maxZoom={2}
          colorMode="system"
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
        <div className="erd-toolbar">
          <button type="button" className="btn" onClick={relayout}>
            <Icon name="refresh" />
            자동 정렬
          </button>
          <span className="erd-hint">끌어서 옮길 수 있어요</span>
        </div>
        <ul className="erd-legend" aria-label="범례">
          <li>
            <svg width="34" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="34" y2="5" className="erd-legend-fk" />
            </svg>
            FK (DB에 있음)
          </li>
          <li>
            <svg width="34" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="34" y2="5" className="erd-legend-planned" />
            </svg>
            설계 예정 관계
          </li>
          <li>
            <span className="erd-legend-crow">||—o&lt;</span>
            1 : 0..N
          </li>
        </ul>
      </div>
      {selected && (
        <Inspector
          key={selectedId}
          selected={selected}
          role={selectedId ? roles[selectedId] : undefined}
          onClose={() => setSelectedId(null)}
          loadPreview={loadPreview}
        />
      )}
    </div>
  );
}

function Inspector({
  selected,
  role,
  onClose,
  loadPreview,
}: {
  selected: TableInfo | string;
  role?: string;
  onClose: () => void;
  loadPreview?: (name: string) => Promise<TablePreview>;
}) {
  const [tab, setTab] = useState<'structure' | 'data'>('structure');
  const name = typeof selected === 'string' ? selected : selected.name;
  const head = (
    <header className="erd-inspector-head">
      <div>
        <h2>{name}</h2>
        {role && <span className="badge">{role}</span>}
      </div>
      <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
        <Icon name="close" />
      </button>
    </header>
  );

  if (typeof selected === 'string') {
    return (
      <aside className="erd-inspector" aria-label={`${name} 상세`}>
        {head}
        <div className="erd-inspector-body">
          <p className="muted">
            아직 설계하지 않은 테이블이에요. 문답으로 컬럼을 정하면 DB에 만들어지고 여기에 컬럼과
            데이터가 나타나요.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="erd-inspector" aria-label={`${name} 상세`}>
      {head}
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'structure'} onClick={() => setTab('structure')}>
          구조
        </button>
        {loadPreview && (
          <button type="button" role="tab" aria-selected={tab === 'data'} onClick={() => setTab('data')}>
            데이터
          </button>
        )}
      </div>
      <div className="erd-inspector-body">
        {tab === 'structure' ? (
          <>
            {selected.comment && <p className="erd-comment">{selected.comment}</p>}
            <h3>컬럼</h3>
            <dl className="erd-detail">
              {selected.columns.map((c) => (
                <div key={c.name}>
                  <dt>
                    <span className="mono">{c.name}</span>
                    <span className="mono muted">
                      {shortType(c.type)}
                      {c.notNull ? ' NOT NULL' : ''}
                      {c.identity ? ' IDENTITY' : ''}
                    </span>
                  </dt>
                  {c.comment && <dd>{c.comment}</dd>}
                </div>
              ))}
            </dl>
            <h3>제약조건</h3>
            <dl className="erd-detail">
              {[...selected.constraints]
                .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
                .map((c) => (
                  <div key={c.name}>
                    <dt>
                      <span className="erd-kind">{c.kind}</span>
                      <span className="mono muted">{c.name}</span>
                    </dt>
                    <dd className="mono">{c.definition}</dd>
                    {c.comment && <dd>{c.comment}</dd>}
                  </div>
                ))}
            </dl>
            <p className="muted small erd-source">출처: pg_catalog</p>
          </>
        ) : (
          <TableData name={name} load={loadPreview!} />
        )}
      </div>
    </aside>
  );
}

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

function TableData({ name, load }: { name: string; load: (name: string) => Promise<TablePreview> }) {
  const [preview, setPreview] = useState<TablePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    load(name)
      .then((p) => !cancelled && setPreview(p))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [name, load]);

  if (error) return <p className="muted">데이터를 불러오지 못했어요: {error}</p>;
  if (!preview) return <div className="skeleton" style={{ width: '60%' }} />;

  return (
    <>
      <dl className="erd-stats">
        <div>
          <dt>행 수</dt>
          <dd className="num">{preview.rowCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>테이블 크기</dt>
          <dd className="num">{formatBytes(preview.tableBytes)}</dd>
        </div>
        {preview.indexes.map((i) => (
          <div key={i.name}>
            <dt className="mono">{i.name}</dt>
            <dd className="num">{formatBytes(i.bytes)}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">행 수는 지금 <code>count(*)</code>로 센 값 · 크기는 8KB 페이지 단위</p>
      <h3>앞쪽 {preview.sample.length}행</h3>
      <div className="erd-sample">
        <table className="table">
          <thead>
            <tr>
              {preview.columns.map((c) => (
                <th key={c} className="mono">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.sample.map((row, i) => (
              <tr key={i}>
                {preview.columns.map((c) => (
                  <td key={c} className="mono">
                    {String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const KIND_ORDER = ['PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK'];

/** 까마귀발 표기: 부모 쪽 ||(반드시 하나), 자식 쪽 o<(0개 이상) */
function CrowFootMarkers() {
  return (
    <svg className="erd-markers" aria-hidden="true">
      <defs>
        <marker
          id="erd-one"
          viewBox="0 0 20 20"
          refX="20"
          refY="10"
          markerWidth="20"
          markerHeight="20"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path d="M11 4v12M15 4v12" className="erd-marker-stroke" />
        </marker>
        <marker
          id="erd-many"
          viewBox="0 0 24 20"
          refX="24"
          refY="10"
          markerWidth="24"
          markerHeight="20"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path d="M24 3L14 10L24 17M14 10H24" className="erd-marker-stroke" />
          <circle cx="8" cy="10" r="3.5" className="erd-marker-ring" />
        </marker>
      </defs>
    </svg>
  );
}
