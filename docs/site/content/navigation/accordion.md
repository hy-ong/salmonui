---
title: Accordion
description: Accordion and AccordionItem stack collapsible sections with the APG accordion keyboard model, single or multiple expansion, cancellable changes, lazy panels that find-in-page can open, and nesting.
category: Accordion
order: 10
demos: [accordion-basics, accordion-nested]
---

```tsx
import { Accordion, AccordionItem } from '@salmonui/navigation/accordion';
import '@salmonui/navigation/accordion/styles.css';

<Accordion type="single" defaultValue={['shipping']}>
  <AccordionItem value="shipping" header="Shipping">
    Orders ship within two business days.
  </AccordionItem>
  <AccordionItem value="returns" header="Returns" disabled>
    Return any unused item within 30 days.
  </AccordionItem>
</Accordion>
```

`@salmonui/navigation/accordion` is self-contained: it imports no other family,
and its stylesheet needs nothing besides `@salmonui/core/styles.css`, which
every app imports once.

## Items

Each `AccordionItem` is one section: `value` is its stable key,
`header` the header content, `icon` a decorative node before the header,
`disabled` makes the header `aria-disabled` and inert, and
`hidden` renders nothing. The children are the panel content. Build items
from data with `data.map(...)`; there is no separate data-source
and template API, because JSX children already cover both:

```tsx
data.map((d) => <AccordionItem key={d.id} value={d.id} header={d.title}>{d.body}</AccordionItem>)
```

`className` and `style` reach the item; `headerProps` and `panelProps` pass
any attribute, class, style or handler to the header `<button>` and the
panel region. `ref` on `Accordion` is the root `<div>`, on
`AccordionItem` the item `<div>`.

## Expansion

`type="multiple"` (default) lets any number of
items open; `type="single"` keeps at most one. In single mode `collapsible`
(default `true`) decides whether the open item can close; with
`collapsible={false}` its header is `aria-disabled`, as the APG pattern
recommends.

`value` / `defaultValue` / `onValueChange` hold the expanded item values,
always as an array, so the type does not change with `type`.
They are item values rather than indexes, because indexes shift when items
are added.

Without `value` the accordion is uncontrolled and starts from
`defaultValue`. With `value` it is controlled: a header press only reports
the proposed array through `onValueChange`, and the panels follow the prop.

```tsx
const [open, setOpen] = useState<readonly string[]>(['shipping']);

<Accordion value={open} onValueChange={setOpen}>
  …
</Accordion>
```

`disabled` on `Accordion` disables every item at once.

## Events

`onBeforeValueChange(event)` runs before every change with `item`,
`expanded`, the proposed `value`, `previousValue` and `source`
(`'pointer' | 'keyboard' | 'touch' | 'find'`); `event.preventDefault()`
cancels it. `onValueChange(value, event)` follows with
`{ item, expanded, source }`. A header click reaches `headerProps.onClick`, which runs
first; calling `event.preventDefault()` there stops the toggle. Event objects
are created only when a handler is bound and are frozen in development.

## Lazy panels and find-in-page

A panel's content mounts the first time it expands and stays mounted
(`keepMounted`, default `true`); `keepMounted={false}` unmounts it on
collapse, and `forceMount` renders it even while collapsed, including in
server HTML. Both props also exist per item.

A mounted collapsed panel carries `hidden="until-found"`: the browser's
find-in-page searches it, and on a match (`beforematch`) the item expands
with `source: 'find'`. React writes `hidden` as a boolean, so the component
sets the attribute itself after hydration; server HTML hides collapsed
panels through `data-state="closed"`.

Opening and closing animate the panel's `block-size` to and from `auto` with
`interpolate-size: allow-keywords`, with no JavaScript measurement.
Browsers without `interpolate-size` switch instantly; under
`prefers-reduced-motion` there is no transition. The animation is
this one fixed CSS transition, with no animation settings.

## Nesting

An `Accordion` inside a panel is independent: its own value, ids and
keyboard handling. Arrow keys in the inner accordion stay inside it, and the
outer accordion skips the inner headers.

## Keyboard and ARIA

| Key | Action |
| --- | --- |
| Enter, Space | Toggle the focused item |
| ArrowDown / ArrowUp | Next / previous header (wraps) |
| Home / End | First / last header |
| Tab | Every header is a tab stop, then the open panels' content |

Each header is a `<button>` inside a heading (`headingLevel`, default 3) with
`aria-expanded`, `aria-controls` and `aria-disabled` when disabled; each
panel is `role="region"` labelled by its header. The
accordion has no built-in text, so it needs no `localeText`.

## Styling

`.salmon-accordion` (`data-type`), `.salmon-accordion-item` (`data-state`
`open` / `closed`, `data-disabled`), `.salmon-accordion-heading`,
`.salmon-accordion-trigger`, `.salmon-accordion-icon`,
`.salmon-accordion-label`, `.salmon-accordion-indicator` (the chevron, turned
when open), `.salmon-accordion-panel` and `.salmon-accordion-content`. Colors
come from the theme; the CSS uses logical properties, so it follows `dir`.

## Server rendering

The accordion renders on the server with no browser API in render: expanded
panels carry their content, collapsed ones are hidden through
`data-state="closed"` and have no content unless `forceMount` is set, and
hydration reports no warnings. `hidden="until-found"` is added only
after hydration.

## Not included

Imperative methods for adding, removing, enabling, hiding, expanding or
selecting items are not offered: in React the item list belongs to
the application, and methods that mutate an internal copy let the UI and the
application state disagree. Add or remove `AccordionItem` children, set
`disabled` or `hidden` on them, and put an item's `value` into the `value`
array to expand it; focus a header with its DOM `focus()`.

## API reference

[`@salmonui/navigation/accordion`](/docs/reference/navigation/accordion): `Accordion`,
`AccordionItem` and their prop and event types.
