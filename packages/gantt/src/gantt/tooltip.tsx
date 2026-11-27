'use client';

// Chart tooltip chunk: one public `Tooltip`
// (`@salmonui/overlays/tooltip`), controlled and anchored at the hovered or
// keyboard-focused taskbar, milestone, baseline or connector. The Scheduler
// tooltip model:
// delegated native listeners on the chart pick the target, the open and
// close delays are timers in a per-instance box, and React state changes
// only when the tooltip opens, moves or closes, so hovering adds no markup
// or renders to the rows. Lazy: loaded when the browser is idle after mount,
// only with `tooltip`. Its rules are `tooltip/styles.css`, imported by the
// app (`gantt -> tooltip`).

import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { gridEvent } from '@salmonui/core/internal/events';
import { themeScopeOf } from '@salmonui/core/internal/overlay';
import type { Dependency } from '../internal/timeline/project/types.js';
import { Tooltip } from '@salmonui/overlays/tooltip';
import type { Formatters } from './chart.js';
import type { GanttInstance } from './instance.js';
import type { GanttTaskbarContext, GanttTooltipOpenEvent, GanttTooltipOptions } from './types.js';

const OPEN_MS = 400;
const CLOSE_MS = 100;
const GRID = { display: 'grid' } as const;
const TARGET = '.salmon-gantt__row [data-part="taskbar"], .salmon-gantt__row [data-part="milestone"], .salmon-gantt__row [data-part="baseline"], .salmon-gantt__connector';

type Kind = 'taskbar' | 'baseline' | 'connector';

interface Shown {
  readonly el: Element;
  readonly kind: Kind;
  readonly content: ReactNode;
  readonly scope: Element | null;
}

function Anchor(props: { readonly el: Element; readonly set: (el: HTMLElement | null) => void; readonly describedBy: string | undefined }): ReactNode {
  const { el, describedBy } = props;
  useLayoutEffect(() => props.set(el as HTMLElement));
  useLayoutEffect(() => {
    if (!describedBy) return;
    const before = el.getAttribute('aria-describedby');
    el.setAttribute('aria-describedby', before ? `${before} ${describedBy}` : describedBy);
    return () => {
      if (before) el.setAttribute('aria-describedby', before);
      else el.removeAttribute('aria-describedby');
    };
  }, [el, describedBy]);
  return null;
}

function contextOf<Row>(g: GanttInstance<Row>, id: string): GanttTaskbarContext<Row> | null {
  const s = g.engine.getSchedule(id);
  const row = g.getRow(id);
  const info = g.info(id);
  if (!s || !row || !info) return null;
  const width = s.start !== null && s.end !== null ? (s.end - s.start) * g.scale.pxPerMs : 0;
  return { task: row, info, start: s.start === null ? null : g.date(s.start), end: s.end === null ? null : g.date(s.end), progress: s.progress, width, critical: !!g.critical?.has(id), selected: g.selectedId() === id };
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <span className="salmon-gantt__tooltip-line">
      <span className="salmon-gantt__tooltip-label">{label}: </span>
      {value}
    </span>
  );
}

/** Default and custom content of a target; null when nothing applies. */
function contentOf<Row>(g: GanttInstance<Row>, el: Element, kind: Kind, f: Formatters, cfg: GanttTooltipOptions<Row>): ReactNode {
  if (kind === 'connector') {
    const from = el.getAttribute('data-from') ?? '';
    const to = el.getAttribute('data-to') ?? '';
    const dep = g.engine.getTask(to)?.predecessors?.find((d: Dependency) => d.id === from);
    const a = g.getRow(from);
    const b = g.getRow(to);
    if (!dep || !a || !b) return null;
    if (cfg.renderConnector) return cfg.renderConnector({ from: a, to: b, dependency: dep });
    const title = (r: Row): string => String((r as Record<string, unknown>)[g.fields.title] ?? '');
    return (
      <span className="salmon-gantt__tooltip" style={GRID}>
        <strong>{g.text('connectorLabel', { from: title(a), to: title(b), type: g.text(dep.type) })}</strong>
        {dep.lag ? <Line label={g.text('tooltipLag')} value={`${dep.lag} ${dep.lagUnit}`} /> : null}
      </span>
    );
  }
  const id = el.closest<HTMLElement>('.salmon-gantt__row')?.dataset['taskId'];
  const ctx = id ? contextOf(g, id) : null;
  if (!id || !ctx) return null;
  const title = String((ctx.task as Record<string, unknown>)[g.fields.title] ?? '');
  if (kind === 'baseline') {
    if (cfg.renderBaseline) return cfg.renderBaseline(ctx);
    const t = g.engine.getTask(id);
    const bs = t?.baselineStart ?? null;
    const be = t?.baselineEnd ?? bs;
    if (bs === null || be === null) return null;
    return (
      <span className="salmon-gantt__tooltip" style={GRID}>
        <strong>{`${g.text('baseline')}: ${title}`}</strong>
        <Line label={g.text('tooltipStart')} value={f.date(bs)} />
        <Line label={g.text('tooltipEnd')} value={f.date(be)} />
      </span>
    );
  }
  if (cfg.renderTaskbar) return cfg.renderTaskbar(ctx);
  const s = g.engine.getSchedule(id);
  if (!s || s.start === null || s.end === null) return <span className="salmon-gantt__tooltip" style={GRID}><strong>{title}</strong></span>;
  return (
    <span className="salmon-gantt__tooltip" style={GRID}>
      <strong>{title}</strong>
      <Line label={g.text('tooltipStart')} value={f.date(s.start)} />
      {s.milestone ? null : <Line label={g.text('tooltipEnd')} value={f.date(s.end)} />}
      {s.milestone ? null : <Line label={g.text('tooltipDuration')} value={g.formatDuration(id)} />}
      {s.milestone ? null : <Line label={g.text('tooltipProgress')} value={`${Math.round(s.progress)}%`} />}
    </span>
  );
}

