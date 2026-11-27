// Taskbar editing in the chart pane: move, resize from either end, progress drag, segment drag
// and drag to connect. Every pointer move writes the bar's DOM style and the
// editing tooltip directly (no React state); the engine runs once at the end. Events: `onTaskbarEditStart`
// (cancellable), `onTaskbarEdit` once per frame, `onBeforeTaskbarEditEnd`
// (cancellable) and `onTaskbarEditEnd`.

import { gridEvent } from '@salmonui/core/internal/events';
import { startPointerSession } from '@salmonui/core/internal/pointer-drag';
import { addUnits, startOfUnit, unitLength, type ScaleUnit } from '../internal/timeline/scale.js';
import type { Dependency, DependencyType } from '../internal/timeline/project/types.js';
import type { Formatters } from './chart.js';
import type { GanttInstance } from './instance.js';
import type { GanttTaskbarAction, GanttTaskbarEditEvent } from './types.js';

/** Snap unit of a drag: the bottom tier unit, at most a day (week / month scales snap to days). */
function snapUnit<Row>(g: GanttInstance<Row>): { unit: ScaleUnit; count: number } {
  const b = g.scale.level.bottom;
  if (b.unit === 'minute' || b.unit === 'hour') return { unit: b.unit, count: b.count };
  return { unit: 'day', count: 1 };
}

export function snap(wall: number, unit: ScaleUnit, count: number, weekStart = 0): number {
  const s = startOfUnit(wall, unit, count, weekStart);
  const e = addUnits(s, unit, count);
  return wall - s < e - wall ? s : e;
}

const fmtTip = (f: Formatters, s: number, e: number, fine: boolean): string => {
  const one = (w: number): string => (fine ? `${f.date(w)} ${new Date(w).toISOString().slice(11, 16)}` : f.date(w));
  return `${one(s)} – ${one(e)}`;
};

interface DragTarget {
  readonly action: GanttTaskbarAction;
  readonly id: string;
  readonly bar: HTMLElement;
  readonly segment: number | null;
  readonly end: 'start' | 'end' | null;
}

function classify(target: Element): DragTarget | null {
  const row = target.closest<HTMLElement>('.salmon-gantt__row');
  const bar = target.closest<HTMLElement>('.salmon-gantt__taskbar, .salmon-gantt__milestone');
  if (!row || !bar || !bar.hasAttribute('data-editable')) return null;
  const id = row.dataset['taskId'] as string;
  const point = target.closest<HTMLElement>('.salmon-gantt__connector-point');
  if (point) return { action: 'connect', id, bar, segment: null, end: point.dataset['end'] === 'start' ? 'start' : 'end' };
  const handle = target.closest<HTMLElement>('.salmon-gantt__handle');
  const segEl = target.closest<HTMLElement>('[data-segment]');
  const segment = segEl ? Number(segEl.dataset['segment']) : null;
  if (handle) {
    const side = handle.dataset['handle'];
    if (segment !== null) return { action: 'segmentResize', id, bar, segment, end: side === 'start' ? 'start' : 'end' };
    return { action: side === 'start' ? 'resizeStart' : 'resizeEnd', id, bar, segment: null, end: null };
  }
  if (target.closest('.salmon-gantt__progress-handle')) return { action: 'progress', id, bar, segment: null, end: null };
  if (segment !== null) return { action: 'segmentMove', id, bar, segment, end: null };
  return { action: 'move', id, bar, segment: null, end: null };
}

