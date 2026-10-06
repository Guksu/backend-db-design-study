/** EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 결과를 화면에 그리기 좋은 트리로 바꾼다 */

export interface PlanNode {
  type: string;
  relation?: string;
  index?: string;
  condition?: string;
  filter?: string;
  rowsRemovedByFilter?: number;
  actualRows: number;
  /** 이 노드까지 걸린 시간 (ms, loops 반영) */
  totalMs: number;
  loops: number;
  sharedHit: number;
  sharedRead: number;
  children: PlanNode[];
}

interface RawPlan {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Index Cond'?: string;
  'Recheck Cond'?: string;
  Filter?: string;
  'Rows Removed by Filter'?: number;
  'Actual Rows': number;
  'Actual Total Time': number;
  'Actual Loops': number;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  Plans?: RawPlan[];
}

export function toPlanNode(raw: RawPlan): PlanNode {
  return {
    type: raw['Node Type'],
    relation: raw['Relation Name'],
    index: raw['Index Name'],
    condition: raw['Index Cond'] ?? raw['Recheck Cond'],
    filter: raw.Filter,
    rowsRemovedByFilter: raw['Rows Removed by Filter'],
    actualRows: raw['Actual Rows'],
    totalMs: raw['Actual Total Time'] * raw['Actual Loops'],
    loops: raw['Actual Loops'],
    sharedHit: raw['Shared Hit Blocks'] ?? 0,
    sharedRead: raw['Shared Read Blocks'] ?? 0,
    children: (raw.Plans ?? []).map(toPlanNode),
  };
}
