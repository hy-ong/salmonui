// Smart paste field logic in Node over a duck-typed fake DOM: which controls are described, what the
// adapter learns about them, how the answer is parsed, and how values are
// written (prototype setter plus `input` / `change`, clicks for checkboxes
// and radios). The hook itself (clipboard, pending, abort, React-controlled
// inputs, Button) is covered by tests/browser/smart.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectControls, describeFields, fillControls, parseAnswer } from '../dist/smart-paste/fields.js';

interface Attrs {
  [name: string]: string;
}

const byId = new Map<string, { textContent: string }>();
const doc = { getElementById: (id: string) => byId.get(id) ?? null };

/** A fake element: `closest` matches selectors against the attribute bags of the element and its fake ancestors. */
class FakeControl {
  events: string[] = [];
  tabIndex = 0;
  disabled = false;
  readOnly = false;
  labels: { textContent: string }[] = [];
  ownerDocument = doc;
  #value = '';
  setterCalls = 0;
  tagName: string;
  attrs: Attrs;
  ancestors: { attrs: Attrs; legend?: string }[];
  constructor(tagName: string, attrs: Attrs = {}, ancestors: { attrs: Attrs; legend?: string }[] = []) {
    this.tagName = tagName;
    this.attrs = attrs;
    this.ancestors = ancestors;
    this.#value = attrs['value'] ?? '';
  }
  get value(): string {
    return this.#value;
  }
  set value(v: string) {
    this.setterCalls++;
    this.#value = v;
  }
  get name(): string {
    return this.attrs['name'] ?? '';
  }
  get id(): string {
    return this.attrs['id'] ?? '';
  }
  get type(): string {
    return this.attrs['type'] ?? 'text';
  }
  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  closest(selector: string): { getAttribute(n: string): string | null; querySelector(s: string): { textContent: string } | null } | null {
    for (const node of [{ attrs: this.attrs }, ...this.ancestors]) {
      for (const part of selector.split(',').map((s) => s.trim())) {
        const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(part);
        const hit = m ? (m[2] === undefined ? m[1]! in node.attrs : node.attrs[m[1]!] === m[2]) : part === 'fieldset' && node.attrs['tag'] === 'fieldset';
        if (hit) {
          const legend = (node as { legend?: string }).legend;
          return { getAttribute: (n) => node.attrs[n] ?? null, querySelector: () => (legend ? { textContent: legend } : null) };
        }
      }
    }
    return null;
  }
  dispatchEvent(event: Event): boolean {
    this.events.push(event.type);
    return true;
  }
}

class FakeCheckable extends FakeControl {
  checked = false;
  click(): void {
    this.checked = this.type === 'radio' ? true : !this.checked;
    this.events.push('click');
  }
}

class FakeSelect extends FakeControl {
  multiple = false;
  options: { value: string; text: string; selected: boolean }[];
  constructor(attrs: Attrs, options: string[]) {
    super('SELECT', attrs);
    this.options = options.map((o) => ({ value: o, text: o.toUpperCase(), selected: false }));
  }
}

const root = (controls: FakeControl[]) => ({ querySelectorAll: () => controls }) as unknown as ParentNode;
const groupsOf = (controls: FakeControl[]) => collectControls(root(controls)) as unknown as Map<string, FakeControl[]>;
const fill = (list: FakeControl[] | undefined, value: unknown): boolean => fillControls(list as never, value);

