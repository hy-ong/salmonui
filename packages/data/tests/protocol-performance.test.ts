// Protocol benchmark: one 10k-row page of the 100-column wide fixture
// (packages/data-grid-core/tests/fixtures.ts `wideFixture`), tuple + dictionary
// encoding vs plain array-of-objects JSON. Payload bytes are a structural
// gate; decode time is reported and gated loosely (timing varies by runner).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../tooling/bench/budget.mjs';
import { decodeTuples, encodeRows, type WireReadResponse, type WireType } from '@salmonui/data';
import { wideFixture } from '../../data-grid/tests/engine/fixtures.ts';

const ROWS = 10_000;
const RUNS = 7;

function median(fn: () => void): number {
  fn();
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    (globalThis as { gc?: () => void }).gc?.();
    const t = performance.now();
    fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[RUNS >> 1] as number;
}

describe('JSON protocol payload (10k rows x 100 columns)', () => {
  const { rows } = wideFixture(ROWS);
  const fields = ['id', ...Array.from({ length: 40 }, (_, c) => `s${c}`), ...Array.from({ length: 30 }, (_, c) => `n${c}`), ...Array.from({ length: 20 }, (_, c) => `d${c}`), ...Array.from({ length: 10 }, (_, c) => `b${c}`)];
  const types: WireType[] = fields.map((f) => (f === 'id' || f[0] === 's' ? 'string' : f[0] === 'n' ? 'number' : f[0] === 'd' ? 'date' : 'boolean'));

  const objectsJson = JSON.stringify(rows); // dates as ISO strings
  const plain = encodeRows(rows, { fields, types });
  const tupleJson = JSON.stringify({ v: 1, id: 'r1', fields, types, rows: plain.rows, total: ROWS } satisfies WireReadResponse);
  const dicted = encodeRows(rows, { fields, types, dict: 'auto' });
  const dictJson = JSON.stringify({ v: 1, id: 'r1', fields, types, rows: dicted.rows, dict: dicted.dict!, total: ROWS } satisfies WireReadResponse);

  it('tuple + dict payload is far smaller than array-of-objects', () => {
    const kb = (s: string) => Math.round(Buffer.byteLength(s) / 1024);
    const report = { objectsKB: kb(objectsJson), tuplesKB: kb(tupleJson), tuplesDictKB: kb(dictJson), dictFields: Object.keys(dicted.dict ?? {}).length };
    console.log('[protocol bytes]', JSON.stringify(report));
    assert.equal(report.dictFields, 40, 'the 40 low-cardinality string columns are dictionary encoded');
    assert.ok(Buffer.byteLength(dictJson) < Buffer.byteLength(objectsJson) * 0.5, 'tuple+dict is under half the object payload');
    assert.ok(Buffer.byteLength(dictJson) < Buffer.byteLength(tupleJson));
  });

  it('decodes tuple + dict at least as fast as array-of-objects (parse + revive dates)', () => {
    const dateFields = fields.filter((f) => f[0] === 'd');
    const objects = median(() => {
      const parsed = JSON.parse(objectsJson) as Record<string, unknown>[];
      // An object client must revive ISO dates to compare/format them.
      for (const r of parsed) for (const f of dateFields) r[f] = Date.parse(r[f] as string);
    });
    const objectsParseOnly = median(() => JSON.parse(objectsJson));
    const tuples = median(() => {
      const res = JSON.parse(dictJson) as WireReadResponse;
      decodeTuples(res.rows, res.fields, fields, res.dict);
    });
    const tuplesNoDict = median(() => {
      const res = JSON.parse(tupleJson) as WireReadResponse;
      decodeTuples(res.rows, res.fields, fields, res.dict);
    });
    console.log(
      '[protocol decode ms]',
      JSON.stringify({ objectsParseReviveDates: +objects.toFixed(2), objectsParseOnly: +objectsParseOnly.toFixed(2), tuplesDict: +tuples.toFixed(2), tuplesNoDict: +tuplesNoDict.toFixed(2) }),
    );
    assertBudget(tuples / objects, 1.25, 'tuple decode vs object decode ratio', { strict: true, unit: 'x' });
  });
});
