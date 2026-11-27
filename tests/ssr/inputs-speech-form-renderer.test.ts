// test:ssr for @salmonui/react/speech-to-text and @salmonui/react/form-renderer:
// the entries evaluate
// and render in Node with the DOM-like globals removed, deterministically.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const BROWSER_GLOBALS = ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'HTMLElement', 'ResizeObserver', 'requestAnimationFrame', 'matchMedia', 'CSS', 'SpeechRecognition', 'webkitSpeechRecognition'];
const g = globalThis as Record<string, unknown>;
for (const name of BROWSER_GLOBALS) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement: h, StrictMode } = await import('react');
const { renderToString } = await import('react-dom/server');
const { SpeechToTextButton, useSpeechRecognition } = await import('@salmonui/inputs/speech-to-text');
const { FormRenderer } = await import('@salmonui/inputs/form-renderer');

const twice = (el: ReturnType<typeof h>): string => {
  const a = renderToString(h(StrictMode, null, el));
  assert.equal(renderToString(h(StrictMode, null, el)), a);
  return a;
};

function HookProbe() {
  const speech = useSpeechRecognition();
  return h('output', { 'data-state': speech.state, 'data-supported': String(speech.supported) }, speech.transcript);
}

describe('Speech To Text and Form Renderer SSR without DOM globals', () => {
  it('the hook reports idle and unsupported on the server; the button renders enabled', () => {
    assert.match(twice(h(HookProbe)), /data-state="idle" data-supported="false"/);
    const out = twice(h(SpeechToTextButton, { lang: 'en-US' }));
    assert.match(out, /aria-pressed="false"/);
    assert.doesNotMatch(out, /disabled=""/);
  });

  it('FormRenderer renders deterministically', () => {
    const out = twice(
      h(FormRenderer, {
        schema: { type: 'object', title: 'Profile', required: ['name'], properties: { name: { type: 'string', title: 'Name' }, plan: { type: 'string', enum: ['a', 'b'] }, ok: { type: 'boolean' }, n: { type: 'number' } } },
        uiSchema: { layout: [['name', 'n']] },
      }),
    );
    assert.match(out, /aria-label="Profile"/);
    assert.match(out, /role="combobox"/);
  });
});
