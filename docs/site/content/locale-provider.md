---
title: Locale provider
description: Localize every Salmon UI component at once with LocaleProvider and the built-in Traditional Chinese pack, override single strings, nest providers, and add your own locale pack.
category: Globalization and Localization
order: 117
demos: [locale-zh-tw]
---

Every Salmon UI component takes its visible and assistive text from a
`localeText` prop over built-in English, and its dates, numbers and plural
rules from a `locale` prop. `LocaleProvider` sets both for a whole subtree,
so an application localizes once instead of on every instance. It works
for every category, not only the Data Grid: pagers, pickers, dropdowns,
form validation messages, dialogs, toasts and the rest read the same
provider.

## Setup

Wrap the application (or the part of it to localize) in the provider and
pass a locale pack:

```tsx
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';

export function App() {
  return (
    <LocaleProvider locale="zh-TW" localeText={zhTW}>
      <OrdersPage />
    </LocaleProvider>
  );
}
```

`LocaleProvider` renders no element. It takes two props, both optional:

| Prop | Type | Meaning |
| --- | --- | --- |
| `locale` | `string` | BCP 47 locale for every `Intl` format, plural rule and collation below it (dates, numbers, currency, month and weekday names, first day of the week) |
| `localeText` | `LocaleCatalog` | Text per component family: `{ pager: {...}, dataGrid: {...}, datePicker: {...}, ... }`, each entry with the keys of that component's `localeText` prop |

Without a provider every component shows its built-in English text and
uses its own `locale` prop; an application that never renders a provider
pays only a context read per component and imports no pack.

<!-- demo: locale-zh-tw -->

## The zh-TW pack

`@salmonui/core/locale/zh-TW` is the built-in Traditional Chinese (Taiwan)
pack. It is plain data with no React import, so it loads on the server and
in the browser alike. It exports:

- `zhTW`: the whole catalog, every component family.
- One named export per family (`pager`, `dataGrid`, `datePicker`,
  `select`, `textField`, `validation`, `dialog`, `tabs`, `breadcrumbs`,
  ...), the same objects `zhTW` holds.
- `locale`: the string `'zh-TW'`.

The family names are the component names in camelCase. Two families are
shared: `validation` holds the field validation messages every input uses
(`validationRequired`, ...), and `dialog` names the dialog close button.

### Whole catalog or per family

`zhTW` is the simplest choice and covers every component, including ones
added later. An application that renders only a few families can import
just those and let the bundler drop the rest:

```tsx
import { LocaleProvider } from '@salmonui/core/locale';
import { dataGrid, datePicker, locale, pager, select, validation } from '@salmonui/core/locale/zh-TW';

const text = { dataGrid, datePicker, pager, select, validation };

<LocaleProvider locale={locale} localeText={text}>
  <OrdersPage />
</LocaleProvider>;
```

Keep the catalog object stable: define it at module level (or memoize it)
rather than building a new object on every render, so components that
compile their text once per catalog do not recompute.

## Overriding single strings

A pack is a frozen object; spread it to change a few keys and keep the
rest:

```tsx
import { zhTW } from '@salmonui/core/locale/zh-TW';

const text = {
  ...zhTW,
  pager: { ...zhTW.pager, pageSize: '每頁顯示' },
  validation: { ...zhTW.validation, validationRequired: '必填' },
};

<LocaleProvider locale="zh-TW" localeText={text}>…</LocaleProvider>;
```

Message syntax is the same as on each component's `localeText` prop:
`{param}` placeholders and, where a component documents them, plural forms
(`one`, `other`, ...) chosen for the provider's `locale`. The recurrence
summary messages (`recurrenceEditor`) also use their `one` form for an
interval or count of exactly 1 in every language, so a language with a
single plural category can still word it: the zh-TW summary reads 「每週」
for an interval of 1 and 「每 2 週」 for 2. A few families
take functions for text that is built from a value, such as TagGroup's
`remove(label)`, ColorPicker's `colorName(color)` and `hueName(hue)`, the
dialog's `resizeEdge(edge)` and Gauge's `pointer(gauge, n)`; override them
with a function too.