/** Starts a taskbar edit from a pointerdown in the chart; true when a drag started. */
export function startTaskbarDrag<Row>(g: GanttInstance<Row>, event: PointerEvent, formatters: Formatters): boolean {
  const target = event.target as Element | null;
  if (!target || !g.editable()) return false;
  const p = g.props;
  if (typeof p.editing === 'object' && p.editing.taskbar === false) return false;
  const t = classify(target);
  if (!t) return false;
  const schedule = g.engine.getSchedule(t.id);
  const task = g.engine.getTask(t.id);
  const row = g.getRow(t.id);
  if (!schedule || !task || !row || schedule.start === null || schedule.end === null) return false;
  if (schedule.parent && !schedule.manual && t.action !== 'connect') return false;
  if (schedule.milestone && t.action !== 'move' && t.action !== 'connect') return false;

  const scale = g.scale;
  const rtl = g.isRtl();
  const { unit, count } = snapUnit(g);
  const fine = unit === 'hour' || unit === 'minute';
  const startLeft = Number.parseFloat(t.bar.style.insetInlineStart) || 0;
  const startWidth = Number.parseFloat(t.bar.style.width) || 0;
  const s0 = schedule.start;
  const e0 = schedule.end;
  const segs = schedule.segments;
  let next = { start: s0, end: e0, progress: schedule.progress };
  const date = (w: number): Date => g.date(w);

  const fire = (type: 'taskbarEditStart' | 'taskbarEdit' | 'beforeTaskbarEditEnd' | 'taskbarEditEnd', extra?: { dependency?: Dependency & { to: string } }): GanttTaskbarEditEvent<Row> | null => {
    const handler = type === 'taskbarEditStart' ? p.onTaskbarEditStart : type === 'taskbarEdit' ? p.onTaskbarEdit : type === 'beforeTaskbarEditEnd' ? p.onBeforeTaskbarEditEnd : p.onTaskbarEditEnd;
    if (!handler) return null;
    const fields: Record<string, unknown> = { action: t.action, taskId: t.id, task: row, start: date(next.start), end: date(next.end), progress: next.progress };
    if (t.segment !== null) fields['segmentIndex'] = t.segment;
    if (extra?.dependency) fields['dependency'] = extra.dependency;
    const e = gridEvent<GanttTaskbarEditEvent<Row>>(type, event.pointerType === 'touch' ? 'touch' : 'pointer', fields as never);
    handler(e);
    return e;
  };

  const startEvent = fire('taskbarEditStart');
  if (startEvent?.defaultPrevented) return false;

  // Editing tooltip (`renderEditing`): plain DOM text, written per frame.
  const tip = t.bar.ownerDocument.createElement('div');
  tip.className = 'salmon-gantt__edit-tooltip';
  tip.setAttribute('role', 'status');
  const rowsEl = t.bar.closest('.salmon-gantt__rows') as HTMLElement | null;
  const rowEl = t.bar.closest('.salmon-gantt__row') as HTMLElement | null;
  // Connect preview: a line in the rows layer.
  let line: SVGLineElement | null = null;
  let originX = 0;
  let originY = 0;
  if (t.action === 'connect' && rowsEl && rowEl) {
    const svg = rowsEl.querySelector('.salmon-gantt__connectors');
    if (svg) {
      line = t.bar.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'salmon-gantt__connect-line');
      originX = t.end === 'start' ? startLeft : startLeft + startWidth;
      originY = rowEl.offsetTop + rowEl.offsetHeight / 2;
      line.setAttribute('x1', String(originX));
      line.setAttribute('y1', String(originY));
      line.setAttribute('x2', String(originX));
      line.setAttribute('y2', String(originY));
      svg.appendChild(line);
    }
  }
  rowEl?.appendChild(tip);
  t.bar.setAttribute('data-dragging', t.action);

  const progressBar = t.bar.querySelector<HTMLElement>('.salmon-gantt__progress');
  const progressHandle = t.bar.querySelector<HTMLElement>('.salmon-gantt__progress-handle');
  const segEl = t.segment !== null ? t.bar.querySelector<HTMLElement>(`.salmon-gantt__segment[data-segment="${t.segment}"]`) : null;
  const segLeft = segEl ? Number.parseFloat(segEl.style.insetInlineStart) || 0 : 0;
  const segWidth = segEl ? Number.parseFloat(segEl.style.width) || 0 : 0;
  let lastX = event.clientX;
  let lastY = event.clientY;
  const ms = 1 / scale.pxPerMs;
  const betweenRows = typeof p.editing === 'object' && !!p.editing.taskbarDragBetweenRows && t.action === 'move';

  const session = startPointerSession(
    t.bar,
    event,
    {
      onMove: (e) => {
        lastX = e.clientX;
        lastY = e.clientY;
        const dxPx = (e.clientX - event.clientX) * (rtl ? -1 : 1);
        const dt = dxPx * ms;
        const step = (w: number): number => snap(w, unit, count, scale.weekStart);
        switch (t.action) {
          case 'move': {
            const s = step(s0 + dt);
            next = { ...next, start: s, end: s + (e0 - s0) };
            if (betweenRows) t.bar.style.translate = `0 ${e.clientY - event.clientY}px`;
            t.bar.style.insetInlineStart = `${startLeft + (s - s0) / ms}px`;
            break;
          }
          case 'resizeStart': {
            const s = Math.min(step(s0 + dt), e0 - unitLength(unit) * count);
            next = { ...next, start: s };
            t.bar.style.insetInlineStart = `${startLeft + (s - s0) / ms}px`;
            t.bar.style.width = `${Math.max(2, startWidth - (s - s0) / ms)}px`;
            break;
          }
          case 'resizeEnd': {
            const en = Math.max(step(e0 + dt), s0 + unitLength(unit) * count);
            next = { ...next, end: en };
            t.bar.style.width = `${Math.max(2, startWidth + (en - e0) / ms)}px`;
            break;
          }
          case 'progress': {
            const pr = Math.max(0, Math.min(100, Math.round(((schedule.progress / 100) * startWidth + dxPx) / Math.max(1, startWidth) * 100)));
            next = { ...next, progress: pr };
            if (progressBar) progressBar.style.width = `${pr}%`;
            if (progressHandle) progressHandle.style.insetInlineStart = `${pr}%`;
            break;
          }
          case 'segmentMove':
            if (segEl) segEl.style.insetInlineStart = `${segLeft + Math.round(dt / (unitLength(unit) * count)) * (unitLength(unit) * count) / ms}px`;
            break;
          case 'segmentResize':
            if (segEl) {
              const d = Math.round(dt / (unitLength(unit) * count)) * (unitLength(unit) * count) / ms;
              if (t.end === 'end') segEl.style.width = `${Math.max(2, segWidth + d)}px`;
              else {
                segEl.style.insetInlineStart = `${segLeft + d}px`;
                segEl.style.width = `${Math.max(2, segWidth - d)}px`;
              }
            }
            break;
          case 'connect': {
            if (line && rowsEl) {
              const rect = rowsEl.getBoundingClientRect();
              const x = rtl ? rect.right - e.clientX : e.clientX - rect.left;
              line.setAttribute('x2', String(x));
              line.setAttribute('y2', String(e.clientY - rect.top));
            }
            break;
          }
        }
        if (t.action === 'connect' || t.action === 'segmentMove' || t.action === 'segmentResize') tip.textContent = '';
        else tip.textContent = t.action === 'progress' ? `${next.progress}%` : fmtTip(formatters, next.start, next.end, fine);
        // The tooltip follows the bar (it is a child of the row, which spans the whole chart).
        tip.style.insetInlineStart = t.bar.style.insetInlineStart;
        fire('taskbarEdit');
      },
      onEnd: (e, _rect, canceled) => {
        tip.remove();
        line?.remove();
        t.bar.removeAttribute('data-dragging');
        t.bar.style.translate = '';
        const restore = (): void => {
          t.bar.style.insetInlineStart = `${startLeft}px`;
          t.bar.style.width = `${startWidth}px`;
          if (progressBar) progressBar.style.width = `${schedule.progress}%`;
          if (progressHandle) progressHandle.style.insetInlineStart = `${schedule.progress}%`;
          if (segEl) {
            segEl.style.insetInlineStart = `${segLeft}px`;
            segEl.style.width = `${segWidth}px`;
          }
        };
        if (canceled) {
          restore();
          return;
        }
        const source = e.pointerType === 'touch' ? 'touch' : 'pointer';
        if (t.action === 'connect') {
          const hit = t.bar.ownerDocument.elementFromPoint?.(lastX, lastY) ?? null;
          const toBar = hit?.closest<HTMLElement>('.salmon-gantt__taskbar, .salmon-gantt__milestone') ?? null;
          const toRow = toBar?.closest<HTMLElement>('.salmon-gantt__row');
          const toId = toRow?.dataset['taskId'];
          if (!toBar || !toId || toId === t.id) return;
          const r = toBar.getBoundingClientRect();
          const before = rtl ? lastX > r.left + r.width / 2 : lastX < r.left + r.width / 2;
          const type = `${t.end === 'start' ? 's' : 'f'}${before ? 's' : 'f'}` as DependencyType;
          const dep: Dependency = { id: t.id, type, lag: 0, lagUnit: 'day' };
          const ev = fire('beforeTaskbarEditEnd', { dependency: { ...dep, to: toId } });
          if (ev?.defaultPrevented) return;
          const existing = g.engine.getTask(toId)?.predecessors ?? [];
          if (existing.some((d) => d.id === t.id)) return;
          g.dependencies(toId, [...existing, dep], 'add', source);
          fire('taskbarEditEnd', { dependency: { ...dep, to: toId } });
          return;
        }
        const ev = fire('beforeTaskbarEditEnd');
        if (ev?.defaultPrevented) {
          restore();
          return;
        }
        // Drag between rows.
        const between = betweenRows && rowEl ? Math.abs(lastY - event.clientY) > rowEl.offsetHeight / 2 : false;
        if (between) {
          t.bar.style.pointerEvents = 'none';
          const hit = t.bar.ownerDocument.elementFromPoint?.(lastX, lastY)?.closest<HTMLElement>('.salmon-gantt__row');
          t.bar.style.pointerEvents = '';
          const key = hit?.dataset['rowKey'];
          if (hit && key && hit !== rowEl) {
            const r = g.dropOnRow(t.id, { key, group: hit.dataset['resource'] }, rowEl?.dataset['resource'], { start: next.start, end: next.end }, source);
            if (r.status === 'applied') fire('taskbarEditEnd');
            else restore();
            return;
          }
        }
        let result;
        if (t.action === 'segmentMove' || t.action === 'segmentResize') {
          const s = segs?.[t.segment as number];
          const unitMs = unitLength(unit) * count;
          const moved = (Math.round(((e.clientX - event.clientX) * (rtl ? -1 : 1) * ms) / unitMs) * unitMs) | 0;
          if (!s || !moved) {
            restore();
            return;
          }
          const segments = (segs ?? []).map((x, i) => {
            if (i !== t.segment) return { start: x.start, end: x.end };
            if (t.action === 'segmentMove') return { start: x.start + moved, end: x.end + moved };
            return t.end === 'end' ? { start: x.start, end: Math.max(x.start + unitMs, x.end + moved) } : { start: Math.min(x.end - unitMs, x.start + moved), end: x.end };
          });
          result = g.update(t.id, { segments }, source, 'taskbar');
        } else if (t.action === 'progress') {
          if (next.progress === schedule.progress) return;
          result = g.update(t.id, { progress: next.progress }, source, 'taskbar');
        } else if (t.action === 'move') {
          if (next.start === s0) {
            restore();
            return;
          }
          // A start alone keeps the duration (a start with an `end` key, even null, re-derives it).
          result = g.update(t.id, { start: next.start }, source, 'taskbar');
        } else if (t.action === 'resizeStart') {
          if (next.start === s0) return;
          result = g.update(t.id, { start: next.start, end: e0, duration: null }, source, 'taskbar');
        } else {
          if (next.end === e0) return;
          result = g.update(t.id, { end: next.end, duration: null }, source, 'taskbar');
        }
        if (result.status !== 'applied') restore();
        else fire('taskbarEditEnd');
      },
    },
    { threshold: 3, escape: true },
  );
  return session !== null;
}

