// PivotController: the store shared by
// PivotTable, PivotFieldList, PivotAxisBar, PivotToolbar and the chart
// adapters. The engine owns aggregation and the result; the controller owns
// the applied model, the draft model (defer update), the compute status, the
// selection and the open dialog, and runs every change as a cancellable
// command (before-event, apply, after-event). React reads it through
// `useSyncExternalStore` with narrow selectors (`usePivotState`).
//
// Render purity: the constructor runs inside a `useState` initializer (it
// computes the first result synchronously for local data so the server and
// the client render the same markup); everything else runs in effects and
// event handlers.

import {
  createPivotEngine,
  createPivotWorkerEngine,
  normalizePivotModel,
  stableStringifyModel,
  type PivotAggregate,
  type PivotCalculatedField,
  type PivotConditionalFormat,
  type PivotEngine,
  type PivotEngineOptions,
  type PivotFieldInfo,
  type PivotFilter,
  type PivotFormat,
  type PivotGrouping,
  type PivotHeaderNode,
  type PivotMember,
  type PivotMemberPath,
  type PivotMemberSort,
  type PivotModel,
  type PivotModelInput,
  type PivotResult,
  type PivotTotals,
  type PivotValueSort,
} from '@salmonui/pivot-table/engine';
import { gridEvent, type DataGridEventInit } from '@salmonui/core/internal/events';
import { fieldInfosOf, isAsyncEngine, isRemoteEngine, remoteAsyncEngine, WindowedPivot, type AsyncEngineLike } from './windowed.js';
import { axisItems, axisOf, moveField as moveFieldOp, omit, setAggregate as setAggregateOp, VALUES_FIELD } from './model-ops.js';
import type {
  PivotAction,
  PivotAggregateMenuOpenEvent,
  PivotAxis,
  PivotCalculatedFieldChangeEvent,
  PivotCellKey,
  PivotCommandOptions,
  PivotComputeEvent,
  PivotDataChangeEvent,
  PivotDialogState,
  PivotDrillThroughEvent,
  PivotErrorEvent,
  PivotEventHandlers,
  PivotEventSource,
  PivotExpandedChangeEvent,
  PivotFieldMoveEvent,
  PivotFilterChangeEvent,
  PivotMemberEditorOpenEvent,
  PivotModelChangeEvent,
  PivotSelectionChangeEvent,
  PivotSortChangeEvent,
  PivotState,
  PivotTableState,
  UsePivotOptions,
} from './types.js';

/** Rows above which the first compute runs on the client after the first paint (overridable). */
export const DEFAULT_DEFER_COMPUTE_ABOVE = 50_000;

type Listener = () => void;
type Handlers<Row> = PivotEventHandlers<Row>;
/** An engine that may answer asynchronously (the Worker host). */
type AnyEngine<Row> = PivotEngine<Row>;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isPromise = (value: unknown): value is Promise<unknown> => typeof (value as { then?: unknown } | null)?.then === 'function';
const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));
const samePath = (a: PivotMemberPath, b: PivotMemberPath): boolean => a.length === b.length && a.every((x, i) => JSON.stringify(x) === JSON.stringify(b[i]));

/**
 * The store of one pivot report. Create it with `usePivot()`; pass it to the
 * pivot parts as `pivot`.
 */
export class PivotController<Row = unknown> {
  /** Latest event handlers (replaced on every `usePivot()` render, read when an event fires). */
  handlers: Handlers<Row>;
  private options: UsePivotOptions<Row>;
  private state: PivotState;
  private readonly listeners = new Set<Listener>();
  private engine: AnyEngine<Row> | null = null;
  private unsubscribeEngine: (() => void) | null = null;
  /** Window adapter of an asynchronous (Worker) engine; null for the local engine. */
  windowed: WindowedPivot | null = null;
  private memberCache: { version: unknown; data: unknown; fields: Map<string, { members: readonly PivotMember[] | null; promise: Promise<readonly PivotMember[]> }> } = { version: null, data: null, fields: new Map() };
  private data: readonly Row[];
  private initial: { duration: number; deferred: boolean } | null;
  private mounted = false;
  private appliedPropKey: string | null;
  private pending = 0;

