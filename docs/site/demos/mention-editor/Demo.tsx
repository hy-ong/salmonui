'use client';

import { useEffect, useRef, useState } from 'react';
import { Mention, type MentionEditorTarget } from '@salmonui/dropdowns/mention';
import { createContentEditableMentionTarget, RichTextEditor } from '@salmonui/rich-text';
import '@salmonui/rich-text/styles.css';
import { EventLog, useEventLog } from '../../components/demo-kit';

const PEOPLE = [
  { value: 'ana', label: 'Ana Lima' },
  { value: 'ben', label: 'Ben Okafor' },
  { value: 'chen', label: 'Chen Wei' },
  { value: 'elif', label: 'Elif Şahin' },
  { value: 'jose', label: 'José García' },
];

// Mentions as non-editable chips: in a plain contenteditable element and in RichTextEditor.
export default function MentionEditorDemo() {
  const [log, push] = useEventLog();
  const surface = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<MentionEditorTarget | null>(null);
  // The target needs the DOM element, so it is created after mount (null renders nothing).
  useEffect(() => {
    if (surface.current) setEditor(createContentEditableMentionTarget(surface.current));
  }, []);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
      <span id="mention-editor-plain">Status update (contenteditable)</span>
      <div
        ref={surface}
        role="textbox"
        aria-multiline="true"
        aria-labelledby="mention-editor-plain"
        contentEditable
        // No React children: the user owns this element's content.
        style={{ minBlockSize: 72, padding: '8px 12px', border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-md)' }}
      />
      <Mention editor={editor} data={PEOPLE} ignoreAccents onInsert={(event) => push(`contenteditable insert: ${event.item.label}`)} />
      <span id="mention-editor-rich">Meeting notes (RichTextEditor)</span>
      <RichTextEditor
        aria-labelledby="mention-editor-rich"
        defaultValue="<p>Action items for&nbsp;</p>"
        toolbar={['bold', 'italic', 'unorderedList']}
        mentions={{ items: PEOPLE, mentionProps: { onInsert: (event) => push(`RichTextEditor insert: ${event.item.label}`) } }}
        style={{ minBlockSize: 160 }}
      />
      <EventLog entries={log} />
    </div>
  );
}
