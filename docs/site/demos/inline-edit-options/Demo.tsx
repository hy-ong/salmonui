'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { InlineEdit } from '@salmonui/editors/inline-edit';
import { Select } from '@salmonui/dropdowns/select';

const STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'In progress' },
  { value: 'done', label: 'Done' },
] as const;
type Status = (typeof STATUSES)[number]['value'];

const row = { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' } as const;

export default function InlineEditOptionsDemo() {
  const [disabled, setDisabled] = useState(false);
  const [rtl, setRtl] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 620 }}>
      <div style={row}>
        <Checkbox checked={disabled} onCheckedChange={(checked) => setDisabled(checked)}>
          Disable the fields
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left (Arabic labels)
        </Checkbox>
      </div>
      <div style={row}>
        <strong>Subtitle</strong>
        {/* Empty value: the placeholder shows in the preview. */}
        <InlineEdit label="Subtitle" defaultValue="" placeholder="Add a subtitle" disabled={disabled} popoverProps={{ placement: 'right-start', offset: 12 }} />
      </div>
      <div style={row}>
        <strong>Status</strong>
        {/* A custom editor (Select) with a label lookup for the preview. */}
        <InlineEdit<Status>
          label="Status"
          mode="inline"
          defaultValue="doing"
          disabled={disabled}
          showActions={false}
          blurAction="save"
          renderPreview={({ value }) => STATUSES.find((s) => s.value === value)?.label ?? value}
        >
          {({ value, setValue, inputProps }) => (
            <Select
              id={inputProps.id}
              aria-label={inputProps['aria-label']}
              autoFocus
              data={STATUSES}
              value={value}
              onValueChange={(next) => next != null && setValue(next as Status)}
            />
          )}
        </InlineEdit>
      </div>
      <div style={row}>
        <strong>Summary</strong>
        {/* saveOnEnter={false}: Enter never saves a single-line input; custom actions replace Save and Cancel. */}
        <InlineEdit
          label="Summary"
          mode="inline"
          defaultValue="Draft the launch email"
          saveOnEnter={false}
          disabled={disabled}
          styles={{ editor: { minInlineSize: 260 } }}
          renderActions={({ save, cancel, pending }) => (
            <span>
              <Button type="button" onClick={save} disabled={pending}>
                Apply
              </Button>{' '}
              <Button variant="outline" type="button" onClick={cancel}>
                Discard
              </Button>
            </span>
          )}
        />
      </div>
      <div dir={rtl ? 'rtl' : 'ltr'} lang={rtl ? 'ar' : 'en'} style={row}>
        <strong>{rtl ? 'العنوان' : 'Heading'}</strong>
        {/* Inherited direction, localeText and part styling. */}
        <InlineEdit
          label={rtl ? 'العنوان' : 'Heading'}
          defaultValue=""
          mode="inline"
          disabled={disabled}
          className="demo-inline-edit"
          style={{ fontWeight: 600 }}
          styles={{ preview: { borderBlockEnd: '1px dashed currentColor' } }}
          localeText={rtl ? { save: 'حفظ', cancel: 'إلغاء', edit: 'تعديل', empty: 'فارغ', saving: 'جارٍ الحفظ', saveFailed: 'تعذّر الحفظ' } : { empty: 'No heading yet' }}
        />
      </div>
    </div>
  );
}
