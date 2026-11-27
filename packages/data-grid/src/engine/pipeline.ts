import type {
  CompiledColumn,
  ModuleContext,
  DataGridModule,
  PerformedStage,
  PipelineStage,
  PipelineStageName,
  RowModelSnapshot,
} from './types.js';

/**
 * Fixed stage ranks of the query pipeline. The viewport range is not a row-model stage; it is computed from
 * the final model.
 */
export const PIPELINE_STAGE_RANKS: Readonly<Record<PipelineStageName, number>> = Object.freeze({
  search: 100,
  filter: 200,
  sort: 300,
  pin: 350,
  group: 400,
  aggregate: 500,
  groupExpansion: 600,
  infinite: 650,
  treeExpansion: 700,
  detailExpansion: 800,
  page: 900,
  pinnedRows: 950,
  frozenSplit: 1000,
});

export const ALL_PERFORMED: readonly PerformedStage[] = Object.freeze(['search', 'filter', 'sort', 'group', 'aggregate', 'page']);

export interface RegisteredStage<Row> {
  readonly module: DataGridModule<Row, unknown, never>;
  readonly stage: PipelineStage<Row, unknown>;
  readonly rank: number;
  memo: { input: RowModelSnapshot<Row>; leaves: readonly CompiledColumn<Row>[]; key: readonly unknown[]; output: RowModelSnapshot<Row> } | null;
}

/** Collects module stages in rank order. Throws on unknown names and rank collisions. */
export function collectStages<Row>(modules: readonly DataGridModule<Row, unknown, never>[]): RegisteredStage<Row>[] {
  const stages: RegisteredStage<Row>[] = [];
  const byRank = new Map<number, string>();
  for (const module of modules) {
    for (const stage of module.pipeline ?? []) {
      const rank = (PIPELINE_STAGE_RANKS as Record<string, number | undefined>)[stage.name];
      if (rank === undefined) {
        throw new Error(`Module "${module.name}" declares unknown pipeline stage "${String(stage.name)}".`);
      }
      const owner = byRank.get(rank);
      if (owner !== undefined) {
        throw new Error(`Pipeline stage "${stage.name}" (rank ${rank}) is declared by both "${owner}" and "${module.name}".`);
      }
      byRank.set(rank, module.name);
      stages.push({ module, stage, rank, memo: null });
    }
  }
  stages.sort((a, b) => a.rank - b.rank);
  return stages;
}

/** Helper for stage authors: a model over the same source with a new visible order (source indices). */
export function createRowModel<Row>(input: RowModelSnapshot<Row>, order: Int32Array): RowModelSnapshot<Row> {
  if (input.groups || input.aggregates) {
    return Object.freeze({ source: input.source, sourceIds: input.sourceIds, order, count: order.length, groups: input.groups ?? null, aggregates: input.aggregates ?? null });
  }
  return Object.freeze({ source: input.source, sourceIds: input.sourceIds, order, count: order.length });
}

/** Source index of the row at a visible index, or -1 (also for synthetic rows such as group captions). */
export function getSourceIndex<Row>(model: RowModelSnapshot<Row>, visibleIndex: number): number {
  if (visibleIndex < 0 || visibleIndex >= model.count) return -1;
  if (model.view) return model.view.sourceIndexAt(visibleIndex);
  return model.order === null ? visibleIndex : (model.order[visibleIndex] ?? -1);
}

/** Number of data rows a model covers (excludes synthetic rows of a view). */
export function dataRowCount<Row>(model: RowModelSnapshot<Row>): number {
  return model.view ? model.view.dataCount : model.count;
}

/**
 * @internal Filter and search changes return to the first page.
 * Expressed as a `paging.goToPage` command so the paging slice is
 * only changed by its own module.
 */
export function requestFirstPage<Row>(ctx: ModuleContext<Row>): void {
  const paging = ctx.getModuleState<{ readonly page?: unknown }>('paging');
  if (paging && typeof paging.page === 'number' && paging.page !== 1) ctx.dispatch({ type: 'paging.goToPage', page: 1 });
}
