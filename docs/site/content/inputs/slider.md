---
title: Slider
description: Single and range sliders from @salmonui/inputs/slider on visually hidden native range inputs, with ticks, value labels, limits, discrete values, vertical orientation, RTL mirroring and zero React renders while dragging.
category: Components
order: 42
demos: [slider-basics, slider-limits, inputs-performance, field-forms]
---

`Slider` picks a single value or a range. Every thumb is a visually hidden native `<input type="range">`
positioned on its visual thumb: keyboard focus, `aria-valuetext`, form
submission and screen reader output come from the native input; the track,
fill and thumbs are CSS placed by two percentages.

```tsx
import { Slider } from '@salmonui/inputs/slider';
import '@salmonui/inputs/slider/styles.css';

<Slider name="volume" label="Volume" defaultValue={40} fill />
<Slider name="price" label="Price" defaultValue={[20, 80]} step={5} minStepsBetweenThumbs={2} />
```

<!-- demo: slider-basics -->

## Value

- `value` / `defaultValue` / `onValueChange(value, details)`:
  controlled with `value`, uncontrolled with `defaultValue`.
  A number gives one thumb; a `[start, end]` tuple gives a range with two
  thumbs. The default is `min` (or `[min, max]` when a tuple is
  passed).
- `min` (default 0), `max` (default 100) and `step` (default 1) bound and
  snap every value; PageUp / PageDown move by `pageStep` (default
  a tenth of the range rounded to `step`).
- `fill` fills the track from `min` to the thumb; a range always fills between its thumbs.
- `values` is a list of entries; the
  value is an entry (`'M'`), the native input holds its index and a hidden
  input submits the entry.
- `details` is `{ source, reason, thumb }`: `source` `'pointer'`,
  `'touch'`, `'keyboard'` or `'api'`; `reason` `'drag'`, `'keyboard'`,
  `'input'` (a native input event, e.g. an assistive technology increment)
  or `'reset'`; `thumb` 0 or 1.

## Change and commit

`onValueChange` fires while the value changes, at most once per animation
frame during a drag; `onValueCommit` fires once when the drag ends
(pointerup) or the key is released.

An uncontrolled slider does not re-render while dragging: pointer moves are
coalesced to one frame, which writes `--salmon-slider-start` /
`--salmon-slider-end` on the root and the native input's `value` and
`aria-valuetext`; the component renders once, on pointerup (`tests/browser/inputs-pointer.spec.ts`: zero React commits counted by a
`Profiler` during a drag, and a median move frame well under 1 ms). A
controlled slider renders what its owner passes back, so the owner can clamp
or veto a value.

<!-- demo: inputs-performance -->

## Ranges

Two thumbs never cross; `minStepsBetweenThumbs` keeps them that many steps
apart. A press on the track moves the nearer thumb; when both
thumbs sit on one spot the first move's direction picks the thumb. The
inputs are named by the label plus `localeText.start` / `localeText.end`
("Price Minimum", "Price Maximum").

## Ticks

`ticks: { placement, majorStep, minorStep, showMinor, formatOptions }`
 renders tick marks as markup at percentage positions, so the
server output is final and nothing is measured. `placement` is `'before'`,
`'after'` (default), `'both'` or `'none'`; `majorStep` defaults to 10 (1 with
`values`), `minorStep` to 1. Major ticks are labelled with the formatted
value; `renderTick({ value, label, major, percent })` replaces the content
of every tick. Ticks are decorative (`aria-hidden`); the value text
comes from `aria-valuetext`.

## Value label

`valueLabel: { show, placement, formatOptions, format }` shows a
bubble over each thumb: `show` is `'focus'` (default: keyboard focus or
hover), `'hover'`, `'always'` or `'never'`; `placement` is `'before'`
(above, or the inline start of a vertical slider) or `'after'`.
`format(value)` returns the bubble text. The bubble is CSS only and `aria-hidden`; the part class is
`classNames.valueLabel`.

## Limits

`limits: { minStart, maxStart, minEnd, maxEnd, startFixed, endFixed }`
 bounds the start thumb (the only thumb of a single slider) and the
end thumb inside `min..max`; a fixed thumb ignores keys and the pointer, and
a press on the track moves the other thumb.

