'use client';

import { useState, type ReactNode } from 'react';
import { MarkdownEditor } from '@salmonui/editors/markdown-editor';

const initial = `# Release notes

Salmon UI **v1** ships the *Data Grid*.

- Virtualized rows
- Excel-like editing
`;

/** A deliberately tiny renderer (no HTML strings): headings, list items, bold and italics. */
function renderLite(source: string): ReactNode {
  const inline = (text: string, key: number): ReactNode[] =>
    text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) =>
      part.startsWith('**') ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong> : part.startsWith('*') && part.length > 2 ? <em key={`${key}-${i}`}>{part.slice(1, -1)}</em> : part,
    );
  return source.split('\n').map((line, i) => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      return level === 1 ? <h3 key={i}>{inline(heading[2]!, i)}</h3> : <h4 key={i}>{inline(heading[2]!, i)}</h4>;
    }
    if (/^[-*+]\s/.test(line)) return <div key={i}>• {inline(line.slice(2), i)}</div>;
    return line.trim() ? <p key={i} style={{ margin: '4px 0' }}>{inline(line, i)}</p> : null;
  });
}

export default function MarkdownEditorDemo() {
  const [value, setValue] = useState(initial);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label htmlFor="markdown-demo">Release notes</label>
      <MarkdownEditor id="markdown-demo" value={value} onValueChange={setValue} defaultPreview="split" renderPreview={renderLite} maxLength={2000} showCount rows={10} />
    </div>
  );
}
