'use client';

import { useSyncExternalStore } from 'react';
import { useDataGridInstance, useDataGridText } from './context.js';

const serverBusy = (): null => null;

/**
 * Export and print busy indicator: a spinner overlay with a polite
 * status while a file or the print document is produced. Renders nothing
 * (and never on the server) when idle.
 */
export function DataGridOutputStatus() {
  const output = useDataGridInstance().output;
  const text = useDataGridText();
  const busy = useSyncExternalStore(output.subscribe, output.getBusy, serverBusy);
  if (busy === null) return null;
  const label = text(busy === 'print' ? 'preparingPrint' : 'exporting');
  return (
    <div className="salmon-data-grid-output-status" data-busy={busy} role="status" aria-live="polite">
      <span className="salmon-data-grid-output-status__spinner" aria-hidden="true" />
      <span className="salmon-data-grid-output-status__text">{label}</span>
    </div>
  );
}
