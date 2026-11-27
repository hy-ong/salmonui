// `paging` render feature: the core paging
// module, the pager, the pager keys and the `paging.syncUrl` binding.
// Imported only by the registries and the public features entry.

import { DataGridPager, DataGridPagerPropsContext, type DataGridPagerProps } from '../Pager.js';
import { createPagingUi, pagingEngineOptions, pagingModules } from '../paging-ui.js';
import { DataGrid } from '../DataGrid.js';
import type { DataGridFeature } from './types.js';

function PagerPart({ pagerProps }: { readonly pagerProps: DataGridPagerProps }) {
  return (
    <DataGridPagerPropsContext value={pagerProps}>
      <DataGridPager />
    </DataGridPagerPropsContext>
  );
}

export const paging: DataGridFeature = Object.freeze({
  name: 'paging',
  hub: () => DataGrid,
  modules: (props, ctx) => pagingModules(props, ctx.modules),
  engineOptions: (props) => pagingEngineOptions(props),
  createUi: createPagingUi,
  parts: Object.freeze({ Pager: PagerPart }),
} satisfies DataGridFeature);
