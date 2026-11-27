'use client';

import { useEffect, useRef, useState } from 'react';
import { RichTextEditor, type RichTextAiRequest, type RichTextEditorActions } from '@salmonui/rich-text';
import { Button } from '@salmonui/buttons/button';
import '@salmonui/rich-text/styles.css';
import { EventLog, useEventLog } from '../../components/demo-kit';

const initial =
  '<h3>Release kit</h3>' +
  '<p>Insert media from the Audio and Video items, browse the demo assets from the Image or Audio dialog, import a file, or ask the assistant.</p>' +
  '<pre><code class="language-ts">const answer = 42;\n// a comment\nexport function greet(name: string) {\n  return `Hello ${name}`;\n}</code></pre>';

/** A tiny tokenizer for the highlight hook (no highlighter is bundled): keywords, strings and comments. */
const highlight = (code: string) => {
  const ranges: { from: number; to: number; className: string }[] = [];
  for (const m of code.matchAll(/\/\/[^\n]*|`[^`]*`|'[^']*'|"[^"]*"|\b(?:const|let|function|return|export|import|from)\b/g)) {
    const text = m[0];
    const className = text.startsWith('//') ? 'demo-tok-comment' : /^[`'"]/.test(text) ? 'demo-tok-string' : 'demo-tok-keyword';
    ranges.push({ from: m.index, to: m.index + text.length, className });
  }
  return ranges;
};

/** One second of a 440 Hz tone as a WAV object URL, generated in the browser. */
function makeTone(): string {
  const rate = 8000;
  const samples = rate;
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (offset: number, value: string) => [...value].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 440 * i) / rate) * 8000 * (1 - i / samples), true);
  return URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
}

function makeSwatch(color: string): string {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 90;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 160, 90);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(color, 12, 52);
  return c.toDataURL('image/png');
}

type Asset = { readonly kind: 'image' | 'audio'; readonly src: string; readonly alt: string };
type Browse = { readonly kind: 'image' | 'audio' | 'video'; readonly resolve: (asset: { src: string; alt?: string } | null) => void };

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

/** A provider-agnostic assistant: an application would call its own model endpoint and stream the text back. */
async function* fakeAssistant({ prompt, selectionHtml, signal }: RichTextAiRequest): AsyncIterable<string> {
  const subject = selectionHtml ? 'the selected text' : 'this document';
  const answer = `Here is a short take on ${subject} for "${prompt}": the release kit bundles audio, video and code samples, and every insert stays editable.`;
  for (const word of answer.split(' ')) {
    await wait(60, signal);
    yield `${word} `;
  }
}

const readText = (file: File) => file.text();
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function RichTextEditorInsertDemo() {
  const [log, push] = useEventLog();
  const [assets, setAssets] = useState<readonly Asset[]>([]);
  const [browse, setBrowse] = useState<Browse | null>(null);
  const actions = useRef<RichTextEditorActions | null>(null);
  // Generated assets need the DOM: create them after hydration.
  useEffect(() => {
    setAssets([
      { kind: 'image', src: makeSwatch('#2f7d6d'), alt: 'Teal swatch' },
      { kind: 'image', src: makeSwatch('#c0563c'), alt: 'Salmon swatch' },
      { kind: 'audio', src: makeTone(), alt: 'A 440 Hz tone' },
    ]);
  }, []);
  const dialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (browse && !dialog.current?.open) dialog.current?.showModal();
  }, [browse]);
  const pick = (asset: { src: string; alt?: string } | null) => {
    browse?.resolve(asset);
    setBrowse(null);
    dialog.current?.close();
  };
  const choices = browse ? assets.filter((asset) => asset.kind === browse.kind) : [];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <style>{'.demo-tok-keyword{color:#a0427a;font-weight:600}.demo-tok-string{color:#2f7d4f}.demo-tok-comment{color:#6b7280;font-style:italic}'}</style>
      <RichTextEditor
        aria-label="Release kit"
        defaultValue={initial}
        actionsRef={actions}
        toolbar={['bold', 'italic', '|', 'image', 'audio', 'video', 'embed', 'codeBlock', '|', 'import', 'aiAssistant', '|', 'undo', 'redo']}
        embedHosts={['www.youtube-nocookie.com', 'player.vimeo.com']}
        codeLanguages={[
          { value: 'ts', label: 'TypeScript' },
          { value: 'css', label: 'CSS' },
        ]}
        highlight={highlight}
        onUpload={async (file) => ({ src: URL.createObjectURL(file), alt: file.name })}
        onBrowseFiles={(kind) => {
          push(`onBrowseFiles: ${kind}`);
          return new Promise((resolve) => setBrowse({ kind, resolve }));
        }}
        aiAssistant={{ onRequest: fakeAssistant }}
        importAccept=".html,.htm,.txt,.md"
        onImport={async (file) => {
          push(`onImport: ${file.name}`);
          const text = await readText(file);
          return /\.html?$/i.test(file.name) ? text : text.split(/\n{2,}/).map((block) => `<p>${escapeHtml(block)}</p>`).join('');
        }}
        onCommand={(event) => push(`onCommand: ${event.command}`)}
        style={{ minBlockSize: 320 }}
      />
      {/* The application's file browser: a native modal dialog above the editor's own dialog. */}
      <dialog
        ref={dialog}
        aria-label={`Demo ${browse?.kind ?? ''} files`}
        onCancel={() => pick(null)}
        style={{ padding: 16, border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)', background: 'var(--salmon-surface-overlay)', color: 'inherit' }}
      >
        <p style={{ marginBlockStart: 0 }}>
          <strong>Your file browser ({browse?.kind})</strong>
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {choices.length === 0 ? <span>No {browse?.kind} files in this demo.</span> : null}
          {choices.map((asset) => (
            <Button key={asset.alt} variant="outline"onClick={() => pick({ src: asset.src, alt: asset.alt })}>
              {asset.alt}
            </Button>
          ))}
          <Button variant="outline" onClick={() => pick(null)}>
            Cancel
          </Button>
        </div>
      </dialog>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button
          variant="outline"
          disabled={assets.length === 0}
          onClick={() => {
            const tone = assets.find((asset) => asset.kind === 'audio');
            if (tone) actions.current?.commands.insertAudio({ src: tone.src });
          }}
        >
          Insert the generated tone
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const html = actions.current?.getHtml() ?? '';
            const url = URL.createObjectURL(new Blob([`<!doctype html><meta charset="utf-8"><title>Release kit</title>${html}`], { type: 'text/html' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = 'release-kit.html';
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export HTML
        </Button>
      </div>
      <EventLog entries={log} />
    </div>
  );
}
