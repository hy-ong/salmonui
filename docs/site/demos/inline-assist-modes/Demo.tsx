'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';
import { TextArea } from '@salmonui/inputs/text-field';
import { InlineAssist, type InlineAssistAdapter, type InlineAssistApi, type InlineAssistMode } from '@salmonui/chat/inline-assist';
import type { SpeechRecognizer, SpeechRecognizerResult } from '@salmonui/inputs/speech-to-text';
import { EventLog, useEventLog } from '../../components/demo-kit';

/** Resolves after `ms`, or right away when the signal aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });
}

/** A Markdown answer: a bold heading, a short paragraph and a bullet list. */
function answer(prompt: string, selection: string): string {
  const text = selection.trim().replace(/\s+/gu, ' ') || 'The release moves to Friday because the tests found two bugs.';
  const sentences = text.split(/(?<=[.!?])\s+/u).filter(Boolean);
  if (/summar|short|concise/iu.test(prompt)) return `**Summary**\n\n${sentences[0] ?? text}\n\n- ${sentences.length} sentence(s) in the selection\n- Asked: "${prompt}"`;
  const polished = sentences.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  return `**Suggested rewrite**\n\n${polished}\n\n- Capitalized ${sentences.length} sentence(s)\n- Asked: "${prompt}"`;
}

// A fake model (no network, no API key): Markdown text, one word every 40 ms.
const fakeModel: InlineAssistAdapter = async function* (request, { signal }) {
  await wait(300, signal);
  for (const word of answer(request.prompt, request.selection).split(/(?<=\s)/u)) {
    if (signal.aborted) return;
    await wait(40, signal);
    yield word;
  }
};

/** `**bold**` spans of one line as React nodes. */
function inline(line: string): ReactNode[] {
  return line.split(/(\*\*[^*\n]+\*\*)/u).map((s, i) => (s.length > 4 && s.startsWith('**') && s.endsWith('**') ? <strong key={i}>{s.slice(2, -2)}</strong> : s));
}

/**
 * A small application Markdown renderer for `renderContent`: paragraphs,
 * `- ` bullet lists and `**bold**`, returned as React nodes. Swap in your
 * Markdown library here; model output is never rendered as an HTML string.
 */
function renderMarkdown(text: string, { streaming }: { readonly streaming: boolean }): ReactNode {
  const blocks = text.split(/\n{2,}/u);
  return (
    <div className="salmon-inline-assist__text" style={{ whiteSpace: 'normal' }}>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i} style={{ margin: '4px 0', paddingInlineStart: 20 }}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} style={{ margin: '4px 0' }}>
            {inline(block)}
          </p>
        );
      })}
      {streaming ? <span aria-hidden="true">▍</span> : null}
    </div>
  );
}

/**
 * A scripted recognizer for `InlineAssist.Dictation` (the Inputs
 * `SpeechRecognizer` contract): it "hears" a fixed phrase word by word, so
 * the demo works without a microphone or browser speech support.
 */
function scriptedRecognizer(): SpeechRecognizer {
  const words = ['make', 'it', 'shorter', 'and', 'friendlier'];
  const timers: ReturnType<typeof setTimeout>[] = [];
  const result = (transcript: string, isFinal: boolean): SpeechRecognizerResult => ({ isFinal, length: 1, 0: { transcript } });
  const end = (): void => {
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    r.onend?.({});
  };
  const r: SpeechRecognizer = {
    lang: 'en-US',
    continuous: true,
    interimResults: true,
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    start() {
      timers.push(setTimeout(() => r.onstart?.({}), 0));
      words.forEach((_, i) => {
        timers.push(
          setTimeout(() => {
            const last = i === words.length - 1;
            r.onresult?.({ results: { length: 1, 0: result(words.slice(0, i + 1).join(' '), last) } });
            if (last) end();
          }, 400 * (i + 1)),
        );
      });
    },
    stop: end,
    abort: end,
  };
  return r;
}

const MODES: readonly InlineAssistMode[] = ['popover', 'inline'];
const PLACEMENTS = ['inline', 'bottom'] as const;

