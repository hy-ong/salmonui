// Task column presets of the grid pane: Data Grid column definitions per task role
// with formats and editors from the role. Durations and predecessors are
// edited as text (`'3 days'`, `'2FS+1d'`) through `valueSetter`, which
// writes the data fields the engine reads.

import type { DataGridColumn } from '@salmonui/data-grid';
import { parseDependencies } from '../internal/timeline/project/dependencies.js';
import { formatDeps, type GanttInstance } from './instance.js';
import type { GanttColumnPreset, GanttProps } from './types.js';
import type { GanttLocaleKey } from './locale.js';

const HEADERS: Readonly<Record<GanttColumnPreset, GanttLocaleKey>> = {
  id: 'columnId',
  title: 'columnTitle',
  start: 'columnStart',
  end: 'columnEnd',
  duration: 'columnDuration',
  progress: 'columnProgress',
  predecessors: 'columnPredecessors',
  resources: 'columnResources',
  work: 'columnWork',
  taskType: 'columnTaskType',
  notes: 'columnNotes',
  baselineStart: 'columnBaselineStart',
  baselineEnd: 'columnBaselineEnd',
  wbs: 'columnWbs',
  wbsPredecessors: 'columnWbsPredecessors',
  serialNumber: 'columnSerialNumber',
};

export const DEFAULT_COLUMNS: readonly GanttColumnPreset[] = ['title', 'start', 'end', 'duration', 'progress'];

const isPreset = (c: unknown): c is GanttColumnPreset => typeof c === 'string' && c in HEADERS;

/** Resource names of a task. */
export function resourceNames<Row>(g: GanttInstance<Row>, id: string): string {
  const t = g.engine.getTask(id);
  const list = t?.resources ?? [];
  if (!list.length) return '';
  const p = g.props;
  const idField = p.resourceFields?.id ?? 'id';
  const nameField = p.resourceFields?.name ?? 'name';
  return list
    .map((a) => {
      const res = p.resources?.find((r) => String(r[idField]) === a.id);
      const name = res ? String(res[nameField] ?? a.id) : a.id;
      return a.unit !== 100 ? `${name}[${a.unit}%]` : name;
    })
    .join(', ');
}

/** Grid columns of the `columns` prop (presets resolved). */
export function buildColumns<Row>(g: GanttInstance<Row>, props: GanttProps<Row>): DataGridColumn<Row>[] {
  const f = g.fields;
  const list = props.columns ?? (props.wbs ? (['wbs', ...DEFAULT_COLUMNS] as GanttColumnPreset[]) : DEFAULT_COLUMNS);
  const fine = g.level.bottom.unit === 'hour' || g.level.bottom.unit === 'minute';
  const dateType = fine ? 'datetime' : 'date';
  // `dateFormat`: a string is the Data Grid column format; `Intl` options format the instants in `timeZone`.
  const df = props.dateFormat;
  let dateFmt: Intl.DateTimeFormat | null = null;
  const dateFormat: Partial<DataGridColumn<Row>> | null =
    typeof df === 'string'
      ? { format: df }
      : df
        ? { valueFormatter: (v) => (v instanceof Date ? (dateFmt ??= new Intl.DateTimeFormat(props.locale ?? 'en-US', { ...df, ...(props.timeZone ? { timeZone: props.timeZone } : {}) })).format(v) : '') }
        : null;
  const idOf = (row: Row): string => g.idOf(row);
  return list.map((c): DataGridColumn<Row> => {
    if (!isPreset(c)) return c as DataGridColumn<Row>;
    const header = g.text(HEADERS[c]);
    switch (c) {
      case 'id':
        return { field: f.id, header, width: 70, editable: false, type: 'number' };
      case 'title':
        return { field: f.title, header, width: 220, validation: { required: true } } as DataGridColumn<Row>;
      case 'start':
      case 'end': {
        const field = f[c];
        // Remote rows are the source's rows: the cells show the computed dates of the engine.
        const computed: Partial<DataGridColumn<Row>> | null = Array.isArray(props.data)
          ? null
          : {
              valueGetter: (row) => ((g.getRow(idOf(row)) ?? row) as Record<string, unknown>)[field],
              valueSetter: (row, value) => ({ ...(row as Record<string, unknown>), [field]: value }) as Row,
            };
        return { field, header, width: 120, type: dateType, ...computed, ...dateFormat };
      }
      case 'baselineStart':
      case 'baselineEnd':
        return { field: f[c], header, width: 120, type: dateType, editable: false, ...dateFormat };
      case 'duration':
        return {
          id: 'duration',
          field: f.duration,
          header,
          width: 100,
          align: 'end',
          valueGetter: (row) => g.formatDuration(idOf(row)),
          valueSetter: (row, value) => {
            const parsed = g.parseDuration(String(value ?? ''));
            if (!parsed) return row;
            return { ...(row as Record<string, unknown>), [f.duration]: parsed.value, [f.durationUnit]: parsed.unit } as Row;
          },
          sortable: true,
        };
      case 'progress':
        return { field: f.progress, header, width: 90, type: 'number', align: 'end', renderCell: (ctx) => `${Math.round(Number(ctx.value) || 0)}%`, validation: { min: 0, max: 100 } } as DataGridColumn<Row>;
      case 'predecessors':
        return {
          id: 'predecessors',
          field: f.predecessors,
          header,
          width: 130,
          valueGetter: (row) => formatDeps(g.engine.getTask(idOf(row))?.predecessors ?? []),
          valueSetter: (row, value) => {
            const text = String(value ?? '');
            const prev = (row as Record<string, unknown>)[f.predecessors];
            return { ...(row as Record<string, unknown>), [f.predecessors]: Array.isArray(prev) ? parseDependencies(text) : text } as Row;
          },
        };
      case 'resources':
        return { id: 'resources', field: f.resources, header, width: 160, editable: false, valueGetter: (row) => resourceNames(g, idOf(row)) };
      case 'work':
        return { id: 'work', field: f.work, header, width: 90, align: 'end', editable: false, valueGetter: (row) => g.formatWork(idOf(row)) };
      case 'taskType':
        return { id: 'taskType', field: f.taskType, header, width: 120, editable: false, valueGetter: (row) => g.text(g.engine.getSchedule(idOf(row))?.taskType ?? 'fixedUnit') };
      case 'notes':
        return {
          field: f.notes,
          header,
          width: 200,
          ...(props.inlineNotes ? { overflow: 'clip' as const } : {}),
          renderCell: (ctx) => {
            const v = ctx.value === null || ctx.value === undefined ? '' : String(ctx.value);
            return props.inlineNotes ? <span className="salmon-gantt__notes" data-inline="">{v}</span> : <span className="salmon-gantt__notes" title={v}>{v}</span>;
          },
        };
      case 'wbs':
        return { id: 'wbs', header, width: 80, editable: false, valueGetter: (row) => g.engine.getSchedule(idOf(row))?.wbs ?? '' };
      case 'wbsPredecessors':
        return { id: 'wbsPredecessors', header, width: 130, editable: false, valueGetter: (row) => g.engine.formatWbsPredecessors(idOf(row)) };
      case 'serialNumber':
        return { id: 'serialNumber', type: 'rowNumber', header, width: 64 };
      default:
        return { field: c, header };
    }
  });
}
