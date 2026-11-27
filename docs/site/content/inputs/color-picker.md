---
title: Color Picker
description: Color picker from @salmonui/inputs/color-picker with a saturation and brightness area, hue and alpha sliders, a hex field, a swatch palette, recent colors, Apply / Cancel and parseColor, every part usable alone.
category: Components
order: 50
demos: [color-picker-basics, color-picker-popover, color-picker-swatches, color-picker-parts]
---

`ColorPicker` picks a color. A trigger button with a
swatch preview opens a popover dialog, or `inline` renders the panel in
place. The panel composes parts that are exported on their own:
`ColorArea`, `ColorSlider`, `ColorField`, `ColorSwatch` and
`ColorSwatchPicker`. Everything is CSS gradients rendered on the server;
nothing is drawn on a canvas or measured before the first pointer press.

```tsx
import { ColorPicker, parseColor } from '@salmonui/inputs/color-picker';
import '@salmonui/inputs/color-picker/styles.css';

<ColorPicker label="Theme color" name="theme" defaultValue="#1971c2" clearable defaultRecentColors={[]} />
<ColorPicker label="Accent" inline mode="swatches" commitBehavior="immediate" columns={5} colors={['#e8590c', '#2b8a3e', '#1971c2']} />
parseColor('hsl(120, 100%, 25%)').toString('hexa'); // '#008000ff'
```

<!-- demo: color-picker-basics -->

## Value

- `value` / `defaultValue` (`string | null`, default `'#008000ff'`) and
  `valueFormat: 'hex' | 'hexa' | 'rgb' | 'hsl'` (default `'hexa'`).
  The picker reports values in `valueFormat`; `'hex'` drops alpha and hides
  the alpha slider. `null` is "no color".
- `onValueChange(value, details)` fires on every pick, at most once per
  animation frame while dragging; `onValueCommit` fires
  when a value is committed. `details` is
  `{ source, reason, color }` with `reason` `'area' | 'hue' | 'alpha' |
  'field' | 'swatch' | 'recent' | 'clear' | 'apply' | 'cancel' | 'reset'`
  and `color` the parsed `Color` (or null).
- `name` submits the value through a hidden input (`''` for no color);
  `form` and `disabled` are forwarded. A form reset restores
  `defaultValue`.
- Controlled or uncontrolled: `value`, `mode`, `open` and `recentColors`
  are controlled with their `on...Change` callback, or start from
  `defaultValue`, `defaultMode`, `defaultOpen` and `defaultRecentColors`.
  `valueFormat` only sets the format of reported values: convert the
  value you hold yourself (`parseColor(value).toString(format)`) when you
  change it.

## Commit behavior

`commitBehavior: 'confirm'` (default) adds Apply and Cancel. Picks
update the value live; Apply commits (`onValueCommit` with reason
`'apply'`) and closes; Cancel, Escape, an outside press or focus leaving
the popover reverts to the value at open (`onValueChange` with reason
`'cancel'`). Inline, Cancel reverts to the last applied value.
`'immediate'` commits every finished pick (drag end, key step, field entry,
swatch) and closes the popover after a swatch pick.

## Modes

- `mode: 'area' | 'swatches'` / `defaultMode` (default `'area'`) /
  `onModeChange`. Area mode is a `ColorArea`, a hue
  `ColorSlider`, an alpha `ColorSlider` (`alpha`, default true),
  previous and current swatches and a hex `ColorField`. Swatches mode is a
  `ColorSwatchPicker` of `colors` (flat entries or `{ label, colors }`
  groups; default a 60-color palette) in `columns` (default 10).
- `showModeSwitch` (default true) shows the switch button;
  `onBeforeModeChange(event)` can veto with `event.preventDefault()`.
- `clearable` adds a "no color" swatch first in the palette and a clear
  button on the hex field.
- `renderSwatch({ color, value, label, selected, index })` replaces the
  content of each palette swatch;
  the option around it keeps the name, selection and keyboard behavior.

