'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { TextArea } from '@salmonui/inputs/text-field';
import { InlineAssist, type InlineAssistAdapter, type InlineAssistCommand } from '@salmonui/chat/inline-assist';
import { EventLog, useEventLog } from '../../components/demo-kit';

const commands: readonly InlineAssistCommand[] = [
  { id: 'improve', label: 'Improve writing', prompt: 'Improve the writing' },
  { id: 'shorter', label: 'Make shorter', keywords: ['summarize', 'concise'] },
  { id: 'formal', label: 'Make it formal' },
  { id: 'translate', label: 'Translate to French' },
];

/** Resolves after `ms`, or right away when the signal aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });
}

function answer(prompt: string, selection: string): string {
  const text = selection.trim() || 'your draft';
  const p = prompt.toLowerCase();
  if (p.includes('short')) return text.split(/[.!?]/u)[0]!.trim() + '.';
  if (p.includes('formal')) return `We would like to inform you that ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  if (p.includes('french')) return `(fr) ${text}`;
  return `${text.replace(/\s+/gu, ' ')}\n\nThis rewrite was produced in your browser by a fake adapter for "${prompt}".`;
}

// A fake model: an async generator that yields one word every 40 ms (no network, no API key).
const fakeModel: InlineAssistAdapter = async function* (request, { signal }) {
  await wait(300, signal);
  for (const word of answer(request.prompt, request.selection).split(/(?<=\s)/u)) {
    if (signal.aborted) return;
    await wait(40, signal);
    yield word;
  }
};

export default function InlineAssistBasicDemo() {
  const editor = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState('');
  const [log, push] = useEventLog();
  const openAssist = (): void => {
    const el = editor.current;
    if (!el) return;
    setSelection(el.value.slice(el.selectionStart, el.selectionEnd));
    setOpen(true);
  };
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <div>
        <Button onClick={openAssist}>
          Ask AI
        </Button>{' '}
        <small>Select text in the editor first, or press Ctrl+Space inside it.</small>
      </div>
      <TextArea
        ref={editor}
        label="Draft"
        rows={6}
        defaultValue="thanks for the update. the release moves to friday because the tests found two bugs. we will ship once they are fixed."
        onKeyDown={(event) => {
          if (event.key === ' ' && event.ctrlKey) {
            event.preventDefault();
            openAssist();
          }
        }}
      />
      <InlineAssist
        anchor={editor}
        open={open}
        onOpenChange={(next, event) => {
          push(`open: ${next} (${event.reason})`);
          setOpen(next);
        }}
        adapter={fakeModel}
        selection={selection}
        commands={commands}
        onCommandSelect={(event) => push(`command: ${event.command.id}`)}
        onSend={(event) => push(`send: ${JSON.stringify(event.request.prompt)} on ${event.request.selection.length} selected characters`)}
        onMessagesChange={(next, event) => push(`messages (${event.reason}): ${next.length}`)}
        onAccept={(event) => {
          const el = editor.current;
          if (!el) return;
          // Replace the selection (or insert at the caret) through the native input path.
          el.setRangeText(event.text, el.selectionStart, el.selectionEnd, 'select');
          push('accept: text inserted');
        }}
        onDiscard={() => push('discard')}
      />
      <EventLog entries={log} />
    </div>
  );
}