  constructor(options: UsePivotOptions<Row>) {
    this.options = options;
    this.handlers = options;
    this.data = options.data ?? [];
    const model = normalizePivotModel(options.pivotModel ?? options.defaultPivotModel);
    this.appliedPropKey = options.pivotModel ? stableStringifyModel(model) : null;
    const deferred = this.isLarge();
    // The definitions' captions show before the first result (a remote or deferred compute).
    const fields = options.fields ? fieldInfosOf(options.fields) : [];
    this.state = { result: null, model, draft: null, status: deferred ? 'computing' : 'idle', error: null, fields, selection: [], dialog: null };
    const t0 = now();
    if (!deferred) this.createEngine(model);
    this.initial = { duration: now() - t0, deferred };
  }

  // -------------------------------------------------------------------------
  // Store
  // -------------------------------------------------------------------------

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): PivotState => this.state;

  /** Current result (null before the first compute). */
  get result(): PivotResult | null {
    return this.state.result;
  }

  get status(): PivotState['status'] {
    return this.state.status;
  }

  get model(): PivotModel {
    return this.state.model;
  }

  /** Raw rows the engine aggregates (after drill-through edits). */
  getData(): readonly Row[] {
    return this.data;
  }

  private set(patch: Partial<PivotState>): void {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof PivotState)[]) if (this.state[key] !== patch[key]) changed = true;
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) listener();
  }

  // -------------------------------------------------------------------------
  // Engine lifecycle
  // -------------------------------------------------------------------------

  private engineOptions(model: PivotModel): PivotEngineOptions<Row> {
    const o = this.options;
    const options: { -readonly [K in keyof PivotEngineOptions<Row>]: PivotEngineOptions<Row>[K] } = { data: this.data, model };
    if (o.fields) options.fields = o.fields;
    if (o.locale) options.locale = o.locale;
    if (o.customAggregates) options.customAggregates = o.customAggregates;
    if (o.getCellValue) options.getCellValue = o.getCellValue;
    return options;
  }

  private createEngine(model: PivotModel): void {
    try {
      const o = this.options;
      if (o.createEngine) {
        const created = o.createEngine({ model, locale: o.locale });
        // A remote engine (`createJsonPivotSource().createEngine()`) is driven through the window adapter.
        this.engine = (isRemoteEngine(created) ? remoteAsyncEngine(created, o.fields as never) : created) as AnyEngine<Row>;
      } else if (o.worker) {
        const { customAggregates: _c, getCellValue: _g, ...rest } = this.engineOptions(model);
        // The Worker host answers asynchronously; commands resolve through `run`, cells through the window adapter.
        this.engine = createPivotWorkerEngine(o.worker as never, rest as never) as unknown as AnyEngine<Row>;
      } else {
        this.engine = createPivotEngine(this.engineOptions(model));
      }
      if (isAsyncEngine(this.engine)) {
        const windowed = new WindowedPivot(this.engine, this.syncFromEngine);
        this.windowed = windowed;
        this.unsubscribeEngine = () => windowed.destroy();
      } else this.unsubscribeEngine = this.engine.subscribe(this.syncFromEngine);
      this.syncFromEngine();
    } catch (error) {
      this.engine = null;
      this.state = { ...this.state, status: 'error', error: toError(error) };
    }
  }

  /** Reads the engine snapshot into the store (also the engine listener). */
  private readonly syncFromEngine = (): void => {
    const engine = this.engine;
    if (!engine) return;
    const windowed = this.windowed;
    const result = windowed ? windowed.result : (engine.getSnapshot() ?? null);
    const model = typeof engine.getModel === 'function' ? (engine.getModel() ?? this.state.model) : this.state.model;
    // The window adapter has no fields until its engine is ready: keep the definitions' infos until then.
    const fields = windowed ? (windowed.fields.length ? windowed.fields : this.state.fields) : (engine.getFields?.() ?? this.state.fields);
    const asyncStatus = windowed ? (engine as unknown as AsyncEngineLike).getStatus() : null;
    const status = asyncStatus === 'error' ? 'error' : this.pending > 0 || asyncStatus === 'computing' ? 'computing' : result ? 'ready' : this.state.status === 'error' ? 'error' : 'computing';
    // Keep the model identity when the engine returns an equal copy.
    const nextModel = model === this.state.model || stableStringifyModel(model) === stableStringifyModel(this.state.model) ? this.state.model : model;
    this.set({ result, model: nextModel, fields, status, error: status === 'ready' ? null : this.state.error });
  };

  /** Called from an effect: subscribes to the engine, starts a deferred compute, reports the initial compute. */
  mount(): () => void {
    this.mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const initial = this.initial;
    this.initial = null;
    if (!this.engine) {
      if (initial?.deferred ?? this.isLarge()) {
        // Deferred (large input or Worker): compute after the first paint; the loading state shows meanwhile.
        this.emitCompute('onComputeStart', 'initial', 0);
        const t0 = now();
        timer = setTimeout(() => {
          this.createEngine(this.state.model);
          if (this.state.status === 'error') this.emitError(this.state.error as Error, 'compute');
          else this.whenReady(() => this.emitCompute('onComputeEnd', 'initial', now() - t0));
        }, 0);
      } else {
        // Recreated after an unmount (Strict Mode); the previous result stays on screen until then.
        this.createEngine(this.state.model);
      }
    } else if (initial) {
      this.emitCompute('onComputeStart', 'initial', 0);
      if (this.state.status === 'error') this.emitError(this.state.error as Error, 'compute');
      else this.emitCompute('onComputeEnd', 'initial', initial.duration);
    }
    return () => {
      this.mounted = false;
      if (timer !== undefined) clearTimeout(timer);
      this.unsubscribeEngine?.();
      this.unsubscribeEngine = null;
      this.engine?.destroy();
      this.engine = null;
      this.windowed = null;
    };
  }

  private isLarge(): boolean {
    return this.options.worker !== undefined || this.options.createEngine !== undefined || this.data.length > (this.options.deferComputeAbove ?? DEFAULT_DEFER_COMPUTE_ABOVE);
  }

  private whenReady(callback: () => void): void {
    if (this.state.status !== 'computing') {
      callback();
      return;
    }
    const off = this.subscribe(() => {
      if (this.state.status === 'computing') return;
      off();
      callback();
    });
  }

  /** Latest options (from `usePivot()` renders): handlers and creation-only fields. */
  updateOptions(options: UsePivotOptions<Row>): void {
    this.options = options;
    this.handlers = options;
  }

  /** Applies the reactive `pivotModel` prop when it changed structurally. */
  applyModelProp(input: PivotModelInput | undefined): void {
    if (!input) return;
    const model = normalizePivotModel(input);
    const key = stableStringifyModel(model);
    if (key === this.appliedPropKey) return;
    this.appliedPropKey = key;
    if (key === stableStringifyModel(this.state.model)) return;
    this.commit(model, 'prop', null, 'api', null, true);
  }

  /** Applies a new `data` prop (identity change). */
  applyDataProp(data: readonly Row[] | undefined): void {
    const next = data ?? [];
    if (next === this.data) return;
    this.data = next;
    if (this.engine) this.run('compute', 'update', () => this.engine?.setData(next));
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  private event<E extends PivotModelChangeEvent | PivotExpandedChangeEvent | PivotFilterChangeEvent | PivotSortChangeEvent | PivotFieldMoveEvent | PivotMemberEditorOpenEvent | PivotAggregateMenuOpenEvent | PivotCalculatedFieldChangeEvent | PivotComputeEvent | PivotErrorEvent | PivotSelectionChangeEvent | PivotDrillThroughEvent<Row>>(
    name: keyof Handlers<Row>,
    source: PivotEventSource,
    fields: DataGridEventInit<E>,
  ): E | null {
    const handler = this.handlers[name] as ((event: E) => void) | undefined;
    if (!handler) return null;
    const event = gridEvent<E>(name.slice(2, 3).toLowerCase() + name.slice(3), source, fields);
    handler(event);
    return event;
  }

  /** Fires a before-event; true when it was not cancelled. */
  private allowed<E extends Parameters<PivotController<Row>['event']>[2]>(name: keyof Handlers<Row>, source: PivotEventSource, fields: E): boolean {
    const event = this.event(name, source, fields as never);
    return !event?.defaultPrevented;
  }

  private emitCompute(name: 'onComputeStart' | 'onComputeEnd', phase: 'initial' | 'update', duration: number): void {
    this.event<PivotComputeEvent>(name, 'api', { phase, status: this.state.status, duration, result: this.state.result });
  }

  private emitError(error: Error, action: PivotErrorEvent['action']): void {
    if (!this.event<PivotErrorEvent>('onError', 'api', { error, action })) {
      if (typeof console !== 'undefined') console.error(error);
    }
  }

  /** Runs an engine command with the compute events, the status, and error reporting. */
  private run(action: PivotErrorEvent['action'], phase: 'update', fn: () => unknown): void {
    const engine = this.engine;
    if (!engine) return;
    const t0 = now();
    this.emitCompute('onComputeStart', phase, 0);
    let value: unknown;
    try {
      value = fn();
    } catch (error) {
      this.set({ status: 'error', error: toError(error) });
      this.emitError(toError(error), action);
      return;
    }
    if (isPromise(value)) {
      this.pending++;
      this.set({ status: 'computing' });
      value.then(
        () => {
          this.pending--;
          this.syncFromEngine();
          this.emitCompute('onComputeEnd', phase, now() - t0);
        },
        (error: unknown) => {
          this.pending--;
          this.set({ status: 'error', error: toError(error) });
          this.emitError(toError(error), action);
        },
      );
      return;
    }
    this.syncFromEngine();
    this.emitCompute('onComputeEnd', phase, now() - t0);
  }

  // -------------------------------------------------------------------------
  // Model commands
  // -------------------------------------------------------------------------

  /**
   * Applies a model (cancellable through `onBeforePivotModelChange`).
   * Returns false when the change was cancelled or changed nothing.
   */
  setModel(input: PivotModelInput | ((model: PivotModel) => PivotModelInput), options: PivotCommandOptions & { readonly action?: PivotAction; readonly field?: string | null } = {}): boolean {
    const base = options.draft ? (this.state.draft ?? this.state.model) : this.state.model;
    const next = normalizePivotModel(typeof input === 'function' ? input(base) : input);
    if (options.draft) {
      this.set({ draft: next });
      return true;
    }
    return this.commit(next, options.action ?? 'set', options.field ?? null, options.source ?? 'api', null);
  }

  /**
   * Shared commit path: model before-event, the engine command, the after-event.
   * `apply` runs a specialized engine command (expand, collapse) instead of `setModel`.
   */
  private commit(next: PivotModel, action: PivotAction, field: string | null, source: PivotEventSource, apply: (() => unknown) | null, force = false): boolean {
    const previousModel = this.state.model;
    if (!force && stableStringifyModel(next) === stableStringifyModel(previousModel)) return false;
    if (!this.allowed<DataGridEventInit<PivotModelChangeEvent>>('onBeforePivotModelChange', source, { action, model: next, previousModel, field })) return false;
    if (this.engine) {
      this.run(action, 'update', apply ?? (() => this.engine?.setModel(next)));
    }
    // Without an engine yet (deferred compute) the model is kept and computed on creation.
    if (!this.engine || this.state.model === previousModel) this.set({ model: next });
    this.event<PivotModelChangeEvent>('onPivotModelChange', source, { action, model: this.state.model, previousModel, field });
    return true;
  }

  /** Commits the draft model of a deferred field list (Apply). */
  applyDraft(source: PivotEventSource = 'api'): boolean {
    const draft = this.state.draft;
    if (!draft) return false;
    this.set({ draft: null });
    return this.commit(draft, 'apply', null, source, null);
  }

  /** Drops the draft model (Cancel). */
  cancelDraft(): void {
    this.set({ draft: null });
  }

  /** Starts a draft from the applied model (a deferred field list opening). */
  beginDraft(): void {
    if (!this.state.draft) this.set({ draft: this.state.model });
  }

  /** Moves a field between axes or inside one; `to: null` removes it (cancellable through `onBeforeFieldMove`). */
  moveField(field: string, to: PivotAxis | null, index = -1, options: PivotCommandOptions = {}): boolean {
    const base = options.draft ? (this.state.draft ?? this.state.model) : this.state.model;
    const from = field === VALUES_FIELD ? base.valuesPlacement.axis : axisOf(base, field);
    const source = options.source ?? 'api';
    if (!this.allowed<DataGridEventInit<PivotFieldMoveEvent>>('onBeforeFieldMove', source, { field, from, to, index })) return false;
    const done = this.setModel(moveFieldOp(base, field, to, index, this.state.fields), { ...options, action: to === null ? 'removeField' : 'moveField', field });
    if (done) this.event<PivotFieldMoveEvent>('onFieldMove', source, { field, from, to, index });
    return done;
  }

  /** Moves a field one step inside its axis (Alt+ArrowUp / ArrowDown). */
  stepField(field: string, axis: PivotAxis, step: -1 | 1, options: PivotCommandOptions = {}): boolean {
    const base = options.draft ? (this.state.draft ?? this.state.model) : this.state.model;
    const items = axisItems(base, axis);
    const i = items.indexOf(field);
    const j = i + step;
    if (i < 0 || j < 0 || j >= items.length) return false;
    return this.moveField(field, axis, j, options);
  }

  /** Member, label or value filter of a field; null clears it (cancellable through `onBeforeFilterChange`). */
  setFilter(field: string, filter: PivotFilter | null, options: PivotCommandOptions = {}): boolean {
    const base = options.draft ? (this.state.draft ?? this.state.model) : this.state.model;
    const previousFilter = base.filterBy[field] ?? null;
    const source = options.source ?? 'api';
    if (!this.allowed<DataGridEventInit<PivotFilterChangeEvent>>('onBeforeFilterChange', source, { field, filter, previousFilter })) return false;
    const filterBy = filter ? { ...base.filterBy, [field]: filter } : omit(base.filterBy, field);
    const done = this.setModel({ ...base, filterBy }, { ...options, action: 'filter', field });
    if (done) this.event<PivotFilterChangeEvent>('onFilterChange', source, { field, filter, previousFilter });
    return done;
  }

  /** Member sort of a field (cancellable through `onBeforeSortChange`). */
  setSort(field: string, sort: PivotMemberSort, options: PivotCommandOptions = {}): boolean {
    const base = options.draft ? (this.state.draft ?? this.state.model) : this.state.model;
    const source = options.source ?? 'api';
    if (!this.allowed<DataGridEventInit<PivotSortChangeEvent>>('onBeforeSortChange', source, { field, sort, valueSort: base.valueSort })) return false;
    const done = this.setModel({ ...base, sort: { ...base.sort, [field]: sort } }, { ...options, action: 'sort', field });
    if (done) this.event<PivotSortChangeEvent>('onSortChange', source, { field, sort, valueSort: this.state.model.valueSort });
    return done;
  }

  /** Value sort; null clears it. */
  setValueSort(valueSort: PivotValueSort | null, options: PivotCommandOptions = {}): boolean {
    const base = this.state.model;
    const source = options.source ?? 'api';
    if (!this.allowed<DataGridEventInit<PivotSortChangeEvent>>('onBeforeSortChange', source, { field: null, sort: null, valueSort })) return false;
    const done = this.setModel({ ...base, valueSort }, { ...options, action: 'valueSort' });
    if (done) this.event<PivotSortChangeEvent>('onSortChange', source, { field: null, sort: null, valueSort });
    return done;
  }

  /** Aggregate of the value field at `index`. */
  setAggregate(index: number, aggregate: PivotAggregate, options: PivotCommandOptions = {}): boolean {
    const base = options.draft ? (this.state.draft ?? this.state.model) : this.state.model;
    return this.setModel(setAggregateOp(base, index, aggregate), { ...options, action: 'aggregate', field: base.values[index]?.field ?? null });
  }

  /** Aggregates the menu offers; `onBeforeAggregateMenuOpen` may cancel or edit `items`. Null when cancelled. */
  aggregateMenuItems(field: string, index: number, items: PivotAggregate[], source: PivotEventSource = 'api'): PivotAggregate[] | null {
    const list = [...items];
    const event = this.event<PivotAggregateMenuOpenEvent>('onBeforeAggregateMenuOpen', source, { field, index, items: list });
    return event?.defaultPrevented ? null : list;
  }

  /** Adds or replaces a calculated field (by `name`), or removes it (`calculatedField: null`). */
  setCalculatedField(name: string, calculatedField: PivotCalculatedField | null, options: PivotCommandOptions & { readonly addToValues?: boolean } = {}): boolean {
    const base = options.draft ? (this.state.draft ?? this.state.model) : this.state.model;
    const previous = base.calculatedFields.find((c) => c.name === name) ?? null;
    const source = options.source ?? 'api';
    if (!this.allowed<DataGridEventInit<PivotCalculatedFieldChangeEvent>>('onBeforeCalculatedFieldChange', source, { name, calculatedField, previous })) return false;
    const list = base.calculatedFields.filter((c) => c.name !== name);
    const calculatedFields = calculatedField ? (previous ? base.calculatedFields.map((c) => (c.name === name ? calculatedField : c)) : [...list, calculatedField]) : list;
    let values = base.values;
    if (calculatedField && options.addToValues !== false && !values.some((v) => v.field === calculatedField.name)) values = [...values, calculatedField.caption ? { field: calculatedField.name, caption: calculatedField.caption, aggregate: 'sum' } : { field: calculatedField.name, aggregate: 'sum' }];
    if (!calculatedField) values = values.filter((v) => v.field !== name);
    const formats = calculatedField?.format ? { ...base.formats, [calculatedField.name]: calculatedField.format } : base.formats;
    const done = this.setModel({ ...base, calculatedFields, values, formats }, { ...options, action: 'calculatedField', field: name });
    if (done) this.event<PivotCalculatedFieldChangeEvent>('onCalculatedFieldChange', source, { name, calculatedField, previous });
    return done;
  }

  /** Number or date format of a value field or a member field (null clears it). */
  setFormat(field: string, format: PivotFormat | null, options: PivotCommandOptions = {}): boolean {
    const base = this.state.model;
    const formats = format ? { ...base.formats, [field]: format } : omit(base.formats, field);
    return this.setModel({ ...base, formats }, { ...options, action: 'format', field });
  }

  setConditionalFormats(conditionalFormats: readonly PivotConditionalFormat[], options: PivotCommandOptions = {}): boolean {
    return this.setModel({ ...this.state.model, conditionalFormats }, { ...options, action: 'conditionalFormat' });
  }

  /** Number range, date or custom grouping of a field; null ungroups it. */
  setGrouping(field: string, grouping: PivotGrouping | null, options: PivotCommandOptions = {}): boolean {
    const base = this.state.model;
    const groups = grouping ? { ...base.groups, [field]: grouping } : omit(base.groups, field);
    return this.setModel({ ...base, groups }, { ...options, action: 'group', field });
  }

  setTotals(totals: Partial<PivotTotals>, options: PivotCommandOptions = {}): boolean {
    const base = this.state.model;
    return this.setModel({ ...base, totals: { ...base.totals, ...totals } }, { ...options, action: 'totals' });
  }

  // -------------------------------------------------------------------------
  // Drill
  // -------------------------------------------------------------------------

  private isExpanded(path: PivotMemberPath): boolean {
    const expanded = this.state.model.expanded;
    return expanded === 'all' || expanded.some((p) => samePath(p, path));
  }

  /** Expands a member (incremental in the engine). */
  expand(path: PivotMemberPath, options: PivotCommandOptions = {}): boolean {
    return this.drill(path, true, options.source ?? 'api');
  }

  collapse(path: PivotMemberPath, options: PivotCommandOptions = {}): boolean {
    return this.drill(path, false, options.source ?? 'api');
  }

  /** Expands or collapses a header node. */
  toggle(node: PivotHeaderNode, options: PivotCommandOptions = {}): boolean {
    if (!node.expandable) return false;
    const path = [node.axis, ...node.path] as unknown as PivotMemberPath;
    return this.drill(path, !node.expanded, options.source ?? 'api');
  }

  private drill(path: PivotMemberPath, expand: boolean, source: PivotEventSource): boolean {
    if (this.isExpanded(path) === expand && this.state.model.expanded !== 'all') return false;
    const action = expand ? 'expand' : 'collapse';
    const axis = path[0];
    if (!this.allowed<DataGridEventInit<PivotExpandedChangeEvent>>('onBeforeExpandedChange', source, { action, path, axis, expanded: expand })) return false;
    const current = this.state.model.expanded;
    const list = current === 'all' ? this.expandedPathsFromResult() : current;
    const expanded = expand ? [...list, path] : list.filter((p) => !samePath(p, path) && !(p[0] === path[0] && p.length > path.length && samePath(p.slice(0, path.length) as unknown as PivotMemberPath, path)));
    const next = normalizePivotModel({ ...this.state.model, expanded });
    const done = this.commit(next, action, null, source, () => (expand ? this.engine?.expand(path) : this.engine?.collapse(path)));
    if (done) this.event<PivotExpandedChangeEvent>('onExpandedChange', source, { action, path, axis, expanded: expand });
    return done;
  }

  /** Paths of every expanded node of the current result (to turn `expanded: 'all'` into a list). */
  private expandedPathsFromResult(): PivotMemberPath[] {
    const out: PivotMemberPath[] = [];
    const result = this.state.result;
    if (!result) return out;
    const visit = (nodes: readonly PivotHeaderNode[]): void => {
      for (const node of nodes) {
        if (node.kind === 'member' && node.expanded) out.push([node.axis, ...node.path] as unknown as PivotMemberPath);
        if (node.children) visit(node.children);
      }
    };
    visit(result.rowTree);
    visit(result.columnTree);
    return out;
  }

  /** Expands every member of one axis or both (Ctrl+ArrowDown). */
  expandAll(axis?: 'rows' | 'columns', options: PivotCommandOptions = {}): boolean {
    return this.drillAll(true, axis, options.source ?? 'api');
  }

  collapseAll(axis?: 'rows' | 'columns', options: PivotCommandOptions = {}): boolean {
    return this.drillAll(false, axis, options.source ?? 'api');
  }

  private drillAll(expand: boolean, axis: 'rows' | 'columns' | undefined, source: PivotEventSource): boolean {
    const action = expand ? 'expandAll' : 'collapseAll';
    if (!this.allowed<DataGridEventInit<PivotExpandedChangeEvent>>('onBeforeExpandedChange', source, { action, path: null, axis: axis ?? null, expanded: expand })) return false;
    // Without an axis the model says it (`'all'` or none); per axis the engine expands every level and the
    // model mirrors its answer after the command.
    const next = axis ? this.state.model : normalizePivotModel({ ...this.state.model, expanded: expand ? 'all' : [] });
    const done = this.commit(next, action, null, source, () => (expand ? this.engine?.expandAll(axis) : this.engine?.collapseAll(axis)), axis !== undefined);
    if (done) this.event<PivotExpandedChangeEvent>('onExpandedChange', source, { action, path: null, axis: axis ?? null, expanded: expand });
    return done;
  }

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  /** Replaces the selected cells (cancellable through `onBeforeSelectionChange`). */
  setSelection(cells: readonly PivotCellKey[], options: PivotCommandOptions & { readonly confirmed?: boolean } = {}): boolean {
    const keys = cells.map((c) => `${c.rowKey}|${c.columnKey}`);
    const prev = this.state.selection;
    if (keys.length === prev.length && keys.every((k, i) => k === prev[i])) return false;
    const source = options.source ?? 'api';
    // `confirmed`: the renderer already ran the before-event (the Data Grid selection command).
    if (!options.confirmed && !this.allowed<DataGridEventInit<PivotSelectionChangeEvent>>('onBeforeSelectionChange', source, { cells, keys })) return false;
    this.set({ selection: keys });
    this.event<PivotSelectionChangeEvent>('onSelectionChange', source, { cells, keys });
    return true;
  }

  // -------------------------------------------------------------------------
  // Data, members, drill through
  // -------------------------------------------------------------------------

  /** Members of a field for the member editor: every member, searchable, no node limit. */
  getMembers(field: string, options?: { search?: string; limit?: number }): readonly PivotMember[] {
    const value = this.engine?.getMembers(field, options) ?? [];
    return isPromise(value) ? [] : value;
  }

  /** Members, waiting for an asynchronous engine. */
  async getMembersAsync(field: string, options?: { search?: string; limit?: number }): Promise<readonly PivotMember[]> {
    if (options) return (await this.engine?.getMembers(field, options)) ?? [];
    // Every member of a field: kept per data and model version, so reopening the member editor of an
    // asynchronous (Worker) engine does not copy 100,000 members across the boundary again.
    const version = this.state.result?.model ?? this.state.model;
    if (this.memberCache.version !== version || this.memberCache.data !== this.data) this.memberCache = { version, data: this.data, fields: new Map() };
    const cache = this.memberCache;
    let entry = cache.fields.get(field);
    if (!entry) {
      entry = { members: null, promise: Promise.resolve(this.engine?.getMembers(field)).then((m) => (entry && (entry.members = m ?? []), m ?? [])) };
      cache.fields.set(field, entry);
    }
    return entry.promise;
  }

  /** Members already loaded by `getMembersAsync()` (null when not loaded yet). */
  getLoadedMembers(field: string): readonly PivotMember[] | null {
    const version = this.state.result?.model ?? this.state.model;
    if (this.memberCache.version !== version || this.memberCache.data !== this.data) return null;
    return this.memberCache.fields.get(field)?.members ?? null;
  }

  /** Raw rows behind a value cell. */
  getCellRows(rowIndex: number, columnIndex: number): readonly Row[] {
    const engine = this.engine;
    if (!engine) return [];
    const rows = engine.drillThrough(rowIndex, columnIndex);
    return isPromise(rows) ? [] : rows;
  }

  /** Raw rows behind a value cell, waiting for an asynchronous engine. */
  async getCellRowsAsync(rowIndex: number, columnIndex: number): Promise<readonly Row[]> {
    return ((await this.engine?.drillThrough(rowIndex, columnIndex)) ?? []) as readonly Row[];
  }

  /** Raw row indexes behind a value cell. */
  getCellRowIndexes(rowIndex: number, columnIndex: number): readonly number[] {
    return this.state.result?.rowsAt(rowIndex, columnIndex) ?? [];
  }

  /**
   * Opens drill through for a value cell (cancellable through `onBeforeDrillThrough`).
   * `openDialog: false` only fires the events (an app with its own UI).
   */
  drillThrough(rowIndex: number, columnIndex: number, options: PivotCommandOptions & { readonly openDialog?: boolean } = {}): boolean {
    const result = this.state.result;
    if (!result || rowIndex < 0 || columnIndex < 0 || rowIndex >= result.rowCount || columnIndex >= result.columnCount) return false;
    const cell = result.cellAt(rowIndex, columnIndex);
    const source = options.source ?? 'api';
    let cache: readonly Row[] | null = null;
    const rows = (): readonly Row[] => (cache ??= this.getCellRows(rowIndex, columnIndex));
    const fields = (): DataGridEventInit<PivotDrillThroughEvent<Row>> => ({ rowKey: cell.rowKey, columnKey: cell.columnKey, measure: cell.measure, rowIndex, columnIndex, cell, rows });
    if (!this.allowed<DataGridEventInit<PivotDrillThroughEvent<Row>>>('onBeforeDrillThrough', source, fields())) return false;
    if (options.openDialog !== false) this.openDialog({ kind: 'drillThrough', rowIndex, columnIndex, rowKey: cell.rowKey, columnKey: cell.columnKey });
    this.event<PivotDrillThroughEvent<Row>>('onDrillThrough', source, fields());
    return true;
  }

  /**
   * Writes edited raw rows (drill-through editing): replaces the rows at
   * `index`, appends `index: -1` rows, removes `row: null` rows, then
   * re-aggregates incrementally and fires `onDataChange`.
   */
  updateRows(changes: readonly { readonly index: number; readonly row: Row | null }[], action: PivotDataChangeEvent<Row>['action'] = 'update'): void {
    if (!changes.length) return;
    const next = [...this.data];
    const report: { index: number; row: Row; previous: Row | undefined }[] = [];
    const removed = new Set<number>();
    for (const change of changes) {
      const inRange = change.index >= 0 && change.index < this.data.length;
      if (change.row === null) {
        if (inRange) {
          removed.add(change.index);
          report.push({ index: change.index, row: this.data[change.index] as Row, previous: this.data[change.index] });
        }
      } else if (!inRange) {
        next.push(change.row);
        report.push({ index: next.length - 1, row: change.row, previous: undefined });
      } else {
        report.push({ index: change.index, row: change.row, previous: next[change.index] });
        next[change.index] = change.row;
      }
    }
    const data = removed.size ? next.filter((_, i) => !removed.has(i)) : next;
    this.data = data;
    if (this.engine) this.run('compute', 'update', () => this.engine?.setData(data));
    this.handlers.onDataChange?.({ data, changes: report, action });
  }

  /** Re-reads the data and recomputes. */
  refresh(): void {
    if (this.engine) this.run('compute', 'update', () => this.engine?.refresh());
  }

  // -------------------------------------------------------------------------
  // Dialogs
  // -------------------------------------------------------------------------

  openDialog(dialog: PivotDialogState, source: PivotEventSource = 'api'): boolean {
    if (dialog.kind === 'memberEditor' && !this.allowed<DataGridEventInit<PivotMemberEditorOpenEvent>>('onBeforeMemberEditorOpen', source, { field: dialog.field })) return false;
    this.set({ dialog });
    return true;
  }

  closeDialog(): void {
    this.set({ dialog: null });
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  getState(extra: Omit<PivotTableState, 'version' | 'pivotModel'> = {}): PivotTableState {
    return { version: 1, pivotModel: this.state.model, ...extra };
  }

  /** Applies a saved state; false (with `onError`) when it is not a pivot state of a known version. */
  restoreState(state: PivotTableState | string, source: PivotEventSource = 'api'): boolean {
    let parsed: PivotTableState;
    try {
      parsed = typeof state === 'string' ? (JSON.parse(state) as PivotTableState) : state;
      if (!parsed || typeof parsed !== 'object' || parsed.version !== 1 || typeof parsed.pivotModel !== 'object') throw new Error('restoreState: not a pivot state of version 1');
    } catch (error) {
      this.emitError(toError(error), 'restore');
      return false;
    }
    return this.commit(normalizePivotModel(parsed.pivotModel), 'restore', null, source, null);
  }

  /** True while mounted (effects ran). */
  get isMounted(): boolean {
    return this.mounted;
  }
}
