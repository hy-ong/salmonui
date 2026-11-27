---
title: Performance
description: Pivot Table budgets on 1,000,000 rows (initial aggregation, first paint, drill, filter, sort), the measured timings, and how the release gates assert them.
category: Pivot Table
order: 88
demos: [pivot-table-performance]
---

The pivot engine aggregates in one pass over typed columns, keeps every
drill, filter and sort incremental, and runs in a Worker when you pass
`worker`. Every budget below is a release gate.

## Measured timings

The fixture has 1,000,000 seeded rows, 3 row fields, 2 column fields and 2
value fields (about 50,000 × 500 cells when fully expanded). Each timing
ends with reading the first painted 60 × 60 window, so lazy work is
counted. Salmon UI numbers are medians from `npm run test:perf`
(`packages/pivot-table/tests/engine/pivot-performance.test.ts`) and the
production-build browser run (`tests/browser/pivot-perf.spec.ts`) on an
Apple M5 Max, measured 2026-11-24 with other test suites running on the
same machine (load average about 7).

<<<

| Scenario | Budget | Salmon UI |
| --- | --- | --- |
| Initial aggregation in a Worker, data to result ready | ≤ 1.5 s | 1,123 ms |
| Initial aggregation, in-process | (reported) | 371 ms |
| Initial render to first painted viewport, Worker | ≤ 1.8 s | 860 ms |
| Sort a row field | ≤ 100 ms | 1.9 ms |
| Sort a column field | ≤ 100 ms | 2.1 ms |
| Filter a row field (apply) | ≤ 300 ms | 21.4 ms |
| Clear the row filter | ≤ 300 ms | 10.0 ms |
| Filter a column field (apply) | ≤ 300 ms | 49.7 ms |
| Clear the column filter | ≤ 300 ms | 41.1 ms |
| Drill down a row member | ≤ 50 ms | 4.2 ms |
| Drill up a row member | ≤ 50 ms | 1.8 ms |
| Drill down a column member | ≤ 50 ms | 1.9 ms |
| Drill up a column member | ≤ 50 ms | 1.7 ms |

Other paths have budgets too: value sort
on one column 3.0 ms (≤ 150 ms), moving a field between axes 91 ms
(≤ 1.5 s), SSR compute of 10,000 rows 8.1 ms (≤ 100 ms), opening the field
list 3.4 ms p95 (≤ 50 ms), opening the member editor of a field with
100,000 members 1.6 ms p95 through the Worker (≤ 50 ms), and scrolling
100,000 result rows at 2,000 px/s with 0 blank frames and a 16.8 ms p95
frame.

## How the gates run

`pivot-performance.test.ts` fails a timing that is over its budget **or**
over its fixed reference ceiling. Initial aggregation, drill,
filter and sort are `bench` core paths, so `npm run release:verify` gates
them against `tooling/bench/baseline.json` too. The browser rows (first
paint, scroll, field list, member editor) are in `npm run test:browser`.

## Try it

The demo below generates up to 1,000,000 rows in your browser and shows
the engine time of each step (`onComputeEnd`'s `duration`) next to its
budget. It runs the engine on the main thread of your machine, so its
numbers are not the gated ones above; use them to compare scenarios.
`paging` ([Pivot Table](/docs/pivot-table/pivot-table#size-virtualization-and-paging))
and the exact pre-aggregation of averages
([Aggregation](/docs/pivot-table/aggregation#data-compression)) are in the
same demo.
