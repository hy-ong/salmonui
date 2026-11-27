'use client';

// Adaptive UI of the Gantt: one pane at a time with a pane switch, and full-screen
// dialogs. `adaptive: true` is always compact (server markup included);
// `{ breakpoint }` (default 640) follows the Gantt's own width through a
// `ResizeObserver` that writes `g.narrow` only when it flips, so the server
// and hydration render the full layout (the Scheduler model). The
// switch reuses the toolbar item styles (no CSS of its own). A
// `#gantt-modules` module, loaded with `adaptive`.

import { useEffect, type ReactNode, type RefObject } from 'react';
import type { GanttInstance } from './instance.js';

export function GanttPaneSwitch<Row>({ g, root, compact }: { g: GanttInstance<Row>; root: RefObject<HTMLDivElement | null>; compact: boolean }): ReactNode {
  const a = g.props.adaptive;
  const breakpoint = typeof a === 'object' ? (a.breakpoint ?? 640) : null;
  useEffect(() => {
    const el = root.current;
    if (breakpoint === null || !el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(([e]) => {
      const narrow = (e?.contentRect.width ?? 0) < breakpoint;
      if (narrow === g.narrow) return;
      g.narrow = narrow;
      g.emit();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      g.narrow = false;
    };
  }, [g, root, breakpoint]);
  if (!compact) return null;
  return (
    <div className="salmon-gantt__toolbar" role="group" aria-label={g.text('paneSwitch')}>
      {(['grid', 'chart'] as const).map((p) => (
        <button
          key={p}
          type="button"
          className="salmon-gantt__toolbar-item"
          data-pane={p}
          aria-pressed={g.pane === p}
          onClick={() => {
            g.pane = p;
            g.emit();
          }}
        >
          {g.text(p === 'grid' ? 'gridPane' : 'chart')}
        </button>
      ))}
    </div>
  );
}
