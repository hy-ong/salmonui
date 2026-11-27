'use client';

import { InlineEdit } from '@salmonui/editors/inline-edit';
import { NumberField } from '@salmonui/inputs/number-field';
import { TextArea } from '@salmonui/inputs/text-field';
import { EventLog, useEventLog } from '../../components/demo-kit';

const wait = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    });
  });

export default function InlineEditDemo() {
  const [log, push] = useEventLog();
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
      <div>
        <strong>Title</strong>{' '}
        <InlineEdit
          label="Title"
          defaultValue="Quarterly report"
          placeholder="Untitled"
          validation={{ required: true, maxLength: [40, 'At most 40 characters'] }}
          save={async (value, { signal }) => {
            await wait(600, signal);
            if (value === 'fail') throw new Error('Server unavailable');
          }}
          onSave={(e) => push(`saved "${e.value}" (${e.trigger})`)}
          onSaveError={() => push('save failed')}
          onEditCancel={(e) => push(`cancelled (${e.trigger})`)}
        />
      </div>
      <div>
        <strong>Quantity</strong>{' '}
        <InlineEdit<number>
          label="Quantity"
          mode="inline"
          defaultValue={3}
          validation={{ range: [1, 10] }}
          renderPreview={({ value }) => `${value} pcs`}
          onSave={(e) => push(`quantity ${e.previousValue} -> ${e.value}`)}
        >
          {({ value, setValue, inputProps }) => (
            <NumberField
              id={inputProps.id}
              aria-label={inputProps['aria-label']}
              aria-describedby={inputProps['aria-describedby']}
              invalid={inputProps['aria-invalid']}
              autoFocus
              min={1}
              max={10}
              value={value}
              onValueChange={(next) => setValue(next ?? 0)}
              onKeyDown={inputProps.onKeyDown}
            />
          )}
        </InlineEdit>
      </div>
      <div>
        <strong>Notes</strong>{' '}
        <InlineEdit label="Notes" mode="inline" trigger="editButton" blurAction="keep" defaultValue="Ship on Friday" onSave={() => push('notes saved')}>
          {({ inputProps }) => <TextArea {...inputProps} rows={3} />}
        </InlineEdit>
      </div>
      <EventLog entries={log} />
    </div>
  );
}