<!-- demo: slider-limits -->

## Orientation and RTL

`orientation: 'vertical'` grows upward; set its length with the
`--salmon-slider-length` custom property (default 10rem). Horizontal sliders
mirror in right-to-left content: the fill and thumbs use logical insets, a
press on the left edge selects the high end, and ArrowRight decreases;
vertical sliders never mirror.

## Form submission

`name` is submitted by each native input: a range submits `name`
twice (`price=20&price=60`), as a multiple-value field. With `values` the
entry is submitted. An uncontrolled slider restores `defaultValue` on the
owning form's `reset`; a controlled one calls `onValueChange(default, {
reason: 'reset' })`. `form` and `disabled` are forwarded.

<!-- demo: field-forms -->

## Keyboard

| Key | Action |
| --- | --- |
| Tab / Shift+Tab | Moves between thumbs (one tab stop each) |
| Arrow Right / Arrow Up | Increases by `step` (in RTL, Arrow Left increases a horizontal slider) |
| Arrow Left / Arrow Down | Decreases by `step` (in RTL, Arrow Right decreases a horizontal slider) |
| Page Up / Page Down | Increases / decreases by `pageStep` |
| Home / End | Sets the thumb to its lowest / highest allowed value |

These are the APG Slider and Multi-Thumb Slider keys. Screen
readers hear the native slider role with `aria-valuetext` formatted by
`formatOptions` and `locale` (default `'en-US'`; "$20"), the orientation, and
`aria-readonly` with `readOnly`. Try it in the
[keyboard demo](/demos/inputs/inputs-keyboard).

## SSR

Positions, ticks and value labels are markup and CSS percentages, so the
server output is final and nothing is measured; the native range inputs
work and submit before hydration.

## Design notes

- no ticks-rendered event: a "rendered" lifecycle event has no
  React meaning. Move post-render tick code into `renderTick` or an effect.
- no built-in increase / decrease buttons: they are a composition
  the application can place anywhere. Place two `Button`s that step a
  controlled `value`; keyboard steps stay built in.
- no per-range color option: per-range colors are a theme input outside the
  five color seeds. Style the track with `classNames.track` /
  `classNames.range` and the `--salmon-slider-start` /
  `--salmon-slider-end` custom properties (for example a gradient).
- no reposition method: positions are CSS percentages, so nothing
  needs re-measuring on resize.

## API

| Prop | Type | Default |
| --- | --- | --- |
| `value`, `defaultValue` | `number \| string \| readonly [a, b]` | `min` |
| `onValueChange`, `onValueCommit` | `(value, { source, reason, thumb }) => void` | |
| `min`, `max`, `step` | `number` | `0`, `100`, `1` |
| `pageStep` | `number` | a tenth of the range |
| `values` | `readonly (string \| number)[]` | |
| `minStepsBetweenThumbs` | `number` | `0` |
| `fill` | `boolean` | `false` |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` |
| `ticks` | `{ placement, majorStep, minorStep, showMinor, formatOptions }` | no ticks |
| `renderTick` | `({ value, label, major, percent }) => ReactNode` | major labels |
| `valueLabel` | `{ show, placement, formatOptions, format }` | no label |
| `formatOptions` | `Intl.NumberFormatOptions` | |
| `locale` | `string` | `'en-US'` |
| `limits` | `{ minStart, maxStart, minEnd, maxEnd, startFixed, endFixed }` | |
| `name`, `form` | `string` | not submitted |
| `disabled`, `readOnly` | `boolean` | `false` |
| `label`, `description`, `errorMessage`, `invalid`, `validation` | see [Field](/docs/inputs/field) | |
| `localeText` | `{ start, end, validation* }` | `'Minimum'`, `'Maximum'` |
| `size` | `'sm' \| 'md' \| 'lg'` (thumb 14, 18, 22 px) | `'md'` |
| `dir`, `id`, `className`, `style` | root passthrough | |
| `classNames` | `{ label, control, track, range, thumb, valueLabel, ticks, tick, description, error }` | |
| `ref` | `HTMLDivElement` (the root) | |

Full signatures: [`@salmonui/inputs/slider` API reference](/docs/reference/inputs/slider).
