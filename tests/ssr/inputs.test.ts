// test:ssr for the Inputs and Forms subpaths: every entry evaluates and renders in Node with the DOM-like
// globals removed, and the output is deterministic.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const BROWSER_GLOBALS = ['window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'HTMLElement', 'ResizeObserver', 'requestAnimationFrame', 'matchMedia', 'CSS'];
const g = globalThis as Record<string, unknown>;
for (const name of BROWSER_GLOBALS) {
  try {
    delete g[name];
  } catch {}
  if (name in g) Object.defineProperty(g, name, { value: undefined, configurable: true });
}

const { createElement: h, StrictMode } = await import('react');
const { renderToString } = await import('react-dom/server');
const { Form, Field } = await import('@salmonui/inputs/form');
const { TextField, TextArea } = await import('@salmonui/inputs/text-field');
const { MaskedField } = await import('@salmonui/inputs/masked-field');
const { NumberField } = await import('@salmonui/inputs/number-field');

const twice = (el: ReturnType<typeof h>): string => {
  const a = renderToString(h(StrictMode, null, el));
  assert.equal(renderToString(h(StrictMode, null, el)), a);
  return a;
};

describe('Inputs SSR without DOM globals', () => {
  it('Form, Field, TextField and TextArea render deterministically', () => {
    const out = twice(
      h(
        Form,
        { validationErrors: { email: 'Taken' } },
        h(TextField, { name: 'email', label: 'Email', description: 'Work address', clearable: true, defaultValue: 'a@b.c' }),
        h(TextArea, { name: 'notes', label: 'Notes', autoResize: true }),
        h(Field, { label: 'Custom' }, (f: { inputProps: object }) => h('input', { ...f.inputProps, ref: undefined })),
      ),
    );
    assert.match(out, /<form/);
    assert.match(out, /aria-invalid="true"/);
    assert.match(out, /<textarea/);
  });

  it('MaskedField and NumberField render deterministically with an explicit locale', () => {
    const out = twice(
      h(
        'div',
        null,
        h(MaskedField, { label: 'Phone', mask: '(000) 000-0000', name: 'phone', defaultValue: '555' }),
        h(NumberField, { label: 'Price', locale: 'de-DE', currency: 'EUR', defaultValue: 1234.5, name: 'price' }),
      ),
    );
    assert.match(out, /\(555\) ___-____/);
    assert.match(out, /1\.234,50/);
  });
});
