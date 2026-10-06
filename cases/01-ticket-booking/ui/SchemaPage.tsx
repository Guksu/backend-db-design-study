import { ErdCanvas } from '@web/erd/ErdCanvas';
import { extractMermaid, parseRelations } from '@web/erd/layout';
import { api } from '@web/lib/api';
import { Container, PageHeader } from '@web/ui/Layout';
import type { TablePreview } from '../../../lab/introspect';
import doc from '../step01-erd.md?raw';
import { crumbs, RequireSchema, ResetButton, useCase } from './TicketCase';

const RELATIONS = parseRelations(extractMermaid(doc));

/** 테이블 성격. step01-erd.md의 "현재 구조" 표와 같다 */
const ROLES: Record<string, string> = {
  venues: '정적',
  seats: '정적',
  concerts: '정적',
  schedules: '정적',
  grades: '참조',
  schedule_seats: '동적',
  reservations: '이력',
  users: '정적',
};

const loadPreview = (name: string) => api<TablePreview>(`/ticket/tables/${encodeURIComponent(name)}/preview`);

export function SchemaPage() {
  const { tables } = useCase();
  return (
    <div className="page">
      <PageHeader
        crumbs={crumbs('스키마')}
        title="스키마"
        info="erd"
        description="DB 카탈로그에서 읽은 실제 구조예요. 테이블을 누르면 상세가 열려요."
        actions={<ResetButton />}
      />
      <RequireSchema>
        <Container title="ERD" flush>
          <ErdCanvas
            tables={tables!}
            relations={RELATIONS}
            roles={ROLES}
            storageKey="erd-positions:ticket"
            loadPreview={loadPreview}
          />
        </Container>
      </RequireSchema>
    </div>
  );
}
