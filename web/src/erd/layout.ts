export interface PlannedRelation {
  parent: string;
  child: string;
  label: string;
}

/** step 문서의 mermaid erDiagram에서 `부모 ||--o{ 자식 : "라벨"` 관계를 읽는다 */
export function parseRelations(mermaid: string): PlannedRelation[] {
  const pattern = /^\s*(\w+)\s+\|\|--o\{\s+(\w+)\s*:\s*"([^"]*)"/gm;
  return [...mermaid.matchAll(pattern)].map(([, parent, child, label]) => ({
    parent,
    child,
    label,
  }));
}

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

/**
 * 부모 → 자식 방향으로 왼쪽에서 오른쪽에 열을 쌓는 계층 배치.
 * 테이블이 열 개 안팎이라 레이아웃 라이브러리 없이 충분하다.
 */
export function layeredLayout(
  nodes: LayoutNode[],
  edges: { parent: string; child: string }[],
  { columnGap = 72, rowGap = 32 } = {},
): Record<string, { x: number; y: number }> {
  const ids = new Set(nodes.map((n) => n.id));
  const parents = new Map(nodes.map((n) => [n.id, [] as string[]]));
  const children = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const { parent, child } of edges) {
    if (!ids.has(parent) || !ids.has(child) || parent === child) continue;
    parents.get(child)!.push(parent);
    children.get(parent)!.push(child);
  }

  // 1. 랭크: 가장 긴 부모 경로의 길이
  const rank = new Map<string, number>();
  const visit = (id: string, path: Set<string>): number => {
    if (rank.has(id)) return rank.get(id)!;
    if (path.has(id)) return 0;
    path.add(id);
    const r = Math.max(-1, ...parents.get(id)!.map((p) => visit(p, path))) + 1;
    path.delete(id);
    rank.set(id, r);
    return r;
  };
  for (const n of nodes) visit(n.id, new Set());

  // 2. 부모가 없는 테이블은 가장 가까운 자식 바로 왼쪽으로 당긴다 (긴 선을 줄인다)
  for (const n of nodes) {
    const kids = children.get(n.id)!;
    if (parents.get(n.id)!.length === 0 && kids.length > 0) {
      rank.set(n.id, Math.max(0, Math.min(...kids.map((k) => rank.get(k)!)) - 1));
    }
  }

  // 3. 열마다 부모의 평균 위치 순으로 정렬해 선이 덜 꼬이게 한다
  const columns: LayoutNode[][] = [];
  for (const n of nodes) (columns[rank.get(n.id)!] ??= []).push(n);
  const order = new Map<string, number>();
  const barycenter = (n: LayoutNode) => {
    const placed = parents.get(n.id)!.filter((p) => order.has(p));
    return placed.length
      ? placed.reduce((sum, p) => sum + order.get(p)!, 0) / placed.length
      : Number.MAX_SAFE_INTEGER;
  };
  columns.forEach((column = []) => {
    column.sort((a, b) => barycenter(a) - barycenter(b));
    column.forEach((n, i) => order.set(n.id, i));
  });

  // 4. 좌표: 열 너비는 그 열에서 가장 넓은 테이블에 맞추고, 열마다 세로 가운데 정렬
  const columnX: number[] = [];
  columns.reduce((x, column = [], ci) => {
    columnX[ci] = x;
    return x + Math.max(0, ...column.map((n) => n.width)) + columnGap;
  }, 0);
  const heights = columns.map(
    (column = []) =>
      column.reduce((sum, n) => sum + n.height, 0) + rowGap * Math.max(0, column.length - 1),
  );
  const tallest = Math.max(...heights);
  const positions: Record<string, { x: number; y: number }> = {};
  columns.forEach((column = [], ci) => {
    let y = (tallest - heights[ci]) / 2;
    for (const n of column) {
      positions[n.id] = { x: columnX[ci], y };
      y += n.height + rowGap;
    }
  });
  return positions;
}

/** 마크다운의 ```mermaid 블록을 꺼낸다. 문서와 화면이 같은 관계 정의를 쓰게 하기 위함 */
export function extractMermaid(markdown: string): string {
  return markdown.match(/```mermaid\n([\s\S]*?)```/)?.[1] ?? '';
}
