// useFormState and requiredMark on the server: the hook renders a clean state without touching the DOM, the
// required-mark hooks are plain attributes, and the rule lives in the /form
// stylesheet only. Interaction: tests/browser/inputs-form-state.spec.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Field, Form } from '@salmonui/inputs/form';
import { useFormState, type FormState } from '@salmonui/inputs/form/state';
import { TextField } from '@salmonui/inputs/text-field';

const html = (element: ReactElement) => renderToString(element);
const dist = (file: string) => readFileSync(new URL(`../dist/${file}`, import.meta.url), 'utf8');

describe('useFormState on the server', () => {
  it('is clean and renders the same markup as a form without it', () => {
    let state: FormState | null = null;
    const Editor = () => {
      state = useFormState();
      return h(Form, { ref: state.ref }, h(TextField, { name: 'customer', label: 'Customer', defaultValue: 'Ada' }), state.isDirty ? h('button', null, 'Save') : null);
    };
    const out = html(h(Editor));
    assert.doesNotMatch(out, /Save/);
    const s = state as unknown as FormState;
    assert.equal(s.isDirty, false);
    assert.deepEqual(s.dirtyFields, []);
    assert.equal(s.isFieldDirty('customer'), false);
    assert.equal(typeof s.reset, 'function');
    // reset() without an attached form is a no-op.
    s.reset();
  });

  it('lives in its own subpath: /form does not import it', () => {
    assert.doesNotMatch(dist('form.js'), /useFormState/);
    assert.match(dist('form-state.js'), /export \{ useFormState \}/);
  });
});

describe('requiredMark', () => {
  it('Form and Field write data-required-mark only when set', () => {
    assert.match(html(h(Form, { requiredMark: true })), /^<form[^>]*data-required-mark="true"/);
    assert.doesNotMatch(html(h(Form, null)), /data-required-mark/);
    const field = (requiredMark?: boolean) => html(h(Field, { label: 'Code', required: true, requiredMark, children: ({ inputProps }) => h('input', inputProps) }));
    assert.match(field(true), /class="salmon-field"[^>]*data-required-mark="true"/);
    assert.match(field(false), /data-required-mark="false"/);
    assert.doesNotMatch(field(), /data-required-mark/);
    // The label text has no mark in the markup: the asterisk is CSS only.
    assert.match(field(true), /<label[^>]*>Code<\/label>/);
  });

  it('the rule is a decorative ::before with empty alternative text, in the /form stylesheet only', () => {
    const css = dist('form.css');
    assert.match(css, /:has\(:required, \[aria-required='true'\]\) > :is\(\.salmon-field-label, \.salmon-dropdown-field-label\)::before \{[^}]*content: '\*' \/ '';[^}]*margin-inline-end: 4px;/);
    assert.doesNotMatch(dist('text-field.css'), /data-required-mark/);
  });
});