<!-- demo: color-picker-swatches -->

## Recent colors

`recentColors` / `defaultRecentColors` / `onRecentColorsChange`:
when either is set, every committed color is prepended (deduplicated, at
most `maxRecentColors`, default 10) and shown as a "Recent colors" palette.
Nothing is stored; persist the array yourself if needed.

## Popover

`open` / `defaultOpen` / `onOpenChange(open, { source, reason })`
and the cancellable `onBeforeOpenChange(event)`
(`event.open`, `event.reason`, `event.preventDefault()`). The trigger is a plain
button with `aria-haspopup="dialog"` and `aria-expanded`, named by the
label and the current color ("Theme color dark vibrant blue"). The popover
is a `role="dialog"` named by the label, positioned below the trigger with
flip and shift, in the top layer. It takes focus (the area) on open and
returns it to the trigger on close. The popover code is a lazy chunk
loaded when the trigger is hovered, focused or opened, and the popover
renders only while open.

<!-- demo: color-picker-popover -->

## Server rendering

The trigger, the inline panel and every part render on the server with
the same markup as the first client render: colors are CSS custom
properties and gradients, ids come from `useId`, and nothing measures the
DOM before the first pointer press, so there are no hydration warnings.
The popover renders only on the client after it opens. Import the
stylesheet once, in the root layout of a Next.js app or the entry of a
Vite app.

## Parts

<!-- demo: color-picker-parts -->

Each part is usable alone and takes `value` / `defaultValue` as a
color string or a `Color`. Passing a `Color` keeps the hue of grays and
blacks while dragging.

- `ColorArea`: saturation along the inline axis, brightness along the
  block axis, `onValueChange(color, { source, reason })` (reason `'drag' |
  'step' | 'reset'`) and `onValueCommit` (drag end, key step). An
  uncontrolled area paints a drag directly and renders once at the end.
- `ColorSlider channel="hue" | "alpha"`, `orientation` (vertical sliders
  grow upward and never mirror).
- `ColorField`: a text field that parses hex, `rgb()` and `hsl()` text on
  blur or Enter and reverts text that does not parse; it reports in its own
  `valueFormat` and shares the Field parts (label, description, error,
  `validation`).
- `ColorSwatch`: a `role="img"` preview named by the color.
- `ColorSwatchPicker`: the palette listbox, `value` as given in `colors`.
- `parseColor(text)` returns a `Color` (`hue`, `saturation`, `brightness`,
  `alpha`, `toRgb()`, `toHsl()`, `toHsv()`, `with()`, `equals()`,
  `toString(format)`), or throws a `TypeError`. `rgbColor`, `hslColor`, `hsvColor` build colors
  and `colorName(color)` describes one.

## Keyboard

`ColorArea` is two visually hidden range inputs (APG Slider, two sliders
for one 2D control); `ColorSlider` is one. `aria-valuetext` names the
color: "Saturation 75%, light vibrant green", "120°, green", "50%".
Horizontal keys mirror in right-to-left content.

| Key (ColorArea) | Action |
| --- | --- |
| Tab | Focuses the saturation slider (one tab stop) |
| Arrow Right / Arrow Left | Saturation up / down (mirrored in RTL); focuses the saturation slider |
| Arrow Up / Arrow Down | Brightness up / down; focuses the brightness slider |
| Shift+Arrow | Ten times the step |
| Page Up / Page Down | Focused channel up / down by ten steps |
| Home / End | Focused channel to 0 / 100 |

| Key (ColorSlider) | Action |
| --- | --- |
| Arrow Right / Arrow Up | Increase (in horizontal RTL, Arrow Left increases) |
| Arrow Left / Arrow Down | Decrease |
| Shift+Arrow, Page Up / Page Down | Ten steps |
| Home / End | Minimum / maximum |

