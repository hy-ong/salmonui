// toSql (`@salmonui/query-builder/sql`): parameterized by default,
// named and inline output, dialects, identifier quoting, LIKE escaping, NOT
// groups and custom operator hooks.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fromSql, SqlParseError, toSql, type QueryGroup } from '@salmonui/query-builder/sql';

const q: QueryGroup = {
  logic: 'and',
  filters: [
    { field: 'name', operator: 'startsWith', value: "O'Brien" },
    { logic: 'or', filters: [{ field: 'age', operator: 'greaterThan', value: 30 }, { field: 'age', operator: 'between', value: [10, 20] }] },
    { field: 'city', operator: 'in', value: ['Tokyo', 'Paris'] },
  ],
};

describe('toSql', () => {
  it('parameterized positional output is the default', () => {
    assert.deepEqual(toSql(q), {
      sql: "name LIKE ? ESCAPE '!' AND (age > ? OR age BETWEEN ? AND ?) AND city IN (?, ?)",
      params: ["O'Brien%", 30, 10, 20, 'Tokyo', 'Paris'],
    });
  });

  it('placeholders per dialect and named parameters', () => {
    assert.equal(toSql(q, { dialect: 'postgres' }).sql, "name LIKE $1 ESCAPE '!' AND (age > $2 OR age BETWEEN $3 AND $4) AND city IN ($5, $6)");
    assert.equal(toSql(q, { dialect: 'mssql' }).sql.split(' ')[2], '@p1');
    const named = toSql(q, { named: true });
    assert.equal(named.sql, "name LIKE :p1 ESCAPE '!' AND (age > :p2 OR age BETWEEN :p3 AND :p4) AND city IN (:p5, :p6)");
    assert.deepEqual(named.params, { p1: "O'Brien%", p2: 30, p3: 10, p4: 20, p5: 'Tokyo', p6: 'Paris' });
    assert.equal(toSql(q, { named: true, dialect: 'mssql', paramPrefix: 'v' }).sql.split(' ')[2], '@v1');
  });

  it('inline output escapes literals like getSqlFromRules', () => {
    const r = toSql(q, { inline: true });
    assert.equal(r.sql, "name LIKE 'O''Brien%' ESCAPE '!' AND (age > 30 OR age BETWEEN 10 AND 20) AND city IN ('Tokyo', 'Paris')");
    assert.deepEqual(r.params, []);
    assert.equal(toSql({ logic: 'and', filters: [{ field: 'ok', operator: 'equal', value: true }] }, { inline: true }).sql, 'ok = TRUE');
    assert.equal(toSql({ logic: 'and', filters: [{ field: 'ok', operator: 'equal', value: true }] }, { inline: true, dialect: 'mssql' }).sql, 'ok = 1');
    assert.equal(toSql({ logic: 'and', filters: [{ field: 'p', operator: 'equal', value: 'a\\b' }] }, { inline: true, dialect: 'mysql' }).sql, "p = 'a\\\\b'");
  });

  it('injection attempts stay data', () => {
    const evil: QueryGroup = { logic: 'and', filters: [{ field: 'name', operator: 'equal', value: "x'; DROP TABLE users; --" }] };
    assert.deepEqual(toSql(evil), { sql: 'name = ?', params: ["x'; DROP TABLE users; --"] });
    assert.equal(toSql(evil, { inline: true }).sql, "name = 'x''; DROP TABLE users; --'");
    // Identifiers are quoted with the quote character doubled.
    assert.equal(toSql({ logic: 'and', filters: [{ field: 'a"b', operator: 'isNull' }] }, { quoteIdentifier: true }).sql, '"a""b" IS NULL');
  });

  it('quoteIdentifier per dialect, nested paths and a custom quoter', () => {
    const v: QueryGroup = { logic: 'and', filters: [{ field: 'address.city', operator: 'equal', value: 'Oslo' }] };
    assert.equal(toSql(v, { quoteIdentifier: true }).sql, '"address"."city" = ?');
    assert.equal(toSql(v, { quoteIdentifier: true, dialect: 'mysql' }).sql, '`address`.`city` = ?');
    assert.equal(toSql(v, { quoteIdentifier: true, dialect: 'mssql' }).sql, '[address].[city] = @p1');
    assert.equal(toSql({ logic: 'and', filters: [{ field: 'address/city', operator: 'equal', value: 'Oslo' }] }, { quoteIdentifier: true, pathSeparator: '/' }).sql, '"address"."city" = ?');
    assert.equal(toSql(v, { quoteIdentifier: (n) => `<${n}>` }).sql, '<address>.<city> = ?');
  });

  it('every built-in operator; LIKE escapes the user text', () => {
    const one = (operator: string, value?: unknown) => toSql({ logic: 'and', filters: [{ field: 'f', operator, ...(value === undefined ? {} : { value: value as never }) }] });
    assert.deepEqual(one('contains', '50%_off!'), { sql: "f LIKE ? ESCAPE '!'", params: ['%50!%!_off!!%'] });
    assert.deepEqual(one('doesNotContain', 'a'), { sql: "f NOT LIKE ? ESCAPE '!'", params: ['%a%'] });
    assert.deepEqual(one('endsWith', 'a').params, ['%a']);
    assert.deepEqual(one('doesNotStartWith', 'a').sql, "f NOT LIKE ? ESCAPE '!'");
    assert.deepEqual(one('like', 'a*b%c_').params, ['a%b%c!_']);
    assert.deepEqual(one('wildcard', 'a*b?c').params, ['a%b_c']);
    assert.equal(one('isEmpty').sql, "f = ''");
    assert.equal(one('isNotEmpty').sql, "f <> ''");
    assert.equal(one('isNotNull').sql, 'f IS NOT NULL');
    assert.equal(one('equal', null).sql, 'f IS NULL');
    assert.equal(one('notEqual', null).sql, 'f IS NOT NULL');
    assert.equal(one('notEqual', 1).sql, 'f <> ?');
    assert.equal(one('greaterThanOrEqual', 1).sql, 'f >= ?');
    assert.equal(one('lessThan', 1).sql, 'f < ?');
    assert.equal(one('lessThanOrEqual', 1).sql, 'f <= ?');
    assert.equal(one('notIn', [1]).sql, 'f NOT IN (?)');
    assert.equal(one('in', []).sql, '1 = 0');
    // Short aliases.
    assert.equal(one('gte', 1).sql, 'f >= ?');
    assert.throws(() => one('nearby', 1), /operator "nearby"/);
    assert.throws(() => one('between', 1), /between/);
  });

  it('NOT groups, empty groups dropped, empty query', () => {
    const v: QueryGroup = { logic: 'or', not: true, filters: [{ field: 'a', operator: 'equal', value: 1 }, { logic: 'and', filters: [] }, { logic: 'and', not: true, filters: [{ field: 'b', operator: 'equal', value: 2 }] }] };
    assert.equal(toSql(v).sql, 'NOT (a = ? OR NOT (b = ?))');
    assert.deepEqual(toSql({ logic: 'and', filters: [] }), { sql: '', params: [] });
    assert.deepEqual(toSql({ logic: 'and', filters: [] }, { named: true }), { sql: '', params: {} });
  });

  it('custom operator hooks with parameters', () => {
    const r = toSql(
      { logic: 'and', filters: [{ field: 'tags', operator: 'hasTag', value: 'x' }, { field: 'n', operator: 'equal', value: 1 }] },
      { dialect: 'postgres', operators: { hasTag: ({ field, value, param }) => `${param(value ?? null)} = ANY(${field})`, equal: ({ field, param, value }) => `${field} IS NOT DISTINCT FROM ${param(value ?? null)}` } },
    );
    assert.deepEqual(r, { sql: '$1 = ANY(tags) AND n IS NOT DISTINCT FROM $2', params: ['x', 1] });
  });

  it('fromSql reads back inline SQL of every built-in operator', () => {
    const v: QueryGroup = {
      logic: 'and',
      filters: [
        { field: 'name', operator: 'startsWith', value: "O'Brien_50%" },
        { logic: 'or', not: true, filters: [{ field: 'age', operator: 'greaterThan', value: 30 }, { field: 'age', operator: 'between', value: [10, 20] }] },
        { field: 'city', operator: 'notIn', value: ['Tokyo', 'Paris'] },
        { field: 'ok', operator: 'equal', value: true },
        { field: 'n', operator: 'isNotNull' },
        { field: 'e', operator: 'isEmpty' },
        { field: 't', operator: 'doesNotEndWith', value: 'x' },
        { field: 'l', operator: 'like', value: 'a%b' },
        { field: 'w', operator: 'wildcard', value: 'a*b?' },
        { field: 'address.city', operator: 'notEqual', value: 'Oslo' },
      ],
    };
    for (const options of [{ inline: true }, { inline: true, quoteIdentifier: true }, { inline: true, quoteIdentifier: true, dialect: 'mysql' as const }]) {
      assert.deepEqual(fromSql(toSql(v, options).sql), v, JSON.stringify(options));
    }
    assert.deepEqual(fromSql(''), { logic: 'and', filters: [] });
  });

  it('fromSql with positional and named params', () => {
    const v: QueryGroup = { logic: 'or', filters: [{ field: 'a', operator: 'equal', value: 1 }, { field: 'b', operator: 'in', value: ['x', 'y'] }, { field: 'c', operator: 'contains', value: 'z' }] };
    for (const dialect of ['ansi', 'postgres', 'mssql'] as const) {
      const { sql, params } = toSql(v, { dialect });
      assert.deepEqual(fromSql(sql, { params: params as never }), v, dialect);
    }
    const named = toSql(v, { named: true });
    assert.deepEqual(fromSql(named.sql, { named: true, params: named.params as never }), v);
    assert.deepEqual(fromSql('"a"."b" = :x', { named: true, params: { x: 2 }, pathSeparator: '/' }), { logic: 'and', filters: [{ field: 'a/b', operator: 'equal', value: 2 }] });
  });

  it('anything outside the subset throws a SqlParseError, nothing is evaluated', () => {
    for (const bad of ['a = 1; DROP TABLE t', 'a = f(1)', 'SELECT * FROM t', 'a = ?', "a LIKE 'x' ESCAPE '\\'", 'a = 1 AND', '(a = 1', 'a NOT = 1', 'a = 1 OR OR b = 2']) {
      assert.throws(() => fromSql(bad), (e: unknown) => e instanceof SqlParseError && typeof e.position === 'number', bad);
    }
  });
});
