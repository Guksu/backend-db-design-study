import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface HelpTopic {
  title: string;
  body: ReactNode;
}

interface HelpState {
  topicId: string | null;
  open: (topicId: string) => void;
  close: () => void;
  topics: Record<string, HelpTopic>;
}

const HelpContext = createContext<HelpState | null>(null);

/** AWS 콘솔의 "정보" 패널처럼, 개념 설명을 오른쪽 패널에 연다 */
export function HelpProvider({ topics, children }: { topics: Record<string, HelpTopic>; children: ReactNode }) {
  const [topicId, setTopicId] = useState<string | null>(null);
  return (
    <HelpContext.Provider
      value={{ topicId, topics, open: setTopicId, close: () => setTopicId(null) }}
    >
      {children}
    </HelpContext.Provider>
  );
}

export function useHelp() {
  const context = useContext(HelpContext);
  if (!context) throw new Error('HelpProvider가 필요해요');
  return context;
}

/** 제목 옆에 붙는 "정보" 링크 */
export function InfoLink({ topic, label = '정보' }: { topic: string; label?: string }) {
  const { open, topicId } = useHelp();
  return (
    <button
      type="button"
      className="info-link"
      aria-pressed={topicId === topic}
      onClick={() => open(topic)}
    >
      {label}
    </button>
  );
}

export function HelpPanel() {
  const { topicId, topics, close } = useHelp();
  const topic = topicId ? topics[topicId] : null;

  useEffect(() => {
    if (!topic) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [topic, close]);

  if (!topic) return null;
  return (
    <aside className="help-panel" aria-label={`도움말: ${topic.title}`}>
      <header className="help-head">
        <h2>{topic.title}</h2>
        <button type="button" className="icon-button" onClick={close} aria-label="도움말 닫기">
          <Icon name="close" />
        </button>
      </header>
      <div className="help-body">{topic.body}</div>
    </aside>
  );
}
