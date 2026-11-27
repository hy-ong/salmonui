// Tokenizer and BM25 ranking.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Bm25, tokenize } from '@salmonui/mcp';

describe('tokenize', () => {
  it('lower-cases, drops stopwords, stems plurals and splits identifiers', () => {
    assert.deepEqual(tokenize('How to use the Rows'), ['row']);
    assert.deepEqual(tokenize('onValueChange'), ['onvaluechange', 'value', 'change']);
    assert.deepEqual(tokenize('date-picker'), ['datepicker', 'date', 'picker']);
    assert.deepEqual(tokenize('HTMLElement queries sorting sorted'), ['htmlelement', 'html', 'element', 'query', 'sort', 'sort']);
  });
});

describe('Bm25', () => {
  const docs = [
    [{ text: 'Sorting', weight: 3 }, { text: 'Click a header to sort the rows.', weight: 1 }],
    [{ text: 'Filtering', weight: 3 }, { text: 'Filter rows by value. Sorting is separate.', weight: 1 }],
    [{ text: 'Theming', weight: 3 }, { text: 'Five color seeds.', weight: 1 }],
  ];
  const bm25 = new Bm25(docs);

  it('ranks the document whose weighted field matches first', () => {
    const hits = bm25.search('sort');
    assert.deepEqual(hits.map((h) => h.ref), [0, 1]);
    assert.ok(hits[0]!.score > hits[1]!.score);
  });

  it('returns nothing for unknown terms and expands abbreviations', () => {
    assert.deepEqual(bm25.search('zebra'), []);
    assert.equal(bm25.size, 3);
    const ssr = new Bm25([[{ text: 'Server rendering and hydration', weight: 1 }], [{ text: 'Colors', weight: 1 }]]);
    assert.equal(ssr.search('SSR')[0]?.ref, 0);
  });
});