Badge, Progress, Spinner and Avatar are safe to render as Server
Components, so they read no context: set their own `locale` and
`localeText` props (AvatarGroup's `more(count)`). Charts have no
`localeText` prop; the provider's `chart`, `bulletChart`, `stockChart`,
`rangeSelector`, `heatMap`, `treeMap`, `sankeyChart`, `pieChart`,
`funnelChart`, `gauge` and `geoMap` entries fill their `text` prop
(`stockText` on StockChart): chart names and role descriptions, legend,
toolbar and breadcrumb names. The automatic chart summary sentences stay
English; pass `description` to replace them.

## Precedence

From strongest to weakest, for each key:

1. The component's own `localeText` prop.
2. The nearest `LocaleProvider` whose catalog has that family and key.
3. Outer providers, in order.
4. The component's built-in English text.

`locale` follows the same order: a component's own `locale` prop wins over
the nearest provider's. So a single instance can still differ from the
rest of the page:

```tsx
<LocaleProvider locale="zh-TW" localeText={zhTW}>
  {/* Every pager reads 「每頁筆數」, this one reads 「每頁訂單」. */}
  <Pager totalCount={480} pageSizeOptions localeText={{ pageSize: '每頁訂單' }} />
  {/* Dates in this picker are formatted for Japan; its strings stay zh-TW. */}
  <DatePicker label="出貨日" locale="ja-JP" />
</LocaleProvider>
```

## Nesting

Providers nest. An inner provider merges over the outer one per family,
key by key, so it only has to name what changes:

```tsx
<LocaleProvider locale="zh-TW" localeText={zhTW}>
  <AppShell>
    {/* Same strings, Hong Kong formats. */}
    <LocaleProvider locale="zh-HK">
      <Reports />
    </LocaleProvider>
    {/* One family changed for this panel only. */}
    <LocaleProvider localeText={{ pager: { pageSize: '每頁顯示' } }}>
      <AuditLog />
    </LocaleProvider>
  </AppShell>
</LocaleProvider>
```

An inner provider without `locale` keeps the outer one's.

## Dates and numbers

The provider's `locale` drives every `Intl` formatter below it: column
formats of the Data Grid (`C0`, `N2`, `yMMMd`, ...), number fields, the
date and time pickers (field order, month and weekday names, first day of
the week), plural rules and sorting. Currency and time zone are not part of
the locale; pass them on the components that format money or instants
(`currency="TWD"`, `timeZone="Asia/Taipei"`). Pass a `timeZone` for
server rendering so the server and the browser format instants the same
way (see [Values, time zones and globalization](/docs/calendars/dates)).

`useLocale()` returns the nearest provider's `locale` (or `undefined`
outside one), for application code that formats its own text:

```tsx
import { useLocale } from '@salmonui/core/locale';

function Total({ value }: { value: number }) {
  const locale = useLocale() ?? 'en-US';
  return <span>{new Intl.NumberFormat(locale, { style: 'currency', currency: 'TWD' }).format(value)}</span>;
}
```

The provider does not set the text direction or the document language: set
`lang` (and `dir` for right-to-left locales) on `<html>` or on a container
(see [Right-to-left](/docs/data-grid/rtl)).

## Next.js App Router

`LocaleProvider` is a Client Component, and the packs contain a few
functions (TagGroup's `remove(label)`, ColorPicker's `colorName(color)`), which
cannot be passed from a Server Component to a Client Component. Put the
provider and the pack in a small client wrapper and render it from the
root layout:

```tsx
// app/providers.tsx
'use client';

import type { ReactNode } from 'react';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider locale="zh-TW" localeText={zhTW}>
      {children}
    </LocaleProvider>
  );
}
```

```tsx
// app/layout.tsx (a Server Component)
import type { ReactNode } from 'react';
import { Providers } from './providers';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Pages and layouts below stay Server Components; every Salmon UI client
component they render reads the provider, including components passed
through Server Components as children. React context does not reach a
component that itself renders as a Server Component, so such a component
takes its text from its own `localeText` prop.

## Server rendering

The provider is plain React context with no effect and no browser read, so
server rendering (Next.js, Vite SSR, streaming) produces the localized
markup directly and hydration matches it: there is no English flash and no
hydration warning. Render the same `locale` and catalog on the server and
in the browser; a locale chosen per request (from a cookie or the
`Accept-Language` header) must reach the client as a prop, not be read
from `navigator.language` during render.

## Adding a locale pack

A pack is an object with the same families and keys as `zhTW`:

1. Copy the `zh-TW` pack and translate every value. Keep the keys exactly;
   keep `{param}` placeholders, plural forms and function signatures.
2. Pass it to the provider: `<LocaleProvider locale="ja-JP" localeText={jaJP}>`.

A partial pack is fine too: a family or key it leaves out falls back to
English. Type it as `LocaleCatalog` (from `@salmonui/core/locale`) and give
each family the type of its component's `localeText` prop
(`DataGridLocaleText`, ...) to have TypeScript check the keys.

Packs shipped with Salmon UI live under `packages/core/src/locale/<tag>/`
and are checked by a coverage test
(`tooling/checks/tests/locale-coverage.test.mjs`): it finds every family the
components read and fails when a pack misses a family or a key, or has a key
the English defaults do not. A new component string therefore cannot ship
untranslated. To contribute a pack, add `packages/core/src/locale/<tag>.ts`
with its per-package files, export it as the `@salmonui/core/locale/<tag>`
subpath and list it in the test's packs, which then checks it like
`zh-TW`.

## Data Grid strings

The Data Grid's own catalog (`dataGrid` in a pack) has the same keys as
its `localeText` prop; see [Localization](/docs/data-grid/localization) for
the message format, number and date formats and the date editors.

## API reference

See [`LocaleProvider`](/docs/reference/core/locale/LocaleProvider),
[`useLocale`](/docs/reference/core/locale/useLocale) and
[`zhTW`](/docs/reference/core/locale-zh-TW/zhTW) in the API reference.
