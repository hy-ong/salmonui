'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Pager } from '@salmonui/navigation/pager';

const TOTAL = 1234;
// Section headings stay below the demo title in the type hierarchy.
const H3 = { margin: '24px 0 8px', fontSize: 'var(--salmon-font-size-md)' } as const;

export default function PagerBasicsDemo() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [last, setLast] = useState('nothing yet');
  const first = (page - 1) * pageSize + 1;
  return (
    <div>
      <Pager
        page={page}
        pageSize={pageSize}
        totalCount={TOTAL}
        pageSizeOptions={[10, 20, 50, 100, 'all']}
        onBeforePageChange={(e) => {
          // A cancellable before-event: page 13 is skipped.
          if (e.page === 13) {
            e.preventDefault();
            setLast(`page 13 cancelled (${e.source})`);
          }
        }}
        onPageChange={(e) => {
          setPage(e.page);
          setLast(`page ${e.previousPage} → ${e.page} (${e.source}${e.reason === 'pageSize' ? ', after a page size change' : ''})`);
        }}
        onPageSizeChange={(e) => setPageSize(e.pageSize)}
      />
      <p className="demo-status">
        Showing items {first}–{Math.min(TOTAL, page * pageSize)} of {TOTAL}. Last change: {last}.
      </p>
      <h3 style={H3}>Uncontrolled, five buttons, a page label</h3>
      <Pager aria-label="Uncontrolled pages" totalCount={500} defaultPage={7} buttonCount={5} pageSizeOptions localeText={{ pageLabel: 'p.' }} />
      <h3 style={H3}>Small buttons, outlined current page</h3>
      <Pager aria-label="Compact pages" size="sm" variant="outline" totalCount={96} pageSize={25} showInfo={false} />
      <h3 style={H3}>Unknown total</h3>
      <UnknownTotal />
      <h3 style={H3}>Narrow container, German text</h3>
      <div style={{ maxWidth: 360, border: '1px dashed var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-md)' }}>
        <Pager
          totalCount={500}
          defaultPage={10}
          localeText={{ label: 'Seiten', firstPage: 'Erste Seite', previousPage: 'Vorherige Seite', nextPage: 'Nächste Seite', lastPage: 'Letzte Seite', pageButton: 'Seite {page}', pagerInfo: '{page} von {pageCount}' }}
        />
      </div>
      <h3 style={H3}>Custom template</h3>
      <Pager
        aria-label="Load more"
        totalCount={60}
        pageSize={20}
        renderPager={(ctx) => (
          <Button variant="outline" disabled={!ctx.hasNextPage} onClick={() => ctx.goToPage(ctx.page + 1)}>
            Load page {ctx.page + 1} of {ctx.pageCount}
          </Button>
        )}
      />
    </div>
  );
}

function UnknownTotal() {
  const [page, setPage] = useState(1);
  return <Pager aria-label="Feed pages" page={page} totalCount={null} hasNextPage={page < 6} onPageChange={(e) => setPage(e.page)} />;
}
