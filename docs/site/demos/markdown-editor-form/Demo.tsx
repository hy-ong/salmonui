'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { MarkdownEditor } from '@salmonui/editors/markdown-editor';
import { Radio } from '@salmonui/inputs/radio-group';

const TR_TEXT = {
  toolbar: 'Biçimlendirme',
  bold: 'Kalın',
  italic: 'İtalik',
  uppercase: 'Büyük harf',
  lowercase: 'Küçük harf',
  link: 'Bağlantı',
  preview: 'Önizleme',
  previewRegion: 'Önizleme',
  more: 'Daha fazla',
};

/** A tiny renderer for the preview (paragraphs only): the application owns Markdown parsing. */
const renderParagraphs = (source: string): ReactNode =>
  source
    .split(/\n{2,}/)
    .filter((block) => block.trim())
    .map((block, index) => (
      <p key={index} style={{ margin: '0 0 8px' }}>
        {block}
      </p>
    ));

export default function MarkdownEditorFormDemo() {
  const [state, setState] = useState<'editable' | 'readOnly' | 'disabled'>('editable');
  const [rtl, setRtl] = useState(false);
  const [turkish, setTurkish] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  return (
    <form
      style={{ display: 'grid', gap: 12 }}
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(String(new FormData(event.currentTarget).get('summary') ?? ''));
      }}
      onReset={() => setSubmitted(null)}
    >
      <fieldset style={{ display: 'flex', flexWrap: 'wrap', gap: 12, border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, padding: 0 }}>Options</legend>
        {(['editable', 'readOnly', 'disabled'] as const).map((option) => (
          <Radio key={option} name="md-state" value={option} checked={state === option} onChange={() => setState(option)}>
            {option}
          </Radio>
        ))}
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          dir=&quot;rtl&quot;
        </Checkbox>
        <Checkbox checked={turkish} onCheckedChange={(checked) => setTurkish(checked)}>
          Turkish locale and labels
        </Checkbox>
      </fieldset>
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'grid', gap: 6 }}>
        <label htmlFor="markdown-summary" style={{ fontWeight: 600 }}>
          Summary (required)
        </label>
        <MarkdownEditor
          id="markdown-summary"
          name="summary"
          required
          defaultValue={'The team meets in izmir next week.\n\nSelect "izmir" and press Upper case: the Turkish locale gives İZMİR, English gives IZMIR.'}
          placeholder="Write a short summary in Markdown"
          readOnly={state === 'readOnly'}
          disabled={state === 'disabled'}
          toolbar={['bold', 'italic', 'uppercase', 'lowercase', '|', 'link', 'preview']}
          defaultPreview="split"
          renderPreview={renderParagraphs}
          locale={turkish ? 'tr' : undefined}
          localeText={turkish ? TR_TEXT : undefined}
          resizable
          rows={6}
          style={{ maxInlineSize: 760 }}
          styles={{ preview: { fontStyle: 'italic' }, textarea: { fontFamily: 'ui-monospace, monospace' } }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="submit">Submit</Button>
        <Button type="reset" variant="outline">Reset</Button>
      </div>
      <p aria-live="polite" style={{ margin: 0 }}>
        {submitted === null ? 'Not submitted yet. Empty the editor and submit to see the required check.' : `Submitted summary: ${submitted.length} characters`}
      </p>
    </form>
  );
}
