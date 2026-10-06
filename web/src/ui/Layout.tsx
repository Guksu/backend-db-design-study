import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { InfoLink } from './Help';
import { Icon, type IconName } from './Icon';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="현재 위치">
      <ol>
        {items.map((item, i) => (
          <li key={i}>
            {item.href && i < items.length - 1 ? <a href={item.href}>{item.label}</a> : <span aria-current={i === items.length - 1 ? 'page' : undefined}>{item.label}</span>}
            {i < items.length - 1 && <Icon name="chevronRight" size={12} className="breadcrumb-sep" />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface PageHeaderProps {
  crumbs: Crumb[];
  title: string;
  description: ReactNode;
  info?: string;
  actions?: ReactNode;
}

export function PageHeader({ crumbs, title, description, info, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <Breadcrumbs items={crumbs} />
      <div className="page-title-row">
        <div className="page-title">
          <h1>
            {title}
            {info && <InfoLink topic={info} />}
          </h1>
          <p>{description}</p>
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  );
}

interface ContainerProps {
  title?: ReactNode;
  description?: ReactNode;
  info?: string;
  actions?: ReactNode;
  /** 표처럼 테두리까지 꽉 채우는 본문 */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

/** 제목 · 설명 · 동작을 가진 기본 영역. AWS 콘솔의 Container와 같은 역할 */
export function Container({ title, description, info, actions, flush, className, children }: ContainerProps) {
  return (
    <section className={`container ${className ?? ''}`}>
      {(title || actions) && (
        <header className="container-head">
          <div>
            {title && (
              <h2>
                {title}
                {info && <InfoLink topic={info} />}
              </h2>
            )}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="container-actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'container-body flush' : 'container-body'}>{children}</div>
    </section>
  );
}

export type Status = 'success' | 'error' | 'warning' | 'info' | 'stopped' | 'pending';

const STATUS_ICON: Record<Status, IconName> = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
  stopped: 'stopped',
  pending: 'pending',
};

/** 상태는 항상 아이콘과 글자를 같이 쓴다 */
export function StatusIndicator({ type, children }: { type: Status; children: ReactNode }) {
  return (
    <span className="status" data-status={type}>
      <Icon name={STATUS_ICON[type]} />
      <span>{children}</span>
    </span>
  );
}

export function Alert({ type, title, children }: { type: Status; title?: ReactNode; children: ReactNode }) {
  return (
    <div className="alert" data-status={type} role={type === 'error' ? 'alert' : undefined}>
      <Icon name={STATUS_ICON[type]} className="alert-icon" />
      <div>
        {title && <strong className="alert-title">{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function KeyValue({ items, columns = 4 }: { items: { label: string; value: ReactNode; hint?: string }[]; columns?: number }) {
  return (
    <dl className="key-value" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.hint && <dd className="key-value-hint">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

interface ExplainerProps {
  /** 각 칸은 한 줄로 짧게. 긴 설명은 more에 둔다 */
  question: ReactNode;
  method: ReactNode;
  reading: ReactNode;
  /** 실행 전에는 비워 둔다 */
  result: ReactNode | null;
  /** "자세히"를 눌렀을 때만 보이는 긴 설명 */
  more?: ReactNode;
}

/**
 * 모든 실험 페이지 맨 위의 "실험 안내".
 * 기본은 한 줄씩만 보여 주고, 긴 설명은 "자세히"로 펼친다.
 */
export function Explainer({ question, method, reading, result, more }: ExplainerProps) {
  const [open, setOpen] = useState(false);
  return (
    <section className="container explainer" aria-labelledby="explainer-title">
      <header className="explainer-head">
        <h2 id="explainer-title">실험 안내</h2>
        {more && (
          <button type="button" className="disclosure" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
            {open ? '접기' : '자세히'}
          </button>
        )}
      </header>
      <div className="explainer-grid">
        <div>
          <h3>확인할 것</h3>
          <div>{question}</div>
        </div>
        <div>
          <h3>방법</h3>
          <div>{method}</div>
        </div>
        <div>
          <h3>읽는 법</h3>
          <div>{reading}</div>
        </div>
        <div className="explainer-result" data-empty={result ? undefined : true}>
          <h3>결과</h3>
          <div>{result ?? '실행하면 여기에 나와요'}</div>
        </div>
      </div>
      {open && more && <div className="explainer-more">{more}</div>}
    </section>
  );
}

export function Button({
  variant = 'normal',
  icon,
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'normal';
  icon?: IconName;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      className={variant === 'primary' ? 'btn btn-primary' : 'btn'}
      aria-busy={loading || undefined}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

/** SQL · 메시지를 복사한다 */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // 클립보드 권한이 없으면 조용히 넘어간다
        }
      }}
    >
      {copied ? '복사됨' : '복사'}
    </button>
  );
}
