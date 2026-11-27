'use client';

import { useRef, useState } from 'react';
import { RichTextEditor, type RichTextEditorActions } from '@salmonui/rich-text';
import '@salmonui/rich-text/styles.css';
import { EventLog, useEventLog } from '../../components/demo-kit';

const people = [
  { value: 'ana', label: 'Ana Lima' },
  { value: 'ben', label: 'Ben Okafor' },
  { value: 'chen', label: 'Chen Wei' },
];

const initial =
  '<h2>Release notes</h2><p>Type <strong>/</strong> for blocks, <strong>@</strong> to mention someone and <strong>:</strong> for emoji.</p>' +
  '<ul><li><p>Select text for the quick toolbar</p></li><li><p>Paste from Word: the markup is cleaned</p></li></ul>' +
  '<table><tbody><tr><th><p>Area</p></th><th><p>Status</p></th></tr><tr><td><p>Editor</p></td><td><p>Ready</p></td></tr></tbody></table>';

// Uploads become object URLs here; an application sends the file to its server and returns the stored URL.
const upload = async (file: File) => ({ src: URL.createObjectURL(file), alt: file.name });

export default function RichTextEditorDemo() {
  const [log, push] = useEventLog();
  const [html, setHtml] = useState(initial);
  const actions = useRef<RichTextEditorActions | null>(null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <RichTextEditor
        aria-label="Release notes"
        defaultValue={initial}
        actionsRef={actions}
        onChange={setHtml}
        changeDelay={150}
        onUpload={upload}
        mentions={{ items: people }}
        showCount
        maxLength={5000}
        resizable
        onCommand={(event) => push(`command: ${event.command}`)}
        style={{ minBlockSize: 320 }}
      />
      <details>
        <summary>HTML value ({html.length} characters)</summary>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{html}</pre>
      </details>
      <EventLog entries={log} />
    </div>
  );
}
