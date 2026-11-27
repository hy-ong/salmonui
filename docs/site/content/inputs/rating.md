---
title: Rating
description: Star ratings from @salmonui/inputs/rating on native radios, with half precision, read-only quarter and exact display, clearing, labels, custom icons, a value bubble and RTL mirroring.
category: Components
order: 40
demos: [rating-basics, rating-custom, field-forms]
---

`Rating` is a star rating input. Each step is a transparent native
radio over its item, named by `localeText.item` ("3 of 5 stars"), inside a
`<fieldset role="radiogroup">` named by `label`. Keyboard, focus, form
submission and screen reader output are the browser's radio group; the
stars are CSS.

```tsx
import { Rating } from '@salmonui/inputs/rating';
import '@salmonui/inputs/rating/styles.css';

<Rating name="service" label="Service" defaultValue={3} clearable showLabel />
<Rating label="Average" readOnly precision="exact" value={4.3} />
```

<!-- demo: rating-basics -->

## Value

`value` / `defaultValue` / `onValueChange(value, details)` and `count`
(default 5). `details.reason` is `'select'`, `'clear'` or `'reset'`
(form reset), `details.source` `'pointer'`, `'touch'`, `'keyboard'` or
`'api'`. `min` (default 0) is the default value, the cleared value
and the lowest value a pick can set: choosing a lower step selects `min`.
Controlled with `value`, uncontrolled with `defaultValue` (restored by a
form reset).

## Precision

- `precision: 'full' | 'half'` while editing. Half precision
  renders two radios per item over half-width hit areas, so a click on the
  first half picks `n - 0.5` and arrow keys step by halves.
- `readOnly` with `precision: 'quarter' | 'exact'` renders one
  `role="img"` named "3.7 of 5 stars" with each item's fill clipped to the
  value. Interactive quarter or exact precision falls back to half
  with a development warning.

## Clearing, highlighting and labels

- `clearable` adds a clear button (named by `localeText.clear`, default
  "Clear rating") while the value is above `min`; clearing sets
  `min` and focuses the first radio.
- `highlightSelectedOnly` fills only the selected item.
- `showLabel` shows the value; `labelPlacement: 'top' | 'bottom' | 'start'
  | 'end'` (default `'end'`) places it and `renderLabel({ value, count })`
  formats it.

## Icons

`icon` and `emptyIcon` (`ReactNode`; default the ★ character, the empty
one in the border color) replace the glyphs; `renderItem({ index, state,
fill })` replaces both, with `state` `'full' | 'half' | 'empty'`.
The filled icon is clipped from the inline start, so the fill mirrors in
right-to-left content.

<!-- demo: rating-custom -->

## Hover and value bubble

The hover preview is pure CSS: no state, no re-render. `onHoverChange(value
| null)` reports the step under the pointer and `null` when it leaves;
pointer listeners exist only while the callback is bound.
`showTooltip` shows a small value bubble over the hovered or focused step,
`renderTooltip({ value, count })` formats it. The bubble is part of
the Rating stylesheet (the Layout Tooltip component is not required) and is
decorative: the radio's name already carries the value.

## Form submission

Give `name` to submit the value: the checked radio submits
`name=value` ("2.5" in half precision). Without `name` the radios carry
`form=""` and submit nothing. `required`, `form` and `disabled` are
forwarded.

<!-- demo: field-forms -->

## Keyboard

| Key | Action |
| --- | --- |
| Tab / Shift+Tab | Enters and leaves the rating (one tab stop) |
| Arrow Right / Arrow Up | Next step (in RTL, Arrow Left is next) |
| Arrow Left / Arrow Down | Previous step (in RTL, Arrow Right is previous) |
| Space | Selects the focused step |
| Enter or Space on the clear button | Clears to `min` |

`readOnly` keeps the radios focusable and ignores changes (`aria-readonly`).
Screen readers hear "3 of 5 stars, radio, 3 of 5" in the group named by
`label`. Try it in the [keyboard demo](/demos/inputs/inputs-keyboard).

## SSR

The items and radios are markup and the fill is CSS, so the server output
is final; the radios work and submit before hydration.

## Design notes

- quarter and exact precision are display only: an interactive
  quarter or exact value has no usable keyboard model and no native
  control. Use `precision="half"` for input and `'exact'` for read-only
  averages.
- no visibility prop: React already renders conditionally. Use
  `{show && <Rating />}` or the `hidden` attribute.
- no reset method: resetting is a value change of the owner. Call
  `setValue(min)` on a controlled `value`; users clear with `clearable`.

## API

| Prop | Type | Default |
| --- | --- | --- |
| `value`, `defaultValue` | `number` | `min` |
| `onValueChange` | `(value, { source, reason }) => void` | |
| `count` | `number` | `5` |
| `min` | `number` | `0` |
| `precision` | `'full' \| 'half' \| 'quarter' \| 'exact'` | `'full'` |
| `readOnly`, `disabled`, `required` | `boolean` | `false` |
| `clearable`, `highlightSelectedOnly`, `showLabel`, `showTooltip` | `boolean` | `false` |
| `labelPlacement` | `'top' \| 'bottom' \| 'start' \| 'end'` | `'end'` |
| `renderLabel`, `renderTooltip` | `({ value, count }) => ReactNode` | |
| `icon`, `emptyIcon` | `ReactNode` | `'★'` |
| `renderItem` | `({ index, state, fill }) => ReactNode` | |
| `onHoverChange` | `(value \| null) => void` | |
| `name`, `form` | `string` | not submitted |
| `label`, `description`, `errorMessage`, `invalid` | see [Field](/docs/inputs/field) | |
| `localeText` | `{ item, clear, validation* }` | `'{0} of {1} stars'`, `'Clear rating'` |
| `size` | `'sm' \| 'md' \| 'lg'` (item size 20, 24, 32 px) | `'md'` |
| `classNames` | `{ label, items, item, value, description, error }` | |
| `ref` | `HTMLElement` (the root) | |

Full signatures: [`@salmonui/inputs/rating` API reference](/docs/reference/inputs/rating).
