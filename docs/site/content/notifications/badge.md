---
title: Badge
description: A server-component label for statuses and counts that also overlays a count or dot on any element, with logical placement, a locale-aware max and a hidden label for assistive technology.
category: Components
order: 20
demos: [badge-basic, badge-status]
---

```tsx
import { Badge } from '@salmonui/notifications/badge';
import '@salmonui/notifications/badge/styles.css';

<Badge tone="success">Paid</Badge>;
<Badge content={unread} max={99} label={`${unread} unread`}>
  <Button>Inbox</Button>
</Badge>;
```

`Badge` is a server component: the entry has no `"use client"` directive, no
hooks and no client JavaScript, so a React Server Component renders it
directly. It has two modes, chosen by its props:

- **Inline** (no `content`, no `dot`): `children` is the badge text, rendered
  in a `<span class="salmon-badge">`. Use it inside any content: a table cell,
  a list item, a button label.
- **Overlay** (`content` or `dot` given): `children` is the host element and
  the badge sits on one of its corners. The host wrapper
  (`.salmon-badge-host`) is `display: inline-grid`, so it adds no layout
  around the host.

## Tones, variants and shapes

- `tone`: `'neutral'` (default), `'primary'`, `'info'`, `'success'`,
  `'warning'`, `'danger'`. The five non-neutral tones are the theme
  seeds. There are no `secondary`, `light` or `dark` tones, because they are
  not semantic colors: use `tone="neutral"` with `variant="outline"`,
  `"soft"` or `"solid"`.
- `variant`: `'soft'` (default inline), `'solid'` (default in overlay mode),
  `'outline'`, and `'dot'` for an inline status (see
  [Status dots](#status-dots)).
- `shape`: `'rounded'` (default inline), `'pill'` (default in overlay mode),
  `'circle'` for a single character or digit.

A tag in regular weight (a channel or category label rather than a count)
sets the `--salmon-badge-font-weight` custom property, read by every
variant: `style={{ '--salmon-badge-font-weight': 400 }}` or a class that
sets it. Unset, badges keep the semibold default.

Every choice is a `data-*` styling hook on `.salmon-badge` (`data-tone`,
`data-variant`, `data-shape`, `data-dot`). To keep the subpath small a hook is
written only when its prop is set; the stylesheet applies the defaults when it
is absent. `className`, `style`, `ref` and every other DOM prop go to the root:
the badge inline, the host wrapper in overlay mode.

<!-- demo: badge-basic -->

## Status dots

`variant="dot"` turns an inline badge into a status label: a 6px dot in
the tone color before plain text, the look of an order status in a table
cell.

```tsx
<Badge variant="dot" tone="success">Shipped</Badge>
<Badge variant="dot" tone="danger">Payment failed</Badge>
```

- The dot is decorative: it is an empty `::before` pseudo-element, which
  assistive technology skips, so the text alone carries the meaning. Never
  rely on the color alone; write the status as text.
- The text inherits the color, font and size of its surroundings (no chip
  background, border or padding), so it lines up with the other cells.
- `tone` picks the dot color from the theme (`neutral` is the secondary
  text color); dark mode follows the theme variables, and in forced-colors
  mode the dot is `CanvasText`.
- The dot sits at the inline start and moves to the right under
  `dir="rtl"`. `shape` does not apply. `variant="dot"` is inline only; an
  overlay dot on a host is the `dot` prop below.

<!-- demo: badge-status -->

## Counts and dots

`content` is the count or a short text. A number renders with locale digits
(`locale`, default `'en-US'` so server and client agree) and, above `max`, as
`` `${max}+` ``: `content={120} max={99}` shows `99+`. `content` of
`null`, `undefined`, `false` or `''` hides the badge; `0` shows.

`dot` renders a small dot without text. A dot carries no visible
text, so its props type requires `label`:

```tsx
<Badge dot label="Online" tone="success" overlap="circular" placement="bottomEnd">
  <Avatar name="Ada Lovelace" />
</Badge>
```

The requirement is enforced by the types, not by a runtime warning: the
component is a server component without effects, and a render-time warning
would run on every server render.

## Placement and overlap

`placement` is logical: `'topEnd'` (default), `'topStart'`, `'bottomEnd'`,
`'bottomStart'`. The badge is centered on that corner of the host
with logical insets, so in a `dir="rtl"` container `'topEnd'` is the top-left
corner. `overlap="circular"` pulls the badge 14% inward so it sits on the edge
of a round host such as an avatar; the default `'rectangular'` uses the box
corner.

## Links

`render` renders the inline badge as another element, following the
`render` prop convention of the other components: it receives every computed
prop (class, `data-*` hooks, `style`, `ref`, `children`) and returns the
element, which must spread them.

```tsx
<Badge tone="info" render={(props) => <a {...props} href="/changelog" />}>New</Badge>
```

## Accessibility

- An inline badge is text and is read in place.
- An overlay count is read as its text by default. `label` replaces it for
  assistive technology: the visible count becomes `aria-hidden` and the label
  renders in a visually hidden span (`.salmon-visually-hidden`), for example
  `label="5 unread messages"`.
- `invisible` hides the badge and its label; the host does not move, because
  the overlay is absolutely positioned.
- In forced-colors mode the badge keeps a system-color border.

API reference: [`@salmonui/notifications/badge`](/docs/reference/notifications/badge).
