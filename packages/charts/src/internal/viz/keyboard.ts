// Plot keyboard model: one tab stop for the plot, a virtual focus
// moved by keys, announced through the live region. Arrows follow the visual
// direction of the data (axes do not mirror in RTL unless `reversed`), so
// the caller passes `reversedX` for a reversed or mirrored x axis.

export type PlotKeyAction =
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'nextSeries'
  | 'prevSeries'
  | 'up'
  | 'down'
  | 'select'
  | 'escape'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset';

export interface PlotKeyOptions {
  readonly reversedX?: boolean | undefined;
  /** Horizontal charts move along y with Up / Down. */
  readonly horizontal?: boolean | undefined;
  readonly zoom?: boolean | undefined;
}

export function plotKeyAction(key: string, options: PlotKeyOptions = {}): PlotKeyAction | null {
  const fwd = options.reversedX ? 'prev' : 'next';
  const back = options.reversedX ? 'next' : 'prev';
  switch (key) {
    case 'ArrowRight':
      return options.horizontal ? 'up' : fwd;
    case 'ArrowLeft':
      return options.horizontal ? 'down' : back;
    case 'ArrowDown':
      return options.horizontal ? fwd : 'down';
    case 'ArrowUp':
      return options.horizontal ? back : 'up';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case 'PageDown':
      return 'nextSeries';
    case 'PageUp':
      return 'prevSeries';
    case 'Enter':
    case ' ':
      return 'select';
    case 'Escape':
      return 'escape';
    case '+':
    case '=':
      return options.zoom ? 'zoomIn' : null;
    case '-':
    case '_':
      return options.zoom ? 'zoomOut' : null;
    case '0':
      return options.zoom ? 'zoomReset' : null;
    default:
      return null;
  }
}

export interface PointTarget {
  /** Series index in render order. */
  readonly series: number;
  /** Point index in the series data. */
  readonly index: number;
}

/**
 * The next focused point. `counts[s]` is the point count of series `s`;
 * `visible(s)` skips hidden series. Up / Down move between series at the
 * nearest index (as PageUp / PageDown).
 */
export function movePointFocus(current: PointTarget | null, action: PlotKeyAction, counts: readonly number[], visible: (series: number) => boolean = () => true): PointTarget | null {
  const series = counts.map((_, i) => i).filter((i) => visible(i) && (counts[i] as number) > 0);
  if (series.length === 0) return null;
  if (!current || !series.includes(current.series)) return { series: series[0] as number, index: 0 };
  const count = counts[current.series] as number;
  const pos = series.indexOf(current.series);
  switch (action) {
    case 'next':
      return { series: current.series, index: Math.min(count - 1, current.index + 1) };
    case 'prev':
      return { series: current.series, index: Math.max(0, current.index - 1) };
    case 'first':
      return { series: current.series, index: 0 };
    case 'last':
      return { series: current.series, index: count - 1 };
    case 'nextSeries':
    case 'down': {
      const s = series[(pos + 1) % series.length] as number;
      return { series: s, index: Math.min((counts[s] as number) - 1, current.index) };
    }
    case 'prevSeries':
    case 'up': {
      const s = series[(pos - 1 + series.length) % series.length] as number;
      return { series: s, index: Math.min((counts[s] as number) - 1, current.index) };
    }
    default:
      return current;
  }
}
