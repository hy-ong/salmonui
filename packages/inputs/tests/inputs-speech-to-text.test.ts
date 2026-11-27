// Speech To Text: the session
// controller with a fake recognizer (no microphone) and the server markup of
// SpeechToTextButton; the hook in the browser is tests/browser/inputs-speech.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { SpeechToTextButton, SPEECH_TO_TEXT_DEFAULT_LOCALE_TEXT, type SpeechRecognizer, type UseSpeechRecognitionOptions } from '@salmonui/inputs/speech-to-text';
import { createSpeechController, readTranscript, type SpeechRecognitionState } from '../dist/speech-to-text/controller.js';

type Result = { isFinal: boolean; length: number; [i: number]: { transcript: string } };
const result = (transcript: string, isFinal: boolean): Result => ({ isFinal, length: 1, 0: { transcript } });

class FakeRecognizer implements SpeechRecognizer {
  static last: FakeRecognizer | null = null;
  lang = '';
  continuous = false;
  interimResults = false;
  calls: string[] = [];
  onstart: SpeechRecognizer['onstart'] = null;
  onresult: SpeechRecognizer['onresult'] = null;
  onerror: SpeechRecognizer['onerror'] = null;
  onend: SpeechRecognizer['onend'] = null;
  constructor() {
    FakeRecognizer.last = this;
  }
  start(): void {
    this.calls.push('start');
    this.onstart?.({});
  }
  stop(): void {
    this.calls.push('stop');
    this.onend?.({});
  }
  abort(): void {
    this.calls.push('abort');
    this.onerror?.({ error: 'aborted', message: '' });
    this.onend?.({});
  }
  emit(...results: Result[]): void {
    this.onresult?.({ results: Object.assign([...results], { length: results.length }) });
  }
}

function setup(options: UseSpeechRecognitionOptions = {}) {
  const log: unknown[][] = [];
  const updates: [SpeechRecognitionState, string][] = [];
  const opts: UseSpeechRecognitionOptions = {
    recognizer: () => new FakeRecognizer(),
    onStart: () => log.push(['start']),
    onStop: () => log.push(['stop']),
    onError: (e) => log.push(['error', e.code]),
    onTranscriptChange: (t, d) => log.push(['transcript', t, d.final]),
    ...options,
  };
  const c = createSpeechController({ options: () => opts, update: (s, t) => updates.push([s, t]) });
  return { c, log, updates, fake: () => FakeRecognizer.last as FakeRecognizer };
}

describe('useSpeechRecognition controller', () => {
  it('start() and stop() move idle -> listening -> stopped', () => {
    const { c, log, updates, fake } = setup();
    c.start();
    assert.deepEqual(updates.at(-1), ['listening', '']);
    assert.deepEqual(fake().calls, ['start']);
    c.start(); // already listening: ignored
    assert.deepEqual(fake().calls, ['start']);
    c.stop();
    assert.deepEqual(updates.at(-1), ['stopped', '']);
    assert.deepEqual(log, [['start'], ['stop']]);
  });

  it('transcript is final then interim results; onTranscriptChange reports final; interimResults is forwarded', () => {
    const { c, log, updates, fake } = setup({ interimResults: false });
    c.start();
    assert.equal(fake().interimResults, false);
    assert.equal(fake().continuous, true);
    fake().emit(result('hello', true), result(' wor', false));
    assert.deepEqual(updates.at(-1), ['listening', 'hello wor']);
    fake().emit(result('hello', true), result(' world', true));
    assert.deepEqual(log.filter((e) => e[0] === 'transcript'), [
      ['transcript', 'hello wor', false],
      ['transcript', 'hello world', true],
    ]);
    // A new session starts with an empty transcript.
    c.stop();
    c.start();
    assert.deepEqual(updates.at(-1), ['listening', '']);
    assert.deepEqual(readTranscript({ results: { length: 0 } }), { transcript: '', final: true });
  });

  it('lang is the option, else the document language read at start time', () => {
    const { c, fake } = setup({ lang: 'fr-FR' });
    c.start();
    assert.equal(fake().lang, 'fr-FR');
    c.stop();
    const g = globalThis as { document?: unknown };
    const before = g.document;
    g.document = { documentElement: { lang: 'de-DE' } };
    try {
      const other = setup();
      other.c.start();
      assert.equal(other.fake().lang, 'de-DE');
    } finally {
      g.document = before;
    }
  });

  it('recognizer errors pass their Web Speech code; abort() reports aborted and ends the session', () => {
    const { c, log, updates, fake } = setup();
    c.start();
    fake().onerror?.({ error: 'not-allowed', message: 'denied' });
    fake().onend?.({});
    assert.deepEqual(log, [['start'], ['error', 'not-allowed'], ['stop']]);
    assert.equal(updates.at(-1)?.[0], 'stopped');
    c.start();
    c.abort();
    assert.deepEqual(log.slice(-2), [['error', 'aborted'], ['stop']]);
  });

  it("start() without any recognizer reports 'unsupported' and stays idle", () => {
    const log: string[] = [];
    const updates: unknown[] = [];
    const c = createSpeechController({ options: () => ({ onError: (e) => log.push(e.code) }), update: (...a) => updates.push(a) });
    c.start();
    assert.deepEqual(log, ['unsupported']);
    assert.deepEqual(updates, []);
  });

  it('the recognizer option is replaceable and dispose() aborts silently', () => {
    const { c, log, fake } = setup();
    c.start();
    c.dispose();
    assert.deepEqual(fake().calls, ['start', 'abort']);
    assert.deepEqual(log, [['start']]);
  });
});

describe('SpeechToTextButton markup', () => {
  it('an icon-only Button toggle with a constant name, aria-pressed and a described hint', () => {
    const out = renderToString(h(SpeechToTextButton, { tone: 'primary', variant: 'outline', size: 'sm' }));
    assert.match(out, /<button[^>]*class="salmon-button salmon-speech-to-text"/);
    assert.match(out, /aria-pressed="false"/);
    assert.match(out, /data-state="idle"/);
    assert.match(out, /data-tone="primary"/);
    assert.match(out, /data-variant="outline"/);
    assert.match(out, /data-size="sm"/);
    assert.match(out, /aria-label="Speech to text"/);
    assert.match(out, /title="Start listening"/);
    const describedBy = /aria-describedby="([^"]+)"/.exec(out)?.[1];
    assert.ok(describedBy && out.includes(`id="${describedBy}"`));  });

  it('children make a labelled button; localeText overrides the strings', () => {
    const out = renderToString(h(SpeechToTextButton, { localeText: { start: 'Diktieren' } }, 'Dictate'));
    assert.match(out, /Dictate/);
    assert.doesNotMatch(out, /aria-label=/);
    assert.match(out, /title="Diktieren"/);
    assert.equal(SPEECH_TO_TEXT_DEFAULT_LOCALE_TEXT.unsupported, 'Speech recognition is not supported in this browser');
  });

  it('server markup is enabled (support is detected after mount)', () => {
    const out = renderToString(h(SpeechToTextButton, {}));
    assert.doesNotMatch(out, /disabled=""/);
  });
});
