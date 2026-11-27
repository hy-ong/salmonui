// Search wiring of the `search` render feature (feature-search.ts): module
// registration and the engine options of an enabled search (the initial
// `search.text` filters the server snapshot). Reached only through the
// feature, so a grid without `search` never loads it or core `search.ts`.
// The search events and the reactive
// `search` options stay in query-config.ts (they dispatch commands and need
// no search code).

import { createSearchModule, type DataGridModule } from '@salmonui/data-grid/engine';
import type { NormalizedProps } from './features/types.js';
import { defined, searchOf } from './query-config.js';

/** The core `search` module when the prop is set and the app passes none. */
export function searchModules(props: NormalizedProps, modules: readonly DataGridModule<unknown>[]): readonly DataGridModule<unknown>[] {
  if (!props.search || modules.some((m) => m.name === 'search')) return [];
  return [createSearchModule<unknown>() as unknown as DataGridModule<unknown>];
}

/** Engine options of an enabled search (`search: false` keeps its static `{ enabled: false }` in query-config.ts). */
export function searchEngineOptions(props: NormalizedProps): Record<string, unknown> {
  const q = searchOf(props);
  if (!q) return {};
  return {
    search: defined({
      enabled: true,
      fields: q.fields?.length ? [...q.fields] : undefined,
      operator: q.operator,
      ignoreCase: q.matchCase === undefined ? undefined : !q.matchCase,
      ignoreAccent: q.ignoreAccents,
      key: q.text,
    }),
  };
}
