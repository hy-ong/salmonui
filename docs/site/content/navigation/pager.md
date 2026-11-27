---
title: Pager
description: The standalone Pager from @salmonui/navigation/pager - the Data Grid pager's page sets, keys, page sizes and narrow layout for any paged list, controlled by page and pageSize.
category: Pager
order: 120
demos: [pager-basics, pager-router]
---

```tsx
import { Pager } from '@salmonui/navigation/pager';
import '@salmonui/navigation/pager/styles.css';

const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState(20);

<Pager
  page={page}
  onPageChange={(e) => setPage(e.page)}
  totalCount={1234}
  pageSize={pageSize}
  pageSizeOptions={[20, 50, 100]}
  onPageSizeChange={(e) => setPageSize(e.pageSize)}
/>
```

`Pager` is the Data Grid pager published for any paged list: first,
previous, numeric, next and last buttons, `…` buttons for the previous and
next page sets, an optional page size control and the
"1 of 10 pages (100 items)" info. It does not import the Data Grid or its
engine: the page count is `ceil(totalCount / pageSize)`. The page-set math is
the Data Grid pager's, so both pagers show the same buttons. `ref` is the `<nav>` element; `className`, `style`,
`id` and other DOM props reach it.

## Page and page size

`page` is 1-based. Pass `page` and `onPageChange` to control it, or
`defaultPage` for an uncontrolled pager. `pageSize` / `defaultPageSize` /
`onPageSizeChange` work the same way; the default size is 12. The rendered page is clamped into `1..pageCount`, so a
stale `page` after the total shrinks shows the last page.

`buttonCount` (default 8) is the number of numeric buttons at a time.
Buttons come in sets: on page 20 with 8 buttons the pager shows
17 to 24, and the `…` buttons jump to page 16 and page 25.

