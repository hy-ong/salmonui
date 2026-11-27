'use client';

import { useState } from 'react';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';
import { TextArea } from '@salmonui/inputs/text-field';
import { useTextSuggest, type SuggestFunction, type SuggestionDisplay } from '@salmonui/chat/text-suggest';
import { EventLog, useEventLog } from '../../components/demo-kit';

// Canned replies for a support desk: a local phrase matcher, no network and no model.
const PHRASES = ['Thank you for reaching out', 'Kind regards', 'Looking forward to hearing from you', 'Please find the invoice attached', 'Your order has shipped'];

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

const DISPLAYS: readonly SuggestionDisplay[] = ['auto', 'inline', 'popover'];

export default function TextAreaSuggestDemo() {
  const [display, setDisplay] = useState<SuggestionDisplay>('auto');
  const [value, setValue] = useState('');
  const [log, push] = useEventLog();
  const suggestion = useTextSuggest({
    suggest: suggestPhrase,
    suggestionDisplay: display,
    suggestDelay: 150,
    onSuggestionShow: ({ text }) => push(`onSuggestionShow "${text}"`),
    onSuggestionAccept: ({ text }) => push(`onSuggestionAccept "${text}"`),
  });
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
      <RadioGroup label="Display" name="display" orientation="horizontal" value={display} onValueChange={(value) => setDisplay(value as SuggestionDisplay)}>
        {DISPLAYS.map((d) => (
          <Radio key={d} value={d}>
            {d}
          </Radio>
        ))}
      </RadioGroup>
      <TextArea
        label="Reply"
        rows={4}
        description="Type Thank, Kind, Looking, Please or Your"
        value={value}
        onValueChange={setValue}
        ref={suggestion.ref}
      />
      <output>{value.length} characters</output>
      <EventLog entries={log} />
    </div>
  );
}