| Key (ColorSwatchPicker) | Action |
| --- | --- |
| Tab | Enters and leaves the palette (one tab stop, on the selected swatch) |
| Arrow Left / Arrow Right | Previous / next swatch (mirrored in RTL) |
| Arrow Up / Arrow Down | Same column in the previous / next row (across groups) |
| Home / End | First / last swatch of the row |
| Ctrl+Home / Ctrl+End | First / last swatch |
| Enter / Space | Selects the focused swatch |

| Key (ColorPicker) | Action |
| --- | --- |
| Enter / Space / Alt+Arrow Down on the trigger | Opens the popover |
| Escape | Closes the popover (reverts in confirm mode); in the hex field with `clearable`, clears first |
| Tab | Moves through the panel; leaving the popover closes it |

## Design notes

- the popover content always renders only while open, and its
  code is a lazy chunk loaded on hover, focus or first open, so there is no
  eager-render option.

## API

Every exported symbol and type is listed in the
[`@salmonui/inputs/color-picker` reference](/docs/reference/inputs/color-picker).

| Prop | Type | Default |
| --- | --- | --- |
| `value`, `defaultValue` | `string \| null` | `'#008000ff'` |
| `valueFormat` | `'hex' \| 'hexa' \| 'rgb' \| 'hsl'` | `'hexa'` |
| `onValueChange`, `onValueCommit` | `(value, { source, reason, color }) => void` | |
| `commitBehavior` | `'confirm' \| 'immediate'` | `'confirm'` |
| `mode`, `defaultMode` | `'area' \| 'swatches'` | `'area'` |
| `onModeChange` / `onBeforeModeChange` | `(mode) => void` / `(event) => void` | |
| `showModeSwitch`, `alpha` | `boolean` | `true` |
| `inline`, `clearable` | `boolean` | `false` |
| `colors` | `(string \| { value, label })[] \| { label, colors }[]` | 60-color palette |
| `columns` | `number` | `10` |
| `renderSwatch` | `({ color, value, label, selected, index }) => ReactNode` | |
| `recentColors`, `defaultRecentColors` | `readonly string[]` | not tracked |
| `onRecentColorsChange` | `(colors) => void` | |
| `maxRecentColors` | `number` | `10` |
| `open`, `defaultOpen` | `boolean` | `false` |
| `onOpenChange` / `onBeforeOpenChange` | `(open, { source, reason }) => void` / `(event) => void` | |
| `name`, `form` | `string` | not submitted |
| `disabled`, `required` | `boolean` | `false` |
| `label`, `description`, `errorMessage`, `invalid`, `validation` | see [Field](/docs/inputs/field) | |
| `aria-label` | `string` (trigger and popover name without `label`) | `'Color'` (trigger), `'Color picker'` (popover) |
| `localeText` | `{ trigger, dialog, area, colors, recentColors, noColor, apply, cancel, current, previous, clear, hex, switchToSwatches, switchToArea, saturation, brightness, hue, alpha, colorName, validation* }` | English |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `className`, `style` | root | |
| `ref` | `HTMLElement` (the trigger, or the panel group when `inline`) | |

`ColorArea` and `ColorSlider` take `value`, `defaultValue` (`string |
Color`), `onValueChange`, `onValueCommit`, `name`, `form`, `valueFormat`,
`step`, `disabled`, `localeText`, `aria-label`, `aria-labelledby`, `id`,
`className`, `style` and `ref` (the root); `ColorSlider` adds `channel`
and `orientation`. `ColorField` takes the TextField props plus
`valueFormat`, `showSwatch` and `onValueChange(value, { source, reason,
color })`. `ColorSwatchPicker` takes `colors`, `columns`, `value`,
`defaultValue`, `onValueChange(value, { source, reason, color })`,
`clearable`, `renderSwatch`, `name`, `form`, `disabled`, `localeText` and
`aria-label`. `ColorSwatch` takes `color`, `aria-label` (`''` makes it
decorative) and `colorName`.