describe('smart paste field discovery', () => {
  it('describes name, label, description, type and options; skips opted-out, password, file, hidden, disabled and mirror controls', () => {
    byId.set('d1', { textContent: 'Work address only' });
    const email = new FakeControl('INPUT', { name: 'email', type: 'email', 'aria-describedby': 'd1' });
    email.labels = [{ textContent: ' Email\n address ' }];
    const notes = new FakeControl('TEXTAREA', { name: 'notes', 'data-salmon-paste-description': 'Anything else' });
    const country = new FakeSelect({ name: 'country' }, ['', 'nl', 'my']);
    const plan = ['free', 'pro'].map((v) => new FakeCheckable('INPUT', { name: 'plan', type: 'radio', value: v }, [{ attrs: { tag: 'fieldset' }, legend: 'Plan' }]));
    const news = new FakeCheckable('INPUT', { name: 'news', type: 'checkbox', 'aria-label': 'Newsletter' });
    const skipped = [
      new FakeControl('INPUT', { name: 'pw', type: 'password' }),
      new FakeControl('INPUT', { name: 'cv', type: 'file' }),
      new FakeControl('INPUT', { name: 'token', type: 'hidden' }),
      new FakeControl('INPUT', { name: 'secret' }, [{ attrs: { 'data-salmon-paste': 'off' } }]),
      new FakeControl('INPUT', { name: 'off', 'data-salmon-paste': 'off' }),
      new FakeControl('SELECT', { name: 'mirror', 'aria-hidden': 'true' }),
      new FakeControl('INPUT', {}),
    ];
    skipped[5]!.tabIndex = -1;
    const disabled = new FakeControl('INPUT', { name: 'locked' });
    disabled.disabled = true;
    const fields = describeFields(groupsOf([email, notes, country, ...plan, news, ...skipped, disabled]) as never);
    assert.deepEqual(fields, [
      { name: 'email', type: 'email', label: 'Email address', description: 'Work address only' },
      { name: 'notes', type: 'textarea', description: 'Anything else' },
      { name: 'country', type: 'select', options: ['nl', 'my'] },
      { name: 'plan', type: 'radio', label: 'Plan', options: ['free', 'pro'] },
      { name: 'news', type: 'checkbox', label: 'Newsletter' },
    ]);
  });

  it('a checkbox group shares one multiple descriptor; a multiple select says so', () => {
    const tags = ['a', 'b'].map((v) => new FakeCheckable('INPUT', { name: 'tags', type: 'checkbox', value: v }));
    const multi = new FakeSelect({ name: 'langs' }, ['en', 'de']);
    multi.multiple = true;
    assert.deepEqual(describeFields(groupsOf([...tags, multi]) as never), [
      { name: 'tags', type: 'checkbox', options: ['a', 'b'], multiple: true },
      { name: 'langs', type: 'select', options: ['en', 'de'], multiple: true },
    ]);
  });
});

describe('smart paste answers and filling', () => {
  it('parses an object, JSON text, fenced JSON and rejects anything else', () => {
    assert.deepEqual(parseAnswer({ a: 1 }), { a: 1 });
    assert.deepEqual(parseAnswer('{"a":"x"}'), { a: 'x' });
    assert.deepEqual(parseAnswer('Sure!\n```json\n{"a": 2}\n```'), { a: 2 });
    assert.deepEqual(parseAnswer('not json'), {});
    assert.deepEqual(parseAnswer('{broken'), {});
    assert.deepEqual(parseAnswer('[1,2]'), {});
    assert.deepEqual(parseAnswer(null), {});
  });

  it('text fields go through the prototype value setter, then input and change bubble', () => {
    const name = new FakeControl('INPUT', { name: 'name' });
    assert.equal(fill([name], 'Ada'), true);
    assert.equal(name.value, 'Ada');
    assert.equal(name.setterCalls, 1);
    assert.deepEqual(name.events, ['input', 'change']);
    const notes = new FakeControl('TEXTAREA', { name: 'notes' });
    fill([notes], ['one', 'two']);
    assert.equal(notes.value, 'one, two');
  });

  it('selects match option values, then case-insensitive values or labels; no match is not filled', () => {
    const country = new FakeSelect({ name: 'country' }, ['nl', 'my']);
    assert.equal(fill([country], 'MY'), true);
    assert.equal(country.value, 'my');
    assert.deepEqual(country.events, ['input', 'change']);
    assert.equal(fill([country], 'fr'), false);
    const multi = new FakeSelect({ name: 'langs' }, ['en', 'de', 'fr']);
    multi.multiple = true;
    assert.equal(fill([multi], ['en', 'FR']), true);
    assert.deepEqual(multi.options.map((o) => o.selected), [true, false, true]);
  });

  it('checkboxes and radios are clicked into place so React sees a click', () => {
    const news = new FakeCheckable('INPUT', { name: 'news', type: 'checkbox' });
    assert.equal(fill([news], 'yes'), true);
    assert.equal(news.checked, true);
    assert.deepEqual(news.events, ['click']);
    fill([news], true);
    assert.deepEqual(news.events, ['click'], 'already checked: no second click');
    fill([news], false);
    assert.equal(news.checked, false);
    const plan = ['free', 'pro'].map((v) => new FakeCheckable('INPUT', { name: 'plan', type: 'radio', value: v }));
    assert.equal(fill(plan, 'Pro'), true);
    assert.equal(plan[1]!.checked, true);
    assert.equal(fill(plan, 'gold'), false);
    const tags = ['a', 'b', 'c'].map((v) => new FakeCheckable('INPUT', { name: 'tags', type: 'checkbox', value: v }));
    assert.equal(fill(tags, 'a, c'), true);
    assert.deepEqual(tags.map((t) => t.checked), [true, false, true]);
  });
});
