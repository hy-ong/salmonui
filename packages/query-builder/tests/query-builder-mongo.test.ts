// toMongo / fromMongo (`@salmonui/query-builder/mongo`).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fromMongo, toMongo, type QueryGroup } from '@salmonui/query-builder/mongo';

const q: QueryGroup = {
  logic: 'and',
  filters: [
    { field: 'name', operator: 'startsWith', value: 'a.b' },
    { logic: 'or', filters: [{ field: 'age', operator: 'greaterThan', value: 30 }, { field: 'age', operator: 'between', value: [10, 20] }] },
    { field: 'city', operator: 'in', value: ['Tokyo', 'Paris'] },
    { field: 'note', operator: 'doesNotContain', value: 'x', matchCase: true },
  ],
};

describe('toMongo', () => {
  it('groups, comparisons, ranges, lists and escaped regexes', () => {
    assert.deepEqual(toMongo(q), {
      $and: [
        { name: { $regex: '^a\\.b', $options: 'i' } },
        { $or: [{ age: { $gt: 30 } }, { age: { $gte: 10, $lte: 20 } }] },
        { city: { $in: ['Tokyo', 'Paris'] } },
        { note: { $not: { $regex: 'x' } } },
      ],
    });
  });

  it('every built-in operator', () => {
    const one = (operator: string, value?: unknown) => toMongo({ logic: 'and', filters: [{ field: 'f', operator, ...(value === undefined ? {} : { value: value as never }) }] }).$and as unknown[];
    assert.deepEqual(one('equal', 1), [{ f: { $eq: 1 } }]);
    assert.deepEqual(one('notEqual', 1), [{ f: { $ne: 1 } }]);
    assert.deepEqual(one('isNull'), [{ f: null }]);
    assert.deepEqual(one('isNotNull'), [{ f: { $ne: null } }]);
    assert.deepEqual(one('isEmpty'), [{ f: '' }]);
    assert.deepEqual(one('isNotEmpty'), [{ f: { $ne: '' } }]);
    assert.deepEqual(one('notIn', [1]), [{ f: { $nin: [1] } }]);
    assert.deepEqual(one('endsWith', 'x'), [{ f: { $regex: 'x$', $options: 'i' } }]);
    assert.deepEqual(one('like', 'a%b*c'), [{ f: { $regex: '^a.*b.*c$', $options: 'i' } }]);
    assert.deepEqual(one('wildcard', 'a*b?'), [{ f: { $regex: '^a.*b.$', $options: 'i' } }]);
    assert.deepEqual(one('lte', 2), [{ f: { $lte: 2 } }]);
    assert.throws(() => one('nearby', 1), /operator "nearby"/);
  });

  it('NOT groups as $nor; empty groups dropped', () => {
    assert.deepEqual(toMongo({ logic: 'or', not: true, filters: [{ field: 'a', operator: 'equal', value: 1 }, { logic: 'and', filters: [] }] }), { $nor: [{ a: { $eq: 1 } }] });
    assert.deepEqual(toMongo({ logic: 'and', not: true, filters: [{ field: 'a', operator: 'equal', value: 1 }] }), { $nor: [{ $and: [{ a: { $eq: 1 } }] }] });
    assert.deepEqual(toMongo({ logic: 'and', filters: [] }), {});
  });

  it('custom operator hooks; nested paths', () => {
    const r = toMongo(
      { logic: 'and', filters: [{ field: 'geo/loc', operator: 'near', value: [1, 2] }] },
      { pathSeparator: '/', operators: { near: ({ field, value }) => ({ [field]: { $near: value } }) } },
    );
    assert.deepEqual(r, { $and: [{ 'geo.loc': { $near: [1, 2] } }] });
  });
});

describe('fromMongo', () => {
  it('round-trips what toMongo writes', () => {
    assert.deepEqual(fromMongo(toMongo(q)), q);
    const negated: QueryGroup = { logic: 'or', not: true, filters: [{ field: 'a', operator: 'contains', value: 'x(y)' }, { field: 'b', operator: 'doesNotEndWith', value: 'p.q' }] };
    assert.deepEqual(fromMongo(toMongo(negated)), negated);
  });

  it('implicit equality, $and $or $nor, comparisons, $in $nin, $regex and $exists', () => {
    assert.deepEqual(
      fromMongo({ status: 'A', qty: { $lt: 30, $ne: 5 }, $or: [{ tags: { $in: ['x'] } }, { tags: { $nin: ['y'] } }], $nor: [{ gone: { $exists: true } }], when: { $exists: false }, n: null, s: /^ab$/i }),
      {
        logic: 'and',
        filters: [
          { field: 'status', operator: 'equal', value: 'A' },
          { field: 'qty', operator: 'lessThan', value: 30 },
          { field: 'qty', operator: 'notEqual', value: 5 },
          { logic: 'or', filters: [{ field: 'tags', operator: 'in', value: ['x'] }, { field: 'tags', operator: 'notIn', value: ['y'] }] },
          { logic: 'or', not: true, filters: [{ field: 'gone', operator: 'isNotNull' }] },
          { field: 'when', operator: 'isNull' },
          { field: 'n', operator: 'isNull' },
          { field: 's', operator: 'equal', value: 'ab' },
        ],
      },
    );
    assert.deepEqual(fromMongo({ $and: [{ a: { $gte: 1 } }, { b: { $regex: 'x\\.y$' } }] }), {
      logic: 'and',
      filters: [{ field: 'a', operator: 'greaterThanOrEqual', value: 1 }, { field: 'b', operator: 'endsWith', value: 'x.y', matchCase: true }],
    });
    assert.deepEqual(fromMongo({ 'address.city': { $eq: 'Oslo' } }, { pathSeparator: '/' }), { logic: 'and', filters: [{ field: 'address/city', operator: 'equal', value: 'Oslo' }] });
  });

  it('unsupported operators throw with their path', () => {
    assert.throws(() => fromMongo({ a: { $elemMatch: { b: 1 } } }), /unsupported operator "\$elemMatch" at a/);
    assert.throws(() => fromMongo({ $where: 'x' }), /"\$where"/);
    assert.throws(() => fromMongo({ $or: [{ a: { $regex: 'a+b' } }] }), /\$regex/);
    assert.throws(() => fromMongo({ a: { b: 1 } }), /embedded document/);
  });
});
