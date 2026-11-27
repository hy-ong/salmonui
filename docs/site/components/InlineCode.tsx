import type { ReactNode } from 'react';

/**
 * Renders a plain-text front-matter string (a demo description) with its
 * `backtick` spans as <code>, the only markdown those strings use.
 */
export function InlineCode({ text }: { text: string }): ReactNode {
  const parts = text.split(/`([^`]+)`/);
  if (parts.length === 1) return text;
  return parts.map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part));
}
