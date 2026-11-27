'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { MarkdownEditor, type MarkdownEditorApi, type MarkdownToolbarItem } from '@salmonui/editors/markdown-editor';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';

const TOOLBAR: readonly MarkdownToolbarItem[] = [
  'bold',
  'italic',
  'strikethrough',
  'superscript',
  'subscript',
  'uppercase',
  'lowercase',
  '|',
  'heading',
  'blockquote',
  'code',
  'codeBlock',
  'orderedList',
  'unorderedList',
  '|',
  'link',
  'image',
  'table',
  '|',
  'undo',
  'redo',
  '|',
  { id: 'signature', label: 'Insert signature', icon: (
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 2.5l2.5 2.5L6 12.5H3.5V10zM2 14.5h12" />
      </svg>
    ), onSelect: (api) => api.insertText('\n\n-- The release team\n') },
];

const initial = `Release notes

Select a word, then try the toolbar or a shortcut.
H2O and E = mc2 need sub- and superscript.
first item
second item
`;

const OVERFLOWS = ['menu', 'wrap', 'scroll'];

// Uploads become object URLs here; an application sends the file to its server and returns the stored URL.
const upload = async (file: File) => ({ src: URL.createObjectURL(file), alt: file.name.replace(/\.[^.]+$/, '') });

export default function MarkdownEditorCommandsDemo() {
  const [log, push] = useEventLog();
  const [overflow, setOverflow] = useState<'menu' | 'wrap' | 'scroll'>('menu');
  const [underscores, setUnderscores] = useState(false);
  const [blockHeadings, setBlockHeadings] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const api = useRef<MarkdownEditorApi | null>(null);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div role="group" aria-label="Options" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <label>
          Toolbar overflow{' '}
          <Select aria-label="Toolbar overflow" data={OVERFLOWS} value={overflow} onValueChange={(value) => value != null && setOverflow(value as typeof overflow)} />
        </label>
        <Checkbox checked={underscores} onCheckedChange={(checked) => setUnderscores(checked)}>
          syntax: <code>__bold__</code>, <code>* </code> bullets, <code>1)</code> numbers
        </Checkbox>
        <Checkbox checked={narrow} onCheckedChange={(checked) => setNarrow(checked)}>
          Phone width (360 px)
        </Checkbox>
        <Checkbox checked={blockHeadings} onCheckedChange={(checked) => setBlockHeadings(checked)}>
          Cancel heading commands (onBeforeCommand)
        </Checkbox>
      </div>
      <label htmlFor="markdown-commands" style={{ fontWeight: 600 }}>
        Release notes
      </label>
      <MarkdownEditor
        id="markdown-commands"
        ref={api}
        defaultValue={initial}
        toolbar={TOOLBAR}
        toolbarOverflow={overflow}
        syntax={underscores ? { bold: ['__', '__'], unorderedList: '* ', orderedList: ')' } : undefined}
        onUpload={upload}
        rows={10}
        // The toolbar measures its own width: narrow it to see the overflow modes.
        style={{ maxInlineSize: narrow ? 360 : 760 }}
        onBeforeCommand={(event) => {
          if (blockHeadings && event.id.startsWith('heading')) {
            event.preventDefault();
            push(`onBeforeCommand: ${event.id} cancelled (${event.source})`);
          }
        }}
        onCommand={(event) => push(`onCommand: ${event.id} (${event.source})`)}
        onFocus={() => push('onFocus')}
        onBlur={() => push('onBlur')}
      />
      <div role="group" aria-label="Editor API" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="outline" onClick={() => api.current?.runCommand('heading2')}>
          runCommand(&apos;heading2&apos;)
        </Button>
        <Button variant="outline" onClick={() => api.current?.wrapSelection('==', '==')}>
          wrapSelection(&apos;==&apos;, &apos;==&apos;)
        </Button>
        <Button variant="outline" onClick={() => api.current?.insertText(`Updated ${new Date().toISOString().slice(0, 10)}`)}>
          insertText(date)
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const selection = api.current?.getSelection();
            if (selection) push(`getSelection(): ${selection.start}-${selection.end} "${selection.text}"`);
          }}
        >
          getSelection()
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            api.current?.setSelection(0, 13);
            api.current?.focus();
          }}
        >
          setSelection(0, 13) + focus()
        </Button>
      </div>
      <EventLog entries={log} />
    </div>
  );
}
