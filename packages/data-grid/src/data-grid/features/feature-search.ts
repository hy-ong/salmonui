// `search` render feature: the core search
// module, the initial search-filtered rows (engine options) and the search
// highlight. Imported only by the registries and the public
// features entry.

import { createSearchHighlighter } from '../search-highlight.js';
import { searchEngineOptions, searchModules } from '../search-ui.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

export const search: DataGridFeature = Object.freeze({
  name: 'search',
  hub: () => DataGrid,
  modules: (props, ctx) => searchModules(props, ctx.modules),
  engineOptions: (props) => searchEngineOptions(props),
  selectors: Object.freeze({ searchHighlighter: createSearchHighlighter }),
} satisfies DataGridFeature);
