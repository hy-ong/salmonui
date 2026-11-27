'use client';
import { useEffect, useState } from 'react';
import { Pager } from '@salmonui/navigation/pager';

// A router-driven Pager without a router library: the page lives in the
// `?p=` query parameter. A real app reads it from its router (Next.js
// `useSearchParams`, React Router `useSearchParams`) the same way.
const PARAM = 'p';

function readPage(): number {
  const value = Number(new URLSearchParams(window.location.search).get(PARAM));
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

export default function PagerRouterDemo() {
  // The server and the first client render use page 1; the URL is read after mount.
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(readPage());
    const onPop = (): void => setPage(readPage());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return (
    <div>
      <Pager
        aria-label="Article pages"
        page={page}
        pageSize={10}
        totalCount={95}
        renderInfo={(ctx) => `Articles ${(ctx.page - 1) * ctx.pageSize + 1}–${Math.min(ctx.totalCount ?? 0, ctx.page * ctx.pageSize)} of ${ctx.totalCount}`}
        onPageChange={(e) => {
          const url = new URL(window.location.href);
          if (e.page > 1) url.searchParams.set(PARAM, String(e.page));
          else url.searchParams.delete(PARAM);
          window.history.pushState(window.history.state, '', url);
          setPage(e.page);
        }}
      />
      <p>Page {page}: the browser Back button returns to the previous page.</p>
    </div>
  );
}