export default function InlineAssistModesDemo() {
  const editor = useRef<HTMLTextAreaElement | null>(null);
  const assist = useRef<InlineAssistApi | null>(null);
  const [mode, setMode] = useState<InlineAssistMode>('popover');
  const [placement, setPlacement] = useState<(typeof PLACEMENTS)[number]>('bottom');
  const [customComposer, setCustomComposer] = useState(true);
  const [scripted, setScripted] = useState(true);
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState('');
  const countId = useId();
  const [log, push] = useEventLog();
  const openAssist = (): void => {
    const el = editor.current;
    if (!el) return;
    setSelection(el.value.slice(el.selectionStart, el.selectionEnd));
    setOpen(true);
  };
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <RadioGroup
          label="Mode"
          name="ia-mode"
          orientation="horizontal"
          value={mode}
          onValueChange={(value) => {
            setOpen(false);
            setMode(value as InlineAssistMode);
          }}
        >
          {MODES.map((m) => (
            <Radio key={m} value={m}>
              {m}
            </Radio>
          ))}
        </RadioGroup>
        <RadioGroup label="Toolbar placement" name="ia-toolbar" orientation="horizontal" value={placement} onValueChange={(value) => setPlacement(value as (typeof PLACEMENTS)[number])}>
          {PLACEMENTS.map((p) => (
            <Radio key={p} value={p}>
              {p}
            </Radio>
          ))}
        </RadioGroup>
        <Checkbox checked={customComposer} onCheckedChange={(checked) => setCustomComposer(checked)}>
          renderComposer
        </Checkbox>
        <Checkbox checked={scripted} onCheckedChange={(checked) => setScripted(checked)}>
          Scripted speech
        </Checkbox>
      </div>
      <div>
        <Button onClick={openAssist}>
          Ask AI
        </Button>{' '}
        <small>Select text first, or press Ctrl+Space in the editor.</small>
      </div>
      <TextArea
        ref={editor}
        label="Release note"
        rows={4}
        defaultValue="the release moves to friday because the tests found two bugs. we will ship once they are fixed."
        onKeyDown={(event) => {
          if (event.key === ' ' && event.ctrlKey) {
            event.preventDefault();
            openAssist();
          }
        }}
      />
      <InlineAssist
        ref={assist}
        mode={mode}
        anchor={editor}
        open={open}
        onOpenChange={(next, event) => {
          push(`open: ${next} (${event.reason})`);
          setOpen(next);
        }}
        adapter={fakeModel}
        selection={selection}
        localeText={{ label: 'Writing assistant' }}
        toolbarPlacement={placement}
        toolbar={
          <>
            <Button variant="outline" onClick={() => assist.current?.send('Summarize')}>
              Summarize
            </Button>
            <Button variant="outline" onClick={() => assist.current?.send('Fix capitalization')}>
              Fix capitalization
            </Button>
          </>
        }
        renderComposer={
          customComposer
            ? ({ inputProps, value }) => (
                <div style={{ display: 'grid', flex: 1, gap: 2 }}>
                  <textarea {...inputProps} maxLength={120} aria-describedby={countId} />
                  <small id={countId} style={{ color: 'var(--salmon-text-secondary)' }}>
                    {value.length} / 120
                  </small>
                </div>
              )
            : undefined
        }
        renderContent={renderMarkdown}
        onSend={(event) => push(`send: ${JSON.stringify(event.request.prompt)}`)}
        onAccept={(event) => {
          const el = editor.current;
          if (!el) return;
          // Plain text into the editor: drop the Markdown markers.
          const plain = event.text.replace(/\*\*/gu, '').replace(/^- /gmu, '');
          el.setRangeText(plain, el.selectionStart, el.selectionEnd, 'select');
          push('accept: text inserted');
        }}
        onDiscard={() => push('discard')}
      >
        <InlineAssist.Dictation recognizer={scripted ? scriptedRecognizer : undefined} onStart={() => push('dictation: start')} onStop={() => push('dictation: stop')} />
      </InlineAssist>
      <EventLog entries={log} />
    </div>
  );
}
