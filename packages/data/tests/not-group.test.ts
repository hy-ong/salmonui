// Negated filter groups on the wire (`{ not: WirePredicate }`).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toWherePredicate, type FilterEntry, type WireReadResponse } from '@salmonui/data';
import { createJsonQueryHandler } from '@salmonui/data/server';

const c = (columnId: string, operator: string, value: unknown, predicate: 'and' | 'or' = 'and'): FilterEntry =>
  ({ columnId, operator, value, predicate, source: 'api' }) as FilterEntry;

describe('not on filter groups', () => {
  it('serializes a negated group as { not }', () => {
    const where = toWherePredicate([{ kind: 'group', predicate: 'or', not: true, filters: [c('a', 'equal', 1), c('b', 'equal', 2)] }]);
    assert.deepEqual(where, { not: { or: [{ field: 'a', op: 'equal', value: 1 }, { field: 'b', op: 'equal', value: 2 }] } });
    // A plain group is unchanged.
    assert.deepEqual(toWherePredicate([{ kind: 'group', predicate: 'and', filters: [c('a', 'equal', 1)] }]), { field: 'a', op: 'equal', value: 1 });
    // An empty negated group sends nothing.
    assert.equal(toWherePredicate([{ kind: 'group', predicate: 'and', not: true, filters: [] }]), undefined);
  });

  it('the reference server evaluates { not }', () => {
    const rows = [
      { id: 1, city: 'Tokyo', qty: 2 },
      { id: 2, city: 'Paris', qty: 2 },
      { id: 3, city: 'Tokyo', qty: 5 },
    ];
    const server = createJsonQueryHandler(rows, { key: 'id' });
    const where = toWherePredicate([{ kind: 'group', predicate: 'and', not: true, filters: [c('city', 'equal', 'Tokyo'), c('qty', 'equal', 2)] }]);
    const res = server.handle({ v: 1, id: 'r', query: { ...(where ? { where } : {}) } }) as WireReadResponse;
    const at = res.fields.indexOf('id');
    assert.deepEqual(res.rows.map((r) => r[at]), [2, 3]);
  });
});
