'use client';

import { useEffect, useRef, useState } from 'react';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { createHeroRows, type HeroRow } from '../lib/hero-data';

// The landing page's live grid. It must not import
// demos/registry.ts or any demo module: the registry statically imports every
// demo and would put all of them in the landing page's first-load JavaScript.

const seedRows = createHeroRows(10_000);

const columns: DataGridColumn<HeroRow>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 118, pinned: 'start' },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'region', header: 'Region', width: 110 },
  { field: 'product', header: 'Product', width: 160 },
  { field: 'status', header: 'Status', width: 112 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 84 },
  { field: 'unitPrice', header: 'Unit price', type: 'number', format: 'C2', align: 'end', width: 112 },
  { field: 'total', header: 'Total', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'margin', header: 'Margin', type: 'number', format: 'P0', align: 'end', width: 96 },
];

const filtering = { ui: 'row' } as const;
const count = (n: number): string => n.toLocaleString('en-US');

type Timing = { generateMs: number; frameMs: number };

export function HeroGrid() {
  const [rows, setRows] = useState<readonly HeroRow[]>(seedRows);
  const [loading, setLoading] = useState(false);
  const [timing, setTiming] = useState<Timing | null>(null);
  // Set in the click handler, read in the commit effect: when the large set was handed to the grid.
  const swapStart = useRef<{ at: number; generateMs: number } | null>(null);

  useEffect(() => {
    const pending = swapStart.current;
    if (!pending) return;
    swapStart.current = null;
    // The first frame painted with the new rows: the frame after this commit.
    const frame = requestAnimationFrame(() => {
      setTiming({ generateMs: pending.generateMs, frameMs: performance.now() - pending.at });
      setLoading(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [rows]);

  const loadMillion = async () => {
    setLoading(true);
    const started = performance.now();
    const { createMillionRows } = await import('../lib/hero-million');
    const large = createMillionRows();
    const at = performance.now();
    swapStart.current = { at, generateMs: at - started };
    setRows(large);
  };

  const isMillion = rows !== seedRows;
  return (
    <div className="lp-hero-grid">
      <div className="lp-hero-grid__bar">
        <p className="lp-hero-grid__count" aria-live="polite">
          Rows in the browser<strong data-hero-rows={rows.length}>{count(rows.length)}</strong>
        </p>
        <div className="lp-hero-grid__actions">
          {/* Always rendered with a reserved size, so the read-out appearing shifts nothing. */}
          {timing ? (
            <p className="lp-hero-grid__timing" data-first-frame-ms={timing.frameMs.toFixed(1)}>
              First frame in <strong>{timing.frameMs.toFixed(0)} ms</strong>
              <span>, rows generated in {timing.generateMs.toFixed(0)} ms</span>
            </p>
          ) : (
            <p className="lp-hero-grid__timing">Generated on click, timed to the first painted frame</p>
          )}
          <button type="button" className="lp-button lp-button--quiet" onClick={loadMillion} disabled={loading || isMillion}>
            {loading ? 'Generating 1,000,000 rows…' : isMillion ? '1,000,000 rows loaded' : 'Load 1,000,000 rows'}
          </button>
        </div>
      </div>
      {/* Fixed block size in CSS, identical in server and client markup: hydrating or swapping in 1,000,000 rows shifts nothing. */}
      <div className="lp-hero-grid__frame">
        <DataGrid<HeroRow>
          aria-label="Live demo: sales orders"
          data={rows}
          columns={columns}
          sorting
          filtering={filtering}
          height="100%"
          locale="en-US"
          currency="USD"
          timeZone="UTC"
        />
      </div>
      <p className="lp-hero-grid__hint">Click a header to sort, type in the filter row, scroll as fast as you like.</p>
    </div>
  );
}
