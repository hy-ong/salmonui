'use client';

import { useRef, useState } from 'react';
import { RichTextEditor, type RichTextEditorActions } from '@salmonui/rich-text';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import '@salmonui/rich-text/styles.css';
import { EventLog, useEventLog } from '../../components/demo-kit';

const initial = '<p>Edit this note, then try the buttons below the editor.</p>';

const FR_TEXT = { toolbar: 'Mise en forme', bold: 'Gras', italic: 'Italique', underline: 'Souligné', undo: 'Annuler', redo: 'Rétablir', link: 'Lien', table: 'Tableau' };

const ENTER_KEYS = ['p', 'div', 'br'];
const TAB_KEYS = ['focus', 'indent'];
const STATES = ['editable', 'readOnly', 'disabled'];

export default function RichTextEditorApiDemo() {
  const [log, push] = useEventLog();
  const [enterKey, setEnterKey] = useState<'p' | 'div' | 'br'>('p');
  const [tabKey, setTabKey] = useState<'focus' | 'indent'>('focus');
  const [state, setState] = useState<'editable' | 'readOnly' | 'disabled'>('editable');
  const [blockTables, setBlockTables] = useState(false);
  const [underlineOff, setUnderlineOff] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [french, setFrench] = useState(false);
  const [html, setHtml] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [history, setHistory] = useState('nothing to undo, nothing to redo');
  const actions = useRef<RichTextEditorActions | null>(null);
  const run = (label: string, fn: (a: RichTextEditorActions) => unknown) => () => {
    const a = actions.current;
    if (!a) return;
    const result = fn(a);
    if (result !== undefined) push(`${label}: ${typeof result === 'string' ? result : JSON.stringify(result)}`);
  };
  return (
    <form
      style={{ display: 'grid', gap: 12 }}
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(String(new FormData(event.currentTarget).get('note') ?? ''));
      }}
      onReset={() => setSubmitted(null)}
    >
      <fieldset style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', border: 0, margin: 0, padding: 0 }}>
        <legend style={{ fontWeight: 600, padding: 0 }}>Options</legend>
        <label>
          enterKey{' '}
          <Select aria-label="enterKey" data={ENTER_KEYS} value={enterKey} onValueChange={(value) => value != null && setEnterKey(value as typeof enterKey)} />
        </label>
        <label>
          tabKey{' '}
          <Select aria-label="tabKey" data={TAB_KEYS} value={tabKey} onValueChange={(value) => value != null && setTabKey(value as typeof tabKey)} />
        </label>
        <label>
          State{' '}
          <Select aria-label="State" data={STATES} value={state} onValueChange={(value) => value != null && setState(value as typeof state)} />
        </label>
        <Checkbox checked={blockTables} onCheckedChange={(checked) => setBlockTables(checked)}>
          Cancel table dialogs
        </Checkbox>
        <Checkbox checked={underlineOff} onCheckedChange={(checked) => setUnderlineOff(checked)}>
          Disable Underline
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          dir=&quot;rtl&quot;
        </Checkbox>
        <Checkbox checked={french} onCheckedChange={(checked) => setFrench(checked)}>
          French labels
        </Checkbox>
      </fieldset>
      <div dir={rtl ? 'rtl' : 'ltr'}>
        <RichTextEditor
          aria-label="Note"
          name="note"
          required
          defaultValue={initial}
          placeholder="Write a note (required)"
          readOnly={state === 'readOnly'}
          disabled={state === 'disabled'}
          actionsRef={actions}
          onChange={setHtml}
          toolbar={['undo', 'redo', '|', 'bold', 'italic', { id: 'underline', disabled: underlineOff }, '|', 'unorderedList', 'link', 'table']}
          enterKey={enterKey}
          shiftEnterKey="br"
          tabKey={tabKey}
          undoLimit={50}
          undoGroupDelay={800}
          keyBindings={{ 'Mod-Shift-x': 'strike' }}
          localeText={french ? FR_TEXT : {}}
          onBeforeCommand={(event) => push(`onBeforeCommand: ${event.command}`)}
          onCommand={(event) => push(`onCommand: ${event.command} (applied: ${event.applied})`)}
          onToolbarItemClick={(event) => push(`onToolbarItemClick: ${event.id}`)}
          onBeforeDialogOpen={(event) => {
            if (blockTables && event.dialog === 'table') {
              event.preventDefault();
              push('onBeforeDialogOpen: table cancelled');
            } else push(`onBeforeDialogOpen: ${event.dialog}`);
          }}
          onDialogClose={(event) => push(`onDialogClose: ${event.dialog}`)}
          onToolbarStateChange={(toolbarState) => {
            setHistory(`${toolbarState.canUndo ? 'can undo' : 'nothing to undo'}, ${toolbarState.canRedo ? 'can redo' : 'nothing to redo'}`);
          }}
          style={{ minBlockSize: 200, inlineSize: '100%' }}
        />
      </div>
      <div role="group" aria-label="Editor actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="outline" onClick={run('commands.bold()', (a) => a.commands.bold())}>
          commands.bold()
        </Button>
        <Button variant="outline" onClick={run('commands.insertTable', (a) => a.commands.insertTable({ rows: 2, cols: 3, headerRow: true }))}>
          commands.insertTable(2 × 3)
        </Button>
        <Button variant="outline" onClick={run('getSelection()', (a) => a.getSelection())}>
          getSelection()
        </Button>
        <Button
          variant="outline"
          onClick={run('setSelection(1, 5)', (a) => {
            a.setSelection(1, 5);
            a.focus();
          })}
        >
          setSelection(1, 5) + focus()
        </Button>
        <Button variant="outline" onClick={run('undo()', (a) => a.commands.undo())}>
          undo()
        </Button>
        <Button variant="outline" onClick={run('redo()', (a) => a.commands.redo())}>
          redo()
        </Button>
        <Button variant="outline" onClick={run('clearHistory()', (a) => {
            a.clearHistory();
            return 'history cleared';
          })}>
          clearHistory()
        </Button>
        <Button variant="outline" onClick={run('openDialog', (a) => a.openDialog('link'))}>
          openDialog(&apos;link&apos;)
        </Button>
        <Button variant="outline" onClick={run('getHtml({ xhtml: true })', (a) => a.getHtml({ xhtml: true }))}>
          getHtml({'{'} xhtml: true {'}'})
        </Button>
      </div>
      <p style={{ margin: 0 }}>History (onToolbarStateChange): {history}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="submit">Submit</Button>
        <Button type="reset" variant="outline">Reset</Button>
      </div>
      <p aria-live="polite" style={{ margin: 0 }}>
        {submitted === null ? `Current value: ${html.length} characters of HTML.` : `Submitted note: ${submitted}`}
      </p>
      <EventLog entries={log} />
    </form>
  );
}
