'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { TextArea, type TextAreaProps } from '@salmonui/inputs/text-field';
import { useTextSuggest, type SuggestFunction } from '@salmonui/chat/text-suggest';
import { EventLog, useEventLog } from '../../components/demo-kit';

// Canned status updates: a local phrase matcher, no network and no model.
const PHRASES = ['We are investigating reports of slow page loads', 'The issue is resolved and all services are operating normally', 'Next update in 30 minutes'];

const suggestPhrase: SuggestFunction = async ({ textBeforeCaret }) => {
  const before = textBeforeCaret.toLowerCase();
  for (const phrase of PHRASES) {
    for (let k = phrase.length - 1; k > 0; k--) {
      const start = before.length - k;
      if (before.endsWith(phrase.slice(0, k).toLowerCase()) && (start === 0 || /\s/.test(before[start - 1]!))) return phrase.slice(k);
    }
  }
  return null;
};

const MAX = 120;
const RESIZE: readonly NonNullable<TextAreaProps['resize']>[] = ['vertical', 'both', 'none'];

export default function TextAreaSuggestFilterDemo() {
  const [value, setValue] = useState('');
  const [paused, setPaused] = useState(false);
  const [resize, setResize] = useState<NonNullable<TextAreaProps['resize']>>('vertical');
  const [readOnly, setReadOnly] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [log, push] = useEventLog();
  const suggestion = useTextSuggest({
    suggest: suggestPhrase,
    suggestDelay: 150,
    // Read when a suggestion is about to show: veto it while paused, or when it would not fit in maxLength.
    onBeforeSuggestionShow: (event) => {
      if (paused) {
        event.preventDefault();
        push(`onBeforeSuggestionShow: prevented "${event.text}" (paused)`);
      } else if (value.length + event.text.length > MAX) {
        event.preventDefault();
        push(`onBeforeSuggestionShow: prevented "${event.text}" (${value.length + event.text.length} > ${MAX} characters)`);
      }
    },
    onSuggestionShow: ({ text }) => push(`onSuggestionShow "${text}"`),
    onSuggestionAccept: ({ text }) => push(`onSuggestionAccept "${text}"`),
  });
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <Checkbox checked={paused} onCheckedChange={(checked) => setPaused(checked)}>
          Pause suggestions
        </Checkbox>
        <Checkbox checked={readOnly} onCheckedChange={(checked) => setReadOnly(checked)}>
          Read-only
        </Checkbox>
        <Checkbox checked={disabled} onCheckedChange={(checked) => setDisabled(checked)}>
          Disabled
        </Checkbox>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          Resize
          <Select aria-label="Resize" data={RESIZE} value={resize} onValueChange={(next) => next != null && setResize(next as NonNullable<TextAreaProps['resize']>)} />
        </label>
      </div>
      <TextArea
        ref={suggestion.ref}
        label="Status update"
        description={`Type We, The or Next and pause. At most ${MAX} characters.`}
        placeholder="What is happening?"
        rows={3}
        resize={resize}
        maxLength={MAX}
        clearable
        readOnly={readOnly}
        disabled={disabled}
        value={value}
        onValueChange={(next, details) => {
          setValue(next);
          if (details.reason !== 'input') push(`onValueChange (${details.reason})`);
        }}
        onFocus={() => push('focus')}
        onBlur={() => push('blur')}
      />
      <output>
        {value.length} / {MAX} characters
      </output>
      <EventLog entries={log} />
    </div>
  );
}