export function GanttTooltip<Row>(props: { readonly g: GanttInstance<Row>; readonly formatters: Formatters }) {
  const { g } = props;
  const [shown, setShown] = useState<Shown | null>(null);
  const [box] = useState(() => ({ timer: 0 as ReturnType<typeof setTimeout> | 0, shown: null as Shown | null, formatters: props.formatters }));
  useLayoutEffect(() => {
    box.shown = shown;
    box.formatters = props.formatters;
  });

  useEffect(() => {
    const root = g.chartRoot;
    if (!root) return;
    const clear = (): void => {
      if (box.timer) clearTimeout(box.timer);
      box.timer = 0;
    };
    const hide = (): void => {
      clear();
      if (box.shown) setShown(null);
    };
    const show = (target: Element, source: 'pointer' | 'keyboard'): void => {
      clear();
      const p = g.props;
      if (!p.tooltip || target === box.shown?.el || target.closest('[data-dragging]')) return;
      const kind: Kind = target.classList.contains('salmon-gantt__connector') ? 'connector' : target.getAttribute('data-part') === 'baseline' ? 'baseline' : 'taskbar';
      const id = target.closest<HTMLElement>('.salmon-gantt__row')?.dataset['taskId'] ?? target.getAttribute('data-to');
      if (p.onBeforeTooltipOpen) {
        const e = gridEvent<GanttTooltipOpenEvent<Row>>('beforeTooltipOpen', source, { kind, task: id ? (g.getRow(id) ?? null) : null });
        p.onBeforeTooltipOpen(e);
        if (e.defaultPrevented) return hide();
      }
      const content = contentOf(g, target, kind, box.formatters, typeof p.tooltip === 'object' ? p.tooltip : {});
      if (content === null || content === undefined) return hide();
      setShown({ el: target, kind, content, scope: themeScopeOf(target) ?? null });
    };
    const targetOf = (node: EventTarget | null): Element | null => (node instanceof Element ? node.closest(TARGET) : null);
    const onOver = (e: PointerEvent): void => {
      if (e.pointerType === 'touch' || e.buttons) return;
      const target = targetOf(e.target);
      if (!target) return;
      if (target === box.shown?.el) return clear();
      clear();
      box.timer = setTimeout(() => show(target, 'pointer'), box.shown ? 0 : OPEN_MS);
    };
    const onOut = (e: PointerEvent): void => {
      const from = targetOf(e.target);
      const to = e.relatedTarget as Element | null;
      if (!from || targetOf(to) === from || to?.closest?.('.salmon-tooltip')) return;
      clear();
      box.timer = setTimeout(hide, CLOSE_MS);
    };
    const onFocusIn = (e: FocusEvent): void => {
      const target = targetOf(e.target);
      if (target && target === e.target && target.matches(':focus-visible')) show(target, 'keyboard');
    };
    const onFocusOut = (): void => hide();
    root.addEventListener('pointerover', onOver);
    root.addEventListener('pointerout', onOut);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    root.addEventListener('pointerdown', hide);
    const hovered = root.querySelector(`.salmon-gantt__row [data-part]:hover`);
    const first = hovered ? targetOf(hovered) : null;
    if (first) box.timer = setTimeout(() => show(first, 'pointer'), OPEN_MS);
    return () => {
      clear();
      root.removeEventListener('pointerover', onOver);
      root.removeEventListener('pointerout', onOut);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      root.removeEventListener('pointerdown', hide);
    };
  }, [g, box]);

  if (!shown) return null;
  return (
    <Tooltip
      open
      onOpenChange={(next) => {
        if (!next) setShown(null);
      }}
      content={shown.content}
      container={shown.scope}
      placement="top"
      render={(tp) => <Anchor el={shown.el} set={tp.ref} describedBy={tp['aria-describedby']} />}
    />
  );
}
