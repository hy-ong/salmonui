// Speech To Text section of examples/vite-spa/inputs.html (?only=speech;
// tests/browser/inputs-speech.spec.ts). The recognizer is a fake driven by
// window.__speech, so no microphone is used.
import { useState } from 'react';
import { SpeechToTextButton, useSpeechRecognition, type SpeechRecognizer } from '@salmonui/inputs/speech-to-text';
import { TextArea } from '@salmonui/inputs/text-field';
import { log, Section } from './inputs-shared.tsx';
import '@salmonui/inputs/speech-to-text/styles.css';
import '@salmonui/inputs/text-field/styles.css';

type Result = { isFinal: boolean; length: number; 0: { transcript: string } };

interface SpeechDriver {
  last: FakeRecognizer | null;
  /** Results of the session so far: [text, isFinal] pairs. */
  emit(results: [string, boolean][]): void;
  error(code: string): void;
  end(): void;
}

declare global {
  interface Window {
    __speech?: SpeechDriver;
  }
}

class FakeRecognizer implements SpeechRecognizer {
  lang = '';
  continuous = false;
  interimResults = false;
  onstart: SpeechRecognizer['onstart'] = null;
  onresult: SpeechRecognizer['onresult'] = null;
  onerror: SpeechRecognizer['onerror'] = null;
  onend: SpeechRecognizer['onend'] = null;
  start(): void {
    driver.last = this;
    log({ kind: 'speech-recognizer', lang: this.lang, continuous: this.continuous, interimResults: this.interimResults });
    queueMicrotask(() => this.onstart?.({}));
  }
  stop(): void {
    queueMicrotask(() => this.onend?.({}));
  }
  abort(): void {
    queueMicrotask(() => {
      this.onerror?.({ error: 'aborted' });
      this.onend?.({});
    });
  }
}

const driver: SpeechDriver = {
  last: null,
  emit(results) {
    const list = results.map(([transcript, isFinal]): Result => ({ isFinal, length: 1, 0: { transcript } }));
    driver.last?.onresult?.({ results: Object.assign(list, { length: list.length }) });
  },
  error(code) {
    driver.last?.onerror?.({ error: code, message: code });
  },
  end() {
    driver.last?.onend?.({});
  },
};
window.__speech = driver;
const fake = (): SpeechRecognizer => new FakeRecognizer();

function Dictation() {
  const [text, setText] = useState('');
  return (
    <>
      <SpeechToTextButton
        id="stt-button"
        recognizer={fake}
        tone="primary"
        onStart={() => log({ kind: 'speech', event: 'start' })}
        onStop={() => log({ kind: 'speech', event: 'stop' })}
        onError={(e) => log({ kind: 'speech', event: 'error', code: e.code })}
        onTranscriptChange={(t, d) => (log({ kind: 'speech', event: 'transcript', transcript: t, final: d.final }), setText(t))}
      />
      <TextArea id="stt-text" label="Dictated text" value={text} onValueChange={setText} />
    </>
  );
}

function HookProbe() {
  const speech = useSpeechRecognition({ recognizer: fake, lang: 'fr-FR', interimResults: false, onError: (e) => log({ kind: 'speech-hook', event: 'error', code: e.code }) });
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button type="button" id="stt-hook-start" onClick={speech.start}>
        Start hook
      </button>
      <button type="button" id="stt-hook-stop" onClick={speech.stop}>
        Stop hook
      </button>
      <output id="stt-hook-state">{speech.state}</output>
      <output id="stt-hook-transcript">{speech.transcript}</output>
    </div>
  );
}

function BrowserProbe() {
  // The real Web Speech API (or its absence); never started by the tests.
  const speech = useSpeechRecognition();
  return <output id="stt-supported">{String(speech.supported)}</output>;
}

export function SpeechSection() {
  return (
    <Section id="speech" title="Speech To Text">
      <Dictation />
      <SpeechToTextButton id="stt-labelled" recognizer={fake} variant="outline">
        Dictate
      </SpeechToTextButton>
      <SpeechToTextButton id="stt-browser" localeText={{ label: "Browser speech" }} />
      <BrowserProbe />
      <HookProbe />
    </Section>
  );
}
