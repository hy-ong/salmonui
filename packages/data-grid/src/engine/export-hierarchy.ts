// Detail and child-grid blocks of an export or print (PRT hierarchy modes). Reads the `detail` module's expansion state
// and the `hierarchy` module's child grid descriptors; never a renderer.
//
// `hierarchy` mode:
//   - `expanded`: rows whose detail is expanded in the grid (`detail.isExpanded`);
//   - `all`: every exported row with a detail;
//   - `none`: no detail blocks.
// `expanded` also limits the export's own `detail` hook (detail templates,
// `renderDetail`) to expanded rows whenever the grid has an enabled `detail`
// module; a grid without one has no expansion state and keeps the hook as is.
// A child grid becomes a nested `ExportModel` built from a headless child
// engine over the descriptor options (same columns, relation scoping,
// locale, and nested levels as the rendered child grid). Nested levels use
// the child grid's own expansion defaults in `expanded` mode (the headless
// child engine has no user expansion). Child sources that cannot answer
// synchronously (remote) export the rows they hold at that moment: none.

import { createDataGridEngine } from './engine.js';
import { createDetailModule } from './expansion.js';
import { createExportModel, createExportModule, type ExportDetail, type ExportDetailContext, type ExportHierarchyMode, type ExportModel } from './export-model.js';
import { createHierarchyModule, type ChildGridDescriptor } from './hierarchy.js';
import type { DataGridEngine, DataGridOptions, RowId } from './types.js';

type DetailHook<Row> = (ctx: ExportDetailContext<Row>) => ExportDetail | null | undefined | void;

interface DetailFacade {
  isExpanded(rowId: RowId): boolean;
}
interface HierarchyFacade<Row> {
  describeChildGrid?(rowId: RowId, row: Row): ChildGridDescriptor | undefined;
}

/** Options of a child model (the parent export's scope does not apply; child grids are not paged in export). */
export interface HierarchyDetailOptions {
  /** Upper bound of nested levels (Excel outlines nest at most 7). Default 7. */
  readonly maxDepth?: number;
}

/**
 * The `detail` hook of a grid's hierarchy: a nested child-grid model per
 * parent row by `mode`, or undefined when `mode` is `none`. `user` (the
 * export's own `detail` hook) runs first and wins when it returns a value
 * (`null` suppresses the block). In `expanded` mode with an enabled `detail`
 * module, rows whose detail is collapsed get no block (user hook included).
 * Without a `detail` module the user hook is returned as is.
 */
export function hierarchyExportDetail<Row>(
  engine: DataGridEngine<Row>,
  mode: ExportHierarchyMode,
  user?: DetailHook<Row>,
  options: HierarchyDetailOptions = {},
): DetailHook<Row> | undefined {
  if (mode === 'none') return undefined;
  const detail = engine.getModuleState<{ enabled: boolean }>('detail');
  const hierarchy = engine.getModuleState<{ enabled: boolean; depth: number }>('hierarchy');
  if (!detail?.enabled) return user;
  const detailApi = (engine as unknown as { detail: DetailFacade }).detail;
  // Detail templates only (no child grids): `expanded` keeps the expanded rows.
  const own = mode === 'expanded' && user ? expandedOnly(detailApi, user) : user;
  if (!hierarchy?.enabled) return own;
  const maxDepth = options.maxDepth ?? 7;
  if (hierarchy.depth >= maxDepth) return own;
  const hierarchyApi = (engine as unknown as { hierarchy: HierarchyFacade<Row> }).hierarchy;
  if (typeof hierarchyApi?.describeChildGrid !== 'function') return own;
  return (ctx) => {
    if (mode === 'expanded' && !detailApi.isExpanded(ctx.rowId)) return null;
    if (user) {
      const block = user(ctx);
      if (block !== undefined) return block;
    }
    const descriptor = hierarchyApi.describeChildGrid?.(ctx.rowId, ctx.row);
    if (!descriptor) return null;
    const model = childModel(descriptor, mode, options);
    return model.dataRowCount > 0 ? { model: model as ExportModel<unknown> } : null;
  };
}

function expandedOnly<Row>(detailApi: DetailFacade, user: DetailHook<Row>): DetailHook<Row> {
  return (ctx) => (detailApi.isExpanded(ctx.rowId) ? user(ctx) : null);
}

/** A headless child engine over a descriptor (local child sources are read synchronously). */
export function createChildExportEngine<Child>(descriptor: ChildGridDescriptor<Child>): DataGridEngine<Child> {
  const modules = [createDetailModule<Child>(), createHierarchyModule<Child>(), createExportModule<Child>()] as const;
  return createDataGridEngine<Child, typeof modules>({ ...(descriptor.options as DataGridOptions<Child>), modules }) as unknown as DataGridEngine<Child>;
}

function childModel<Child>(descriptor: ChildGridDescriptor<Child>, mode: ExportHierarchyMode, options: HierarchyDetailOptions): ExportModel<Child> {
  const engine = createChildExportEngine(descriptor);
  const nested = hierarchyExportDetail(engine, mode, undefined, options);
  return createExportModel(engine, { scope: 'filtered', hierarchy: mode, ...(nested ? { detail: nested } : {}) });
}
