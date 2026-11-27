// `search.highlight`: match ranges per operator, case and accent
// folding, and the server-rendered `<mark>` markup of rendered cells.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { searchMatches } from '../dist/data-grid/search-highlight.js';
import { count, render } from './fixtures.ts';

const d = (text: string, extra: Partial<{ operator: 'contains' | 'startsWith' | 'endsWith' | 'equal' | 'notEqual' | 'wildcard' | 'like'; ignoreCase: boolean; ignoreAccent: boolean }> = {}) => ({
  text,
  operator: extra.operator ?? 'contains',
  ignoreCase: extra.ignoreCase ?? true,
  ignoreAccent: extra.ignoreAccent ?? false,
});

describe('searchMatches', () => {
  it('contains: every non-overlapping match, case-insensitive by default', () => {
    assert.deepEqual(searchMatches('Banana', d('an')), [[1, 3], [3, 5]]);
    assert.deepEqual(searchMatches('Banana', d('AN')), [[1, 3], [3, 5]]);
    assert.deepEqual(searchMatches('Banana', d('AN', { ignoreCase: false })), []);
    assert.deepEqual(searchMatches('aaaa', d('aa')), [[0, 2], [2, 4]]);
  });

  it('startsWith, endsWith, equal, notEqual', () => {
    assert.deepEqual(searchMatches('Person 12', d('person', { operator: 'startsWith' })), [[0, 6]]);
    assert.deepEqual(searchMatches('Person 12', d('12', { operator: 'startsWith' })), []);
    assert.deepEqual(searchMatches('Person 12', d('12', { operator: 'endsWith' })), [[7, 9]]);
    assert.deepEqual(searchMatches('Person 12', d('person 12', { operator: 'equal' })), [[0, 9]]);
    assert.deepEqual(searchMatches('Person 12', d('Person', { operator: 'notEqual' })), []);
  });

  it('wildcard and like mark the whole value when the pattern matches it', () => {
    assert.deepEqual(searchMatches('Person 12', d('p*1?', { operator: 'wildcard' })), [[0, 9]]);
    assert.deepEqual(searchMatches('Person 12', d('p*1', { operator: 'wildcard' })), []);
    assert.deepEqual(searchMatches('Person 12', d('%son%', { operator: 'like' })), [[0, 9]]);
    assert.deepEqual(searchMatches('Person 12', d('P%', { operator: 'like', ignoreCase: false })), [[0, 9]]);
    assert.deepEqual(searchMatches('Person 12', d('p%', { operator: 'like', ignoreCase: false })), []);
    assert.deepEqual(searchMatches('José', d('jos?', { operator: 'wildcard', ignoreAccent: true })), [[0, 4]]);
  });

  it('accent folding maps matches back to the original characters', () => {
    assert.deepEqual(searchMatches('José Álvarez', d('jose', { ignoreAccent: true })), [[0, 4]]);
    assert.deepEqual(searchMatches('José Álvarez', d('jose')), []);
    // A decomposed accent (e + combining acute) stays inside the mark.
    assert.deepEqual(searchMatches('José!', d('jose', { ignoreAccent: true })), [[0, 5]]);
    assert.deepEqual(searchMatches('Crème', d('creme', { ignoreAccent: true })), [[0, 5]]);
  });

  it('no match for empty text or empty needle', () => {
    assert.deepEqual(searchMatches('', d('a')), []);
    assert.deepEqual(searchMatches('abc', d('')), []);
  });
});

describe('search.highlight markup', () => {
  it('marks matches in searched columns of rendered rows only, and nothing while off', () => {
    const on = render({ rows: 30, search: { text: 'son 2', fields: ['name'], highlight: true } });
    // Person 2, Person 20..29: one mark per rendered matching name.
    assert.equal(count(on, /<mark class="salmon-data-grid-search-mark">son 2<\/mark>/), 11);
    assert.match(on, /Per<mark class="salmon-data-grid-search-mark">son 2<\/mark>1/);
    const off = render({ rows: 30, search: { text: 'son 2', fields: ['name'] } });
    assert.doesNotMatch(off, /<mark/);
    // A column outside `fields` is not highlighted even when its text matches.
    const ages = render({ rows: 30, search: { text: '2', fields: ['name'], highlight: true } });
    assert.doesNotMatch(ages, /data-column-id="age"[^>]*><mark/);
  });
});
