import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { TableInfo } from '../../../lab/introspect';

export type TableNodeData = {
  name: string;
  role?: string;
  /** 문서에는 있지만 아직 DB에 만들지 않은 테이블 */
  table: TableInfo | null;
};

export type TableNodeType = Node<TableNodeData, 'table'>;

export const HEADER_HEIGHT = 38;
export const ROW_HEIGHT = 26;
export const NODE_WIDTH = 248;
export const PLANNED_WIDTH = 200;
export const PLANNED_HEIGHT = 74;

/** PostgreSQL의 긴 타입 이름을 ERD 도구에서 흔히 쓰는 짧은 이름으로 */
export function shortType(type: string): string {
  return type
    .replace('character varying', 'varchar')
    .replace('timestamp with time zone', 'timestamptz')
    .replace('timestamp without time zone', 'timestamp');
}

export function columnRoles(table: TableInfo) {
  const pk = new Set<string>();
  const fk = new Set<string>();
  const unique = new Set<string>();
  for (const c of table.constraints) {
    const target = c.kind === 'PRIMARY KEY' ? pk : c.kind === 'FOREIGN KEY' ? fk : c.kind === 'UNIQUE' ? unique : null;
    c.columns.forEach((col) => target?.add(col));
  }
  return { pk, fk, unique };
}

export function TableNode({ data, selected }: NodeProps<TableNodeType>) {
  const head = (
    <div className="erd-head">
      <span className="erd-name">{data.name}</span>
      {data.role && <span className="erd-role">{data.role}</span>}
      <Handle type="target" position={Position.Left} id="table:l" className="erd-handle" />
      <Handle type="source" position={Position.Right} id="table:r" className="erd-handle" />
    </div>
  );

  if (!data.table) {
    return (
      <div className="erd-table" data-planned data-selected={selected || undefined}>
        {head}
        <p className="erd-planned-note">설계 예정 · 아직 컬럼이 없어요</p>
      </div>
    );
  }

  const { pk, fk, unique } = columnRoles(data.table);
  return (
    <div className="erd-table" data-selected={selected || undefined}>
      {head}
      <ul className="erd-columns">
        {data.table.columns.map((column) => (
          <li key={column.name} className="erd-column">
            <Handle
              type="target"
              position={Position.Left}
              id={`${column.name}:l`}
              className="erd-handle"
            />
            <span className="erd-key" aria-hidden="true">
              {pk.has(column.name) ? <KeyIcon /> : fk.has(column.name) ? <LinkIcon /> : null}
            </span>
            <span className="erd-column-name" data-pk={pk.has(column.name) || undefined}>
              {column.name}
            </span>
            <span className="erd-flags">
              {unique.has(column.name) && <abbr title="UNIQUE 제약에 포함">UQ</abbr>}
              {column.notNull && !pk.has(column.name) && <abbr title="NOT NULL">NN</abbr>}
            </span>
            <span className="erd-column-type">{shortType(column.type)}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={`${column.name}:r`}
              className="erd-handle"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 16 16" className="erd-icon erd-icon-pk">
      <circle cx="5" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 8h6M12 8v2.5M14 8v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="erd-icon erd-icon-fk">
      <path
        d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
