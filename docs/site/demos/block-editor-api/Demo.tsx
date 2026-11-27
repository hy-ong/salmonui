'use client';

import { useRef, useState } from 'react';
import { BlockEditor, blocksToHtml, htmlToBlocks, type Block, type BlockEditorActions } from '@salmonui/rich-text';
import '@salmonui/rich-text/styles.css';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { EventLog, useEventLog } from '../../components/demo-kit';

const text = (value: string) => [{ type: 'text' as const, text: value }];

const initial: Block[] = [
  { id: 'title', type: 'heading', props: { level: 2 }, content: text('Sprint review') },
  { id: 'intro', type: 'paragraph', content: text('Right click a block for the context menu, or use the buttons below to edit blocks from code.') },
  {
    id: 'scores',
    type: 'table',
    props: {
      headerRow: true,
      rows: [
        [text('Team'), text('Points')],
        [text('Editors'), text('21')],
        [text('Grid'), text('34')],
      ],
    },
  },
  { id: 'snippet', type: 'code', props: { language: 'ts' }, content: text("const done = tasks.filter((task) => task.done); // filtered\nexport default done;") },
  { id: 'next', type: 'paragraph', content: text('Type / and pick Image to upload a picture.') },
];

const highlight = (code: string) =>
  [...code.matchAll(/\/\/[^\n]*|\b(?:const|export|default|return)\b/g)].map((m) => ({ from: m.index, to: m.index + m[0].length, className: m[0].startsWith('//') ? 'demo-tok-comment' : 'demo-tok-keyword' }));

const AR_TEXT = { slashMenu: 'إدراج كتلة', turnInto: 'تحويل إلى', duplicate: 'تكرار', delete: 'حذف', moveUp: 'نقل لأعلى', moveDown: 'نقل لأسفل', cut: 'قص', copy: 'نسخ' };

const UNSAFE = '<h3 onclick="alert(1)">Pasted heading</h3><p>Safe text <img src=x onerror="alert(1)"><a href="javascript:alert(1)">bad link</a></p><script>alert(1)</script>';

export default function BlockEditorApiDemo() {
  const [log, push] = useEventLog();
  const [readOnly, setReadOnly] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [blockPaste, setBlockPaste] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const actions = useRef<BlockEditorActions | null>(null);
  const count = useRef(0);
  const act = (fn: (a: BlockEditorActions) => void) => () => {
    if (actions.current) fn(actions.current);
  };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <style>{'.demo-tok-keyword{color:#a0427a;font-weight:600}.demo-tok-comment{color:#6b7280;font-style:italic}'}</style>
      <div role="group" aria-label="Options" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Checkbox checked={readOnly} onCheckedChange={(checked) => setReadOnly(checked)}>
          readOnly
        </Checkbox>
        <Checkbox checked={blockPaste} onCheckedChange={(checked) => setBlockPaste(checked)}>
          Cancel pastes with images (onBeforePaste)
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left (Arabic menus)
        </Checkbox>
      </div>
      <div dir={rtl ? 'rtl' : 'ltr'}>
        <BlockEditor
          aria-label="Sprint review"
          defaultValue={initial}
          actionsRef={actions}
          readOnly={readOnly}
          undoLimit={100}
          codeLanguages={[
            { value: 'ts', label: 'TypeScript' },
            { value: 'css', label: 'CSS' },
          ]}
          highlight={highlight}
          onUpload={async (file) => {
            push(`onUpload: ${file.name} (1 s)`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return { src: URL.createObjectURL(file), alt: file.name };
          }}
          contextMenu={[
            'cut',
            'copy',
            'duplicate',
            'delete',
            'turnInto',
            { id: 'copyId', label: 'Log block id', onSelect: ({ block }) => push(`context menu: block ${block?.id ?? 'none'}`) },
          ]}
          keyBindings={{ duplicateBlock: 'Mod-Shift-d', print: false }}
          onBeforePaste={(event) => {
            if (blockPaste && event.files.length > 0) {
              event.preventDefault();
              push(`onBeforePaste: ${event.files.length} file(s) refused`);
            } else push(`onBeforePaste: ${event.html ? 'html' : 'text'}${event.files.length ? ` + ${event.files.length} file(s)` : ''}`);
          }}
          onPaste={(event) => push(`onPaste: ${event.blocks.length} block(s): ${event.blocks.map((b) => b.type).join(', ')}`)}
          onSelectionChange={(selection) => {
            if (selection) push(`onSelectionChange: ${selection.blockId} @ ${selection.offset}`);
          }}
          localeText={rtl ? AR_TEXT : {}}
          style={{ minBlockSize: 280 }}
        />
      </div>
      <div role="group" aria-label="Block API" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="outline"
          type="button"
          onClick={act((a) => {
            count.current += 1;
            a.insertBlocks([{ id: `todo-${count.current}`, type: 'checklistItem', props: { checked: false }, content: text(`Follow-up ${count.current}`) }], { after: 'intro' });
          })}
        >
          insertBlocks (after intro)
        </Button>
        <Button variant="outline" type="button" onClick={act((a) => a.updateBlock('title', { props: { level: 1 } }))}>
          updateBlock(title, level 1)
        </Button>
        <Button variant="outline" type="button" onClick={act((a) => push(`moveBlock(next, before title): ${a.moveBlock('next', { before: 'title' })}`))}>
          moveBlock(next, before title)
        </Button>
        <Button variant="outline" type="button" onClick={act((a) => a.turnInto('intro', 'callout'))}>
          turnInto(intro, callout)
        </Button>
        <Button variant="outline" type="button" onClick={act((a) => a.removeBlocks(['snippet']))}>
          removeBlocks([snippet])
        </Button>
        <Button variant="outline" type="button" onClick={act((a) => push(`getBlock(title): ${JSON.stringify(a.getBlock('title')?.content)}`))}>
          getBlock(title)
        </Button>
        <Button variant="outline" type="button" onClick={act((a) => push(`getSelection(): ${JSON.stringify(a.getSelection())}`))}>
          getSelection()
        </Button>
        <Button variant="outline"
          type="button"
          onClick={act((a) => {
            a.setSelection({ blockId: 'intro', offset: 0 });
            a.focus();
          })}
        >
          setSelection(intro, 0) + focus()
        </Button>
        <Button variant="outline" type="button" onClick={act((a) => push(`runCommand(bold): ${a.runCommand('bold')}`))}>
          runCommand(&apos;bold&apos;)
        </Button>
        <Button variant="outline" type="button" onClick={act((a) => push(`runCommand(undo): ${a.runCommand('undo')}`))}>
          runCommand(&apos;undo&apos;)
        </Button>
        <Button variant="outline" type="button" onClick={act((a) => a.print())}>
          print()
        </Button>
      </div>
      <div role="group" aria-label="Serialization" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="outline" type="button" onClick={act((a) => setHtml(blocksToHtml(a.getBlocks())))}>
          blocksToHtml(getBlocks())
        </Button>
        <Button variant="outline"
          type="button"
          onClick={act((a) => {
            const blocks = htmlToBlocks(UNSAFE);
            a.insertBlocks(blocks, { after: 'title' });
            push(`htmlToBlocks(unsafe HTML): ${blocks.length} sanitized block(s) inserted`);
          })}
        >
          htmlToBlocks(unsafe HTML) and insert
        </Button>
      </div>
      {html === null ? null : (
        <details open>
          <summary>blocksToHtml output</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{html}</pre>
        </details>
      )}
      <EventLog entries={log} />
    </div>
  );
}
