// `@salmonui/pivot-table/engine`:
// the framework-agnostic pivot engine. Not reachable from any Data Grid
// entry, so no Data Grid bundle carries pivot code.
export * from './types.js';
export { DEFAULT_PIVOT_MODEL, normalizePivotModel, stableStringifyModel } from './model.js';
export { parseCsv, type ParseCsvOptions } from './csv.js';
export { compileFormula, PivotFormulaError, type CompiledFormula, type PivotFormulaReference } from './formula.js';
export {
  computePivot,
  createPivotEngine,
  createPivotJob,
  matchesValueOperator,
  measureId,
  type PivotEngine,
  type PivotEngineOptions,
  type PivotEngineText,
  type PivotJob,
  type PivotModelError,
  type PivotDiagnostics,
} from './engine.js';
export { createPivotWorkerEngine, PivotWorkerError, type AsyncPivotEngine, type PivotWorkerEngineOptions } from './worker-host.js';
export {
  headersIn,
  plainHeader,
  windowOf,
  type PivotSummary,
  type PivotWindow,
  type PivotWindowRequest,
  type PivotWorkerRequest,
  type PivotWorkerResponse,
  type WorkerLike,
  type WorkerScopeLike,
} from './worker-protocol.js';
