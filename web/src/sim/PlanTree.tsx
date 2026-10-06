import type { PlanNode } from '../../../lab/plan';

/** EXPLAIN ANALYZE 결과를 단계 트리로 그린다. 안쪽(아래) 단계부터 실행된다 */
export function PlanTree({ node }: { node: PlanNode }) {
  return (
    <ol className="plan">
      <PlanItem node={node} />
    </ol>
  );
}

function PlanItem({ node }: { node: PlanNode }) {
  const scanAll = node.type === 'Seq Scan' || node.type === 'Parallel Seq Scan';
  return (
    <li>
      <div className="plan-node" data-kind={scanAll ? 'seq' : node.type.includes('Index') ? 'index' : undefined}>
        <div className="plan-title">
          <strong>{node.type}</strong>
          {node.relation && (
            <span className="mono muted">
              on {node.relation}
            </span>
          )}
          {node.index && <span className="mono muted">using {node.index}</span>}
        </div>
        <dl className="plan-metrics">
          <div>
            <dt>실제 행</dt>
            <dd className="num">{node.actualRows.toLocaleString()}</dd>
          </div>
          <div>
            <dt>시간</dt>
            <dd className="num">{node.totalMs.toFixed(3)}ms</dd>
          </div>
          <div>
            <dt>버퍼 hit / read</dt>
            <dd className="num">
              {node.sharedHit.toLocaleString()} / {node.sharedRead.toLocaleString()}
            </dd>
          </div>
          {node.loops > 1 && (
            <div>
              <dt>반복</dt>
              <dd className="num">{node.loops}</dd>
            </div>
          )}
        </dl>
        {node.condition && <p className="plan-cond mono">조건: {node.condition}</p>}
        {node.filter && <p className="plan-cond mono">필터: {node.filter}</p>}
        {node.rowsRemovedByFilter !== undefined && node.rowsRemovedByFilter > 0 && (
          <p className="plan-removed">
            읽었지만 버린 행 <strong className="num">{node.rowsRemovedByFilter.toLocaleString()}</strong>
            {node.loops > 1 && ` (워커당)`}
          </p>
        )}
      </div>
      {node.children.length > 0 && (
        <ol>
          {node.children.map((child, i) => (
            <PlanItem key={i} node={child} />
          ))}
        </ol>
      )}
    </li>
  );
}