`size="sm"` makes 24 px buttons for a dense footer (the default `'md'`
follows the theme's control height), and `variant="outline"` marks the
current page with a primary border on a tinted fill instead of the solid
primary button. Both write `data-size` / `data-variant` on `.salmon-pager`
only when set; their metrics and colors are inline custom properties and
styles, so pages without them load no extra CSS.

```tsx
<Pager size="sm" variant="outline" totalCount={96} pageSize={25} showInfo={false} />
```

`pageSizeOptions` adds the page size control: `true` offers
All, 5, 10, 12 and 20 (the Data Grid defaults), an array offers
its own values, and `'all'` makes one page of every item. A `pageSize`
outside the options is still shown as the selected value.

## Events

Every user change has a cancellable before-event and an after-event.
Event objects are frozen and allocated only when a
handler is bound.

| Event | Payload |
| --- | --- |
| `onBeforePageChange` | `{ page, previousPage, source, reason }`; `preventDefault()` keeps the page |
| `onPageChange` | `{ page, previousPage, source, reason }` |
| `onBeforePageSizeChange` | `{ pageSize, previousPageSize, page, previousPage, source }`; `preventDefault()` keeps the size and the page |
| `onPageSizeChange` | `{ pageSize, previousPageSize, page, previousPage, source }` |

`source` is `'pointer'`, `'keyboard'`, `'touch'` or `'api'` (calls of the
render context's `goToPage` and `setPageSize`). A page size change keeps the
first item of the current page in view and clamps the page to the new page
count (the Data Grid rule): page 3 of size 10 becomes page 2 of
size 20. When the page moves that way, `onPageChange` follows
`onPageSizeChange` with `reason: 'pageSize'`, so a controlled app updates
both values from the two after-events; no `onBeforePageChange` fires for
the clamp. Setting the `page` or `pageSize` prop fires no events.

## Unknown totals

`totalCount={null}` pages a list whose size is not known yet, such as a
cursor-paged API (*Salmon*). Pass `hasNextPage` while a next page
exists: Next stays enabled, the numeric buttons end at the next page, the
Last button is not rendered, and the info reads "Page 3".

```tsx
<Pager page={page} onPageChange={(e) => setPage(e.page)} totalCount={null} hasNextPage={!!cursor} />
```

## Info and templates

`showInfo` (default `true`) shows "3 of 10 pages (100 items)".
`renderInfo(ctx)` replaces that text, and `children` render after it as an
extra message.

`renderPager(ctx)` replaces everything inside the `<nav>`. The
context is the Data Grid one: `page`, `pageSize`, `pageCount`
(`null` for an unknown total), `totalCount`, `hasNextPage`, `goToPage(n)`,
`setPageSize(n | 'all')`, plus `defaultPager`, the built-in content, which
you can wrap.

```tsx
<Pager
  totalCount={total}
  pageSize={20}
  renderPager={(ctx) => (
    <button type="button" disabled={!ctx.hasNextPage} onClick={() => ctx.goToPage(ctx.page + 1)}>
      Load more
    </button>
  )}
/>
```

### Page size control

The built-in control is a native `<select>` labelled by
`localeText.pageSize`. It keeps the Pager within its 3.5 KB budget; the
Dropdowns `Select` would add about 11 KB. To use `Select` or any other
control, pass `renderPageSize(ctx)`. The context has `value` (`number` or
`'all'`), `options` (`{ value, label }[]`), `label` and `setPageSize`.

```tsx
import { Select } from '@salmonui/dropdowns/select';

<Pager
  totalCount={total}
  pageSizeOptions={[10, 20, 50]}
  renderPageSize={(ctx) => (
    <Select
      aria-label={ctx.label}
      value={ctx.value}
      onValueChange={(value) => value !== null && ctx.setPageSize(value as number | 'all')}
      data={ctx.options}
    />
  )}
/>
```

## Text and icons

`localeText` takes any subset of the strings; the English defaults are
exported as `PAGER_DEFAULT_LOCALE_TEXT`. Messages use the Data Grid
format: `{param}` templates and plural forms chosen with `locale`; numbers
use the locale's number format ("(1,000 items)").

| Key | Default |
| --- | --- |
| `label` | `Pagination` (the landmark name; an `aria-label` prop wins) |
| `firstPage`, `previousPage`, `nextPage`, `lastPage` | `First page`, `Previous page`, `Next page`, `Last page` |
| `previousPages`, `nextPages` | `Previous pages`, `Next pages` (the `…` buttons) |
| `pageButton` | `Page {page}` (name of a numeric button) |
| `pageLabel` | empty; visible text before each page number |
| `pagerInfo` | `{page} of {pageCount} pages` |
| `pagerInfoUnknown` | `Page {page}` |
| `pagerItems` | `(1 item)` / `({count} items)` |
| `pageSize`, `allItems` | `Items per page`, `All` |

`icons` (`first`, `previous`, `next`, `last`) replaces the built-in icons
with your nodes. The built-in icons are CSS masks in the text color and
are mirrored under `dir="rtl"`; your nodes are not.

## Keyboard and accessibility

The pager is a `<nav>` landmark named by `localeText.label`, the current
page button has `aria-current="page"`, and every button has a name; the
first, previous, next and last buttons use `aria-disabled` at the ends so
keyboard users keep their place. Tab moves between the controls.
With focus on a pager button, the Data Grid pager keys apply:

| Key | Action |
| --- | --- |
| ArrowLeft, PageUp | Previous page |
| ArrowRight, PageDown | Next page |
| Home, Ctrl+Alt+PageUp | First page |
| End, Ctrl+Alt+PageDown | Last page |
| Enter, Space | Press the focused button |

After a key changes the page, focus moves to the new current page button.
Under `dir="rtl"`, ArrowLeft moves forward and ArrowRight back; PageUp and
PageDown keep their meaning. Keys pressed on the page size control do not
change the page.

## Narrow widths

The pager is a size container. Below 480 px of its own width it hides the
other page numbers, the `…` buttons and the item count, and keeps
first, previous, the current page, next, last and the page info (the Data Grid layout). Put it in a block that has a width: an
inline-size container does not size itself from its content.

## Router-driven Pager

The standalone Pager does not write the URL itself: a pager that
writes the URL competes with the application's router and would render
differently on the server. Leave it to your router: read the page from the
URL, pass it as `page`, and navigate in `onPageChange`. The Data Grid keeps
its own `paging.syncUrl` because the grid owns its paging state.

```tsx
// Next.js App Router
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pager } from '@salmonui/navigation/pager';

export function ArticlePager({ total }: { total: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  return (
    <Pager
      page={page}
      pageSize={10}
      totalCount={total}
      onPageChange={(e) => {
        const next = new URLSearchParams(params);
        next.set('page', String(e.page));
        router.push(`?${next}`);
      }}
    />
  );
}
```

Because `page` is a prop, the server renders the page from the URL and the
client hydrates the same markup. The demo below does the same with
`history.pushState`, so Back restores the previous page.

## Server rendering

The pager reads no layout in render: the page set, the info and the
disabled ends follow from the props, so the server markup hydrates without
warnings. The narrow layout is a CSS container query, not a
measurement.

## Design notes

- The Pager has no methods: the page is a prop, and templates are
  React elements that need no manual cleanup or refresh. To change the page,
  set `page` (or call `ctx.goToPage(n)` inside `renderPager`).
- The URL is not written by the Pager; bind `page` to the router's
  search params as in [Router-driven Pager](#router-driven-pager).
- The info text and the extra message are plain props:
  `showInfo`, `renderInfo` and `children`; there is nothing to register.

## API reference

[`@salmonui/navigation/pager`](/docs/reference/navigation/pager): `Pager`,
`PAGER_DEFAULT_LOCALE_TEXT` and the event, context, icon and locale types.
