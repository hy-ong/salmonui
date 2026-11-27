'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { InlineEdit, type InlineEditApi } from '@salmonui/editors/inline-edit';
import { EventLog, useEventLog } from '../../components/demo-kit';

export default function InlineEditApiDemo() {
  const [log, push] = useEventLog();
  const [owner, setOwner] = useState('Ana Lima');
  const [editing, setEditing] = useState(false);
  const [lockStart, setLockStart] = useState(false);
  const [errors, setErrors] = useState<readonly string[] | null>(null);
  const api = useRef<InlineEditApi | null>(null);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 620 }}>
      <div>
        Owner:{' '}
        <InlineEdit
          ref={api}
          label="Owner"
          value={owner}
          editing={editing}
          mode="inline"
          blurAction="keep"
          onEditingChange={(next, event) => {
            setEditing(next);
            push(`onEditingChange: ${next} (${event.reason}, ${event.source})`);
          }}
          validation={{ required: [true, 'Enter an owner'], minLength: [3, 'At least 3 characters'] }}
          save={(value) => setOwner(value)}
          onBeforeEditStart={(event) => {
            if (lockStart) {
              event.preventDefault();
              push(`onBeforeEditStart: vetoed (${event.source})`);
            } else push(`onBeforeEditStart (${event.source})`);
          }}
          onEditStart={(event) => push(`onEditStart (${event.source})`)}
          onDraftChange={(event) => push(`onDraftChange: "${event.previousValue}" -> "${event.value}"`)}
          onBeforeSave={(event) => push(`onBeforeSave: "${event.value}" (${event.source}, ${event.trigger})`)}
          onSave={(event) => push(`onSave: "${event.previousValue}" -> "${event.value}" (${event.source}, ${event.trigger})`)}
          onBeforeEditCancel={(event) => push(`onBeforeEditCancel (${event.source}, ${event.trigger})`)}
          onEditCancel={(event) => push(`onEditCancel: draft "${event.value}" dropped (${event.source}, ${event.trigger})`)}
        />
      </div>
      <div role="group" aria-label="Ref methods" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="outline" type="button" onClick={() => api.current?.startEdit()}>
          startEdit()
        </Button>
        <Button variant="outline"
          type="button"
          onClick={async () => {
            const list = (await api.current?.validate()) ?? [];
            setErrors(list);
            push(`validate(): ${list.length === 0 ? 'no errors' : list.join('; ')}`);
          }}
        >
          validate()
        </Button>
        <Button variant="outline" type="button" onClick={async () => push(`save(): ${String(await api.current?.save())}`)}>
          save()
        </Button>
        <Button variant="outline" type="button" onClick={() => api.current?.cancelEdit()}>
          cancelEdit()
        </Button>
        <Button variant="outline" type="button" aria-pressed={editing} onClick={() => setEditing((value) => !value)}>
          editing = {String(!editing)}
        </Button>
        <Checkbox checked={lockStart} onCheckedChange={(checked) => setLockStart(checked)}>
          Veto onBeforeEditStart
        </Checkbox>
      </div>
      <p style={{ margin: 0 }} aria-live="polite">
        Saved value: <strong>{owner}</strong>
        {errors ? ` · last validate(): ${errors.length === 0 ? 'valid' : errors.join('; ')}` : ''}
      </p>
      <EventLog entries={log} />
    </div>
  );
}
