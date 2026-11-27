// Listbox layout="grid": the APG Grid keyboard model and the tab-stop sync for controls
// inside cells. A lazy chunk, loaded after mount by a grid Listbox only.

/** The part of the Listbox view the grid keyboard reads. */
interface GridView {
  code(entry: number): number;
  disabled(code: number): boolean;
}

interface KeyInput {
  readonly key: string;
  readonly target: EventTarget | null;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  preventDefault(): void;
}

const CONTROLS = 'a[href],button,input,select,textarea,summary,iframe,[tabindex],[contenteditable]:not([contenteditable="false"])';
const TEXT_ENTRY = 'input:not([type=button],[type=checkbox],[type=radio],[type=reset],[type=submit],[type=image],[type=color],[type=file],[type=range]),textarea,select,[contenteditable]:not([contenteditable="false"])';
const SAVED = 'data-salmon-tabindex';

function cellOf(target: EventTarget | null, list: HTMLElement): HTMLElement | null {
  const cell = (target as Element | null)?.closest?.('[role="gridcell"]') as HTMLElement | null;
  return cell && list.contains(cell) ? cell : null;
}

/** The focusable controls of a cell, in DOM order. */
function controlsOf(cell: Element): HTMLElement[] {
  return Array.from(cell.querySelectorAll<HTMLElement>(CONTROLS)).filter((el) => !el.matches(':disabled') && !el.closest('[hidden],[inert]'));
}

/** The control inside a cell that `target` belongs to, if any (pointer clicks on it do not select). */
export function controlOf(target: EventTarget | null, list: HTMLElement): HTMLElement | null {
  const cell = cellOf(target, list);
  const control = (target as Element | null)?.closest?.(CONTROLS) as HTMLElement | null;
  return cell && control && control !== cell && cell.contains(control) ? control : null;
}

/**
 * Only the active cell's controls are tabbable (APG Grid: one tab stop per
 * composite, then the active cell's widgets). The controls of other cells
 * get tabindex="-1"; their own value is restored when their cell is active.
 */
export function syncTabStops(list: HTMLElement, activeId: string | undefined): void {
  for (const cell of list.querySelectorAll<HTMLElement>('[role="gridcell"]')) {
    const on = cell.id === activeId;
    for (const el of cell.querySelectorAll<HTMLElement>(CONTROLS)) {
      const saved = el.getAttribute(SAVED);
      if (on) {
        if (saved === null) continue;
        if (saved === '') el.removeAttribute('tabindex');
        else el.setAttribute('tabindex', saved);
        el.removeAttribute(SAVED);
      } else if (saved === null) {
        el.setAttribute(SAVED, el.getAttribute('tabindex') ?? '');
        el.setAttribute('tabindex', '-1');
      }
    }
  }
}

/**
 * Handles a grid key on the grid element or a control inside a cell; returns
 * true when the key was consumed (default prevented). `active` is the active
 * cell (entry) or -1, `page` the rows moved by Page Up / Page Down.
 */
export function gridKeyDown(
  event: KeyInput,
  list: HTMLElement,
  view: GridView,
  count: number,
  columns: number,
  active: number,
  page: number,
  setActive: (entry: number, reveal: boolean) => void,
): boolean {
  const enabled = (e: number): boolean => {
    const code = view.code(e);
    return code >= 0 && !view.disabled(code);
  };
  const rtl = getComputedStyle(list).direction === 'rtl';
  const key = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? ((event.key === 'ArrowRight') !== rtl ? 'next' : 'prev') : event.key;
  const rows = Math.ceil(count / columns);
  const edge = (dir: 1 | -1): number => {
    for (let e = dir === 1 ? 0 : count - 1; e >= 0 && e < count; e += dir) if (enabled(e)) return e;
    return -1;
  };
  const vertical = (from: number, dir: 1 | -1, distance: number): number => {
    if (from < 0) return edge(dir);
    const col = from % columns;
    let r = Math.floor(from / columns);
    let found = from;
    for (let moved = 0; moved < distance; ) {
      r += dir;
      if (r < 0 || r >= rows) break;
      const e = Math.min(r * columns + col, count - 1);
      if (!enabled(e)) continue;
      found = e;
      moved++;
    }
    return found;
  };
  const horizontal = (from: number, dir: 1 | -1): number => {
    if (from < 0) return edge(dir);
    const start = from - (from % columns);
    for (let e = from + dir; e >= start && e < Math.min(count, start + columns); e += dir) if (enabled(e)) return e;
    return from;
  };
  const done = (to: number): true => {
    event.preventDefault();
    if (to >= 0) setActive(to, true);
    return true;
  };
  const target = event.target as HTMLElement | null;
  if (target !== list) {
    // A control inside a cell: Escape, Up / Down return to the grid.
    const cell = cellOf(target, list);
    if (!cell || !target) return false;
    if (key === 'Escape') {
      list.focus();
      return done(-1);
    }
    if (target.matches(TEXT_ENTRY)) return false;
    const entry = Number(cell.getAttribute('data-entry'));
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      list.focus();
      return done(vertical(entry, key === 'ArrowDown' ? 1 : -1, 1));
    }
    if (key !== 'prev' && key !== 'next') return false;
    const controls = controlsOf(cell);
    const i = controls.findIndex((c) => c.contains(target));
    const next = controls[key === 'next' ? i + 1 : i - 1];
    if (next) {
      next.focus();
      return done(-1);
    }
    const to = key === 'next' ? horizontal(entry, 1) : entry;
    if (to !== entry || key === 'prev') list.focus();
    return done(to);
  }
  const from = active;
  const mod = event.ctrlKey || event.metaKey;
  switch (key) {
    case 'ArrowUp':
    case 'ArrowDown':
      return done(vertical(from, key === 'ArrowDown' ? 1 : -1, 1));
    case 'PageUp':
    case 'PageDown':
      return done(vertical(from, key === 'PageDown' ? 1 : -1, Math.max(1, page)));
    case 'prev':
      return done(horizontal(from, -1));
    case 'next': {
      const cell = from >= 0 ? list.querySelector(`[data-entry="${from}"]`) : null;
      const first = cell ? controlsOf(cell)[0] : undefined;
      if (first) {
        first.focus();
        return done(-1);
      }
      return done(horizontal(from, 1));
    }
    case 'Home':
    case 'End': {
      const dir = key === 'Home' ? 1 : -1;
      if (mod || from < 0) return done(edge(dir));
      const start = from - (from % columns);
      const end = Math.min(count, start + columns) - 1;
      for (let e = dir === 1 ? start : end; e >= start && e <= end; e += dir) if (enabled(e)) return done(e);
      return done(from);
    }
    default:
      return false;
  }
}
