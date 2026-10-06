/**
 * 좌석 등급 팔레트 (Q28, Q29). DB의 grades.color에는 아래 키만 들어간다.
 * 실제 색은 이 디자인 시스템이 정한다. 키를 더하거나 빼면 schema.sql의 CHECK도 같은 배포에서 고친다.
 * 두 목록이 같은지는 experiments의 테스트가 pg_catalog를 읽어 확인한다.
 *
 * 좌석은 작은 그래픽이라, 배경(--surface) 대비 3:1 이상이어야 한다 (WCAG 1.4.11).
 * 밝은 화면과 어두운 화면 모두 테스트로 확인한다.
 */
export const GRADE_PALETTE = {
  red: { label: '빨강', light: '#d63c3c', dark: '#f06464' },
  orange: { label: '주황', light: '#c8620a', dark: '#f08c3a' },
  gold: { label: '금색', light: '#a87a00', dark: '#e0b030' },
  green: { label: '초록', light: '#23883a', dark: '#46c062' },
  teal: { label: '청록', light: '#0e8585', dark: '#2fbcbc' },
  blue: { label: '파랑', light: '#2a6fd6', dark: '#5b9cf0' },
  pink: { label: '분홍', light: '#c93d8f', dark: '#ec6fb8' },
  gray: { label: '회색', light: '#6b7480', dark: '#9aa3ae' },
} as const;

export type GradeColor = keyof typeof GRADE_PALETTE;

export const GRADE_COLORS = Object.keys(GRADE_PALETTE) as GradeColor[];
