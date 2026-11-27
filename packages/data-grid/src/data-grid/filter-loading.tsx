// Loading state of the checklist / Excel values while a remote facet loads. The values match
// the grid `loadingIndicator`: `skeleton` (the default) draws placeholder value rows, `spinner` a spinner. The element
// stays one `role="status"` with the localized "Loading…" text, visually
// hidden under the skeleton, so assistive technology hears the same thing
// in both variants. Part of the lazy overlay chunk.

import type { ReactNode } from 'react';

/** Placeholder value rows of the skeleton variant. */
const SKELETON_ROWS = 6;

export function FilterValuesLoading({ indicator, label }: { indicator: 'spinner' | 'skeleton' | undefined; label: string }): ReactNode {
  const kind = indicator ?? 'skeleton';
  const bars: ReactNode[] = [];
  if (kind === 'skeleton') for (let i = 0; i < SKELETON_ROWS; i++) bars.push(<span key={i} className="salmon-data-grid-filter-menu__skeleton-row" />);
  return (
    <div className="salmon-data-grid-filter-menu__loading" role="status" data-loading="" data-indicator={kind}>
      {kind === 'skeleton' ? (
        <span className="salmon-data-grid-filter-menu__skeleton" aria-hidden="true">
          {bars}
        </span>
      ) : (
        <span className="salmon-data-grid-loading__spinner" aria-hidden="true" />
      )}
      <span className={kind === 'skeleton' ? 'salmon-data-grid-visually-hidden' : undefined}>{label}</span>
    </div>
  );
}
