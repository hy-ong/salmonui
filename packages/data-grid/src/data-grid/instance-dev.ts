// Development-only part of a DataGrid instance: the render records behind
// `__SALMON_UI_DEVTOOLS__` and the development warnings (template identity,
// late feature enable, missing row id or label). The instance creates it only
// when `DEV` is true and every call site sits behind `if (DEV)`, so production
// builds drop this module and its messages.

import { warnOnce } from '@salmonui/core/internal/dev';
import type { ColumnId, RowId } from '@salmonui/data-grid/engine';
import { requiredFeatures } from './features/detect.js';
import type { NormalizedProps } from './features/types.js';
import type { DataGridDevtoolsCommit, DataGridInstance } from './instance.js';
import type { DataGridProps } from './types.js';

/**
 * Render features that turn on after creation (late enable); the others warn once in development.
 * `lookup`: its display part needs no chunk (the core module computes display values, the header status is a static
 * structural read), so a lookup column added later works whenever the engine has the creation-only `lookup` module.
 */
const LATE_ENABLE: ReadonlySet<string> = new Set(['spans', 'toolbar', 'lookup']);

/** DataGrid-level templates that feed the render context (identity check). */
const DATA_GRID_TEMPLATE_PROPS = ['renderRow', 'renderEmpty', 'getRowProps', 'rowClassName', 'getCellProps'] as const;
/** Consecutive commits with a new template identity before the warning. */
const UNSTABLE_TEMPLATE_COMMITS = 3;

interface DevtoolsHook {
  onCommit?(commit: DataGridDevtoolsCommit): void;
}

export class DataGridInstanceDev<Row> {
  private readonly instance: DataGridInstance<Row>;
  /** The creation props: the features they required (late enable warnings). */
  private readonly createdWith: DataGridProps<Row>;
  private requiredAtCreation: Set<string> | null = null;
  // Render collection, flushed by the Profiler callback.
  private cells: string[] = [];
  private rows: RowId[] = [];
  private headers: ColumnId[] = [];
  /** Consecutive commits in which a template's identity changed, by template key. */
  private readonly streaks = new Map<string, number>();
  private columnsInput: unknown = null;

  constructor(instance: DataGridInstance<Row>, createdWith: DataGridProps<Row>) {
    this.instance = instance;
    this.createdWith = createdWith;
  }

  /** Records a rendered cell, row or header for the next commit report. */
  record(kind: 'cell' | 'row' | 'header', id: string): void {
    if (kind === 'cell') this.cells.push(id);
    else if (kind === 'row') this.rows.push(id);
    else this.headers.push(id);
  }

  readonly onProfilerRender = (_id: string, phase: 'mount' | 'update' | 'nested-update', actualDuration: number): void => {
    // onRender runs before the children's layout effects of the same commit;
    // the commit itself is synchronous, so a microtask sees every record.
    queueMicrotask(() => {
      const hook = (globalThis as { __SALMON_UI_DEVTOOLS__?: DevtoolsHook }).__SALMON_UI_DEVTOOLS__;
      const commit: DataGridDevtoolsCommit = {
        gridId: this.instance.gridId,
        phase,
        actualDuration,
        cells: this.cells,
        rows: this.rows,
        headers: this.headers,
      };
      this.cells = [];
      this.rows = [];
      this.headers = [];
      hook?.onCommit?.(commit);
    });
  };

  /** Checks of the mounted grid: row ids, accessible name, auto height over many rows. */
  mountChecks(): void {
    const instance = this.instance;
    const { gridId, props: p } = instance;
    if (instance.rowKeyFallback) {
      warnOnce(`${gridId}:rowId`, `DataGrid "${gridId}": no getRowId and no primaryKey column; using the "id" field as the row id. Set getRowId or a primaryKey column.`);
    }
    if (!p['aria-label'] && !p['aria-labelledby']) {
      warnOnce(`${gridId}:label`, `DataGrid "${gridId}": set aria-label or aria-labelledby so assistive technology can name the grid.`);
    }
    if (p.height === 'auto' && instance.engine.getSnapshot().rows.count > 500) {
      warnOnce(`${gridId}:autoHeight`, `DataGrid "${gridId}": height="auto" renders every row (${instance.engine.getSnapshot().rows.count}); give the grid a height to enable row virtualization.`);
    }
  }

  /**
   * Warns once per template when its function identity changes on several
   * consecutive commits (an inline arrow in a component that re-renders).
   * DataGrid-level templates are context inputs, so a new identity re-renders
   * every visible cell.
   */
  checkTemplateIdentity(prev: DataGridProps<Row>, props: DataGridProps<Row>): void {
    const instance = this.instance;
    const streaks = this.streaks;
    const changed: string[] = [];
    for (const key of DATA_GRID_TEMPLATE_PROPS) {
      const a = (prev as Record<string, unknown>)[key];
      const b = (props as Record<string, unknown>)[key];
      if (typeof a === 'function' && typeof b === 'function' && a !== b) changed.push(key);
    }
    const resolver = instance.columnResolver;
    if (resolver.lastInput !== this.columnsInput) {
      this.columnsInput = resolver.lastInput;
      for (const key of resolver.renderChanges) changed.push(`columns.${key}`);
    }
    for (const key of streaks.keys()) if (!changed.includes(key)) streaks.delete(key);
    for (const key of changed) {
      const n = (streaks.get(key) ?? 0) + 1;
      streaks.set(key, n);
      if (n !== UNSTABLE_TEMPLATE_COMMITS) continue;
      instance.queueWarning(
        Object.freeze({
          code: 'template-identity-unstable',
          message: `DataGrid "${instance.gridId}": ${key} gets a new function identity on every render, which re-renders the grid's cells. Define it at module scope or wrap it in useCallback / useMemo.`,
          gridId: instance.gridId,
        }),
      );
    }
  }

  /**
   * Development warnings: a creation-only
   * trigger that turned on after creation, and a `features` name set that
   * changed after creation. Both need a remount (a `key`) to take effect.
   */
  checkFeatureSet(rawProps: DataGridProps<Row>, props: DataGridProps<Row>): void {
    const { gridId, engine, initialProvided } = this.instance;
    const atCreation = (this.requiredAtCreation ??= new Set(requiredFeatures(this.createdWith as NormalizedProps)));
    for (const name of requiredFeatures(props as NormalizedProps)) {
      if (!atCreation.has(name) && !LATE_ENABLE.has(name)) warnOnce(`${gridId}:late-feature:${name}`, `DataGrid "${gridId}": the "${name}" feature was turned on after the grid was created; it applies only at creation. Remount the grid with a new \`key\` to turn it on.`);
      // A late lookup column displays its keys when the engine has no `lookup` module (it registers at creation only).
      if (name === 'lookup' && !atCreation.has(name) && engine.getModuleState('lookup') === undefined) {
        warnOnce(`${gridId}:late-lookup`, `DataGrid "${gridId}": a lookup column was added after the grid was created without the lookup module; it shows its raw keys. Declare a lookup column at creation, pass the module in \`modules\`, or remount the grid with a new \`key\`.`);
      }
    }
    const provided = rawProps.features;
    if (provided !== initialProvided) {
      const key = (list: DataGridProps<Row>['features']) => (list ?? []).map((f) => f.name).sort().join(',');
      if (key(provided) !== key(initialProvided)) warnOnce(`${gridId}:features-changed`, `DataGrid "${gridId}": the \`features\` prop changed its names after the grid was created; it is read at creation only. Remount the grid with a new \`key\` to change it.`);
    }
  }
}
