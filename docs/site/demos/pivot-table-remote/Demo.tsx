'use client';

import { useRef, useState } from 'react';
import { createJsonPivotSource, type RemotePivotEngine, type WirePivotModel } from '@salmonui/data/json';
import { PivotTable, usePivot, type PivotFieldDefinition, type PivotLoadingContext, type PivotModelInput } from '@salmonui/pivot-table';
import { demoFetch } from '../../lib/remote';
import { Button } from '@salmonui/buttons/button';
import { TextField } from '@salmonui/inputs/text-field';

// The rows stay on the server, so the field list and the axis bar read the fields from these definitions.
const FIELDS: PivotFieldDefinition[] = [
  { field: 'region', caption: 'Region', type: 'string' },
  { field: 'country', caption: 'Country', type: 'string' },
  { field: 'product', caption: 'Product', type: 'string' },
  { field: 'year', caption: 'Year', type: 'string' },
  { field: 'amount', caption: 'Amount', type: 'number' },
  { field: 'units', caption: 'Units', type: 'number' },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'region' }, { field: 'country' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
  formats: { amount: { number: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } } },
};

// Custom content of the loading overlay.
const renderLoading = ({ status }: PivotLoadingContext) => <span className="demo-badge">Aggregating on the server… ({status})</span>;

function download(data: Uint8Array | string, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The pivot engine on the server: windows over the JSON protocol, auth headers, request hooks, a loading template and export over remote windows. */
export default function PivotTableRemoteDemo() {
  const [token, setToken] = useState('demo-token');
  const [log, setLog] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  // `setLog` is stable, so the source created once below can log through it.
  const push = (line: string) => setLog((items) => [line, ...items].slice(0, 8));
  // Read by the source per request; written by the input's change handler, never during render.
  const tokenRef = useRef(token);
  const engineRef = useRef<RemotePivotEngine | null>(null);

  // One source per mounted demo. `delay` makes the server answer slowly enough to see the loading state.
  const [source] = useState(() =>
    createJsonPivotSource({
      url: '/api/pivot?delay=400',
      fetch: demoFetch,
      headers: () => ({ authorization: `Bearer ${tokenRef.current}` }),
      onRequest: ({ kind }) => push(`→ ${kind} request`),
      onResponse: ({ kind, durationMs }) => push(`← ${kind} in ${Math.round(durationMs)} ms`),
      onError: ({ kind, error }) => push(`✕ ${kind}: ${error instanceof Error ? error.message : String(error)}`),
    }),
  );
  const pivot = usePivot({
    fields: FIELDS,
    defaultPivotModel: MODEL,
    locale: 'en-US',
    // The remote engine replaces the local one; raw rows stay on the server.
    createEngine: (options) => {
      const engine = source.createEngine({ model: options.model as WirePivotModel, locale: 'en-US' });
      engineRef.current = engine;
      return engine;
    },
  });

  const exportRemote = async (format: 'xlsx' | 'csv') => {
    const engine = engineRef.current;
    if (!engine) return;
    setExporting(true);
    try {
      // The writer loads every window of the server result through `loadWindow()`.
      const { exportPivot } = await import('@salmonui/export/pivot');
      const file = await exportPivot(engine, { format, fileName: 'remote-sales' });
      if (file) {
        download(file.data, file.fileName, file.mimeType);
        push(`exported ${file.fileName}`);
      }
    } catch (error) {
      push(`export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="demo-toolbar" role="group" aria-label="Remote pivot">
        <label>
          Bearer token
          <TextField
            aria-label="Bearer token"
            value={token}
            onValueChange={(next) => {
              setToken(next);
              tokenRef.current = next;
            }}
            style={{ inlineSize: '12em' }}
          />
        </label>
        <Button variant="outline" onClick={() => pivot.refresh()}>
          Refresh
        </Button>
        <Button variant="outline" onClick={() => void exportRemote('xlsx')} disabled={exporting}>
          Export Excel from the server result
        </Button>
        <Button variant="outline" onClick={() => void exportRemote('csv')} disabled={exporting}>
          Export CSV from the server result
        </Button>
      </div>
      <PivotTable pivot={pivot} axisBar drillThrough={{ maxRows: 100 }} renderLoading={renderLoading} height={300} aria-label="Sales aggregated on the server" />
      <p className="demo-status" aria-live="polite">
        Status <code>{pivot.status}</code>
        {pivot.status === 'error' && pivot.getSnapshot().error ? ` · ${pivot.getSnapshot().error?.message}` : ''}
      </p>
      <div className="demo-log" aria-label="Requests">
        {log.length ? (
          <ol>
            {log.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ol>
        ) : (
          'Requests appear here after the page loads.'
        )}
      </div>
    </div>
  );
}
