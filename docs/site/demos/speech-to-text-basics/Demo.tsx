'use client';

import { useState } from 'react';
import { Select } from '@salmonui/dropdowns/select';
import { SpeechToTextButton } from '@salmonui/inputs/speech-to-text';
import { TextArea } from '@salmonui/inputs/text-field';

const LANGUAGES = [
  { value: 'en-US', label: 'English (en-US)' },
  { value: 'de-DE', label: 'Deutsch (de-DE)' },
  { value: 'ja-JP', label: '日本語 (ja-JP)' },
  { value: 'ms-MY', label: 'Bahasa Melayu (ms-MY)' },
];

// Dictation into a text area in the chosen recognition language; the button is
// disabled where the browser has no speech recognition.
export default function SpeechToTextBasicsDemo() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('Idle');
  const [lang, setLang] = useState('en-US');
  return (
    <div style={{ display: 'grid', gap: 12, maxInlineSize: 420 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Language
          <Select aria-label="Language" data={LANGUAGES} value={lang} onValueChange={(value) => value != null && setLang(String(value))} />
        </label>
        <SpeechToTextButton
          tone="primary"
          lang={lang}
          onStart={() => setStatus(`Listening (${lang})`)}
          onStop={() => setStatus('Stopped')}
          onError={(e) => setStatus(`Error: ${e.code}`)}
          onTranscriptChange={(transcript) => setText(transcript)}
        />
        <span aria-live="polite">{status}</span>
      </div>
      <TextArea label="Notes" rows={4} value={text} onValueChange={setText} />
    </div>
  );
}
