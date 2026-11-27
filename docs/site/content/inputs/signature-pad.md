---
title: SignaturePad
description: Signature capture from @salmonui/inputs/signature-pad on a Canvas 2D with Pointer Events, pressure and velocity widths, undo / redo, PNG / JPEG / SVG output, a keyboard "type your name" mode and form submission.
category: Components
order: 43
demos: [signature-pad-basics, signature-pad-export, field-forms]
---

`SignaturePad` captures a handwritten signature. The strokes are the source
of truth and the canvas is a render of them: undo and redo walk a stack of
states, a resize or a devicePixelRatio change redraws from the strokes, and
`toSVG()` writes the same smoothed curves.

```tsx
import { useRef } from 'react';
import { SignaturePad, type SignaturePadApi } from '@salmonui/inputs/signature-pad';
import '@salmonui/inputs/signature-pad/styles.css';

const pad = useRef<SignaturePadApi>(null);
<SignaturePad ref={pad} name="signature" label="Signature" backgroundColor="#ffffff" />
// later: const blob = await pad.current!.toBlob('image/png');
```

<!-- demo: signature-pad-basics -->

## Drawing

Mouse, touch and pen draw through Pointer Events with pointer capture.
Every sample of `getCoalescedEvents()` is kept, moves are drawn
once per animation frame and only the new segments of the live stroke are
painted, so React does not render while drawing (a median 120 Hz
move frame well under 2 ms). `touch-action: none` is set on the canvas only,
so the page still scrolls around the pad.

- `strokeColor` (default `'#000000'`).
- `minStrokeWidth` (0.5), `maxStrokeWidth` (2.5) and `velocity` (the
  velocity filter weight, 0.7) shape the line: faster strokes are
  thinner; a pen's `pressure` maps linearly between the two widths.
- `backgroundColor` fills the canvas and `backgroundImage` (a
  same-origin or CORS-enabled URL) is drawn under the strokes, stretched to
  the pad. Both are image data, not theme colors, so exported
  images look the same in light and dark mode.
- `height` (default 160) sizes the pad; the width follows the container.

## Value and changes

`onValueChange(value, details)` fires after a stroke, undo, redo, clear,
load, typed text or form reset, with the PNG data URL (`null` when
empty) and `details.action` `'stroke' | 'undo' | 'redo' | 'clear' | 'load'
| 'text' | 'reset'` (also `details.reason`) and `details.source`. A
controlled `value` (data URL) or `defaultValue` is drawn as the signature
image; an outside value starts a new undo baseline. Without
`value` the pad is uncontrolled.

<!-- demo: signature-pad-export -->

## API

`ref` is a `SignaturePadApi`:

| Member | Description |
| --- | --- |
| `element` | The root element |
| `undo()`, `redo()`, `canUndo()`, `canRedo()` | Stroke-stack history |
| `clear()`, `isEmpty()` | Clears the pad; reports whether it holds no strokes |
| `drawText(text, { fontFamily, fontSize })` | Replaces the signature with centered text, fitted to the pad without `fontSize` |
| `load(source)` | Loads a data URL or image URL as the signature; resolves when drawn |
| `toDataURL(type, { background })` | `'image/png'` (default) or `'image/jpeg'` at the canvas resolution; `background: false` leaves out `backgroundColor` / `backgroundImage` |
| `toBlob(type, { background })` | A `Promise<Blob \| null>` |
| `toSVG({ background })` | Vector markup from the stroke model in CSS pixels: one cubic Bézier path per segment, the same curves and widths as the canvas |
| `focus()` | Focuses the canvas |

## Form submission

With `name` a hidden input submits the PNG data URL (empty without a
signature). A signature PNG is typically 5 to 30 KB as a data URL,
so prefer `multipart/form-data` or upload `toBlob()` for large pads.
`required` (or `validation`) reports an empty pad through the field error;
`form` and `disabled` are forwarded. An uncontrolled pad restores
`defaultValue` on the owning form's `reset`.

<!-- demo: field-forms -->

## Keyboard and screen readers

The canvas is focusable with `role="img"`, named by `label` and by
`localeText.empty` / `localeText.signed` ("Signature, empty" /
"Signature, signed") so screen readers hear whether it is signed.
"Type your name" (a toggle button, `aria-pressed`) shows a name field whose
text is drawn with `drawText` in `fontFamily` (default `'cursive'`); one
typing session is one undo step. `toolbar={false}` hides the toggle and the
Clear button for a custom UI.

| Key | Action |
| --- | --- |
| Tab / Shift+Tab | Canvas, then the "Type your name" and Clear buttons |
| Ctrl+Z / Cmd+Z (canvas focused) | Undo |
| Ctrl+Shift+Z / Cmd+Shift+Z, Ctrl+Y (canvas focused) | Redo |
| Enter / Space on "Type your name" | Shows or hides the name field |
| Enter / Space on Clear | Clears the pad |

## Resize and high-DPI screens

The backing store is sized to the canvas box times `devicePixelRatio` after
mount and on every resize or DPR change, and the strokes are redrawn.
The server renders the sized container and an empty canvas, so
the markup hydrates without a mismatch.

## Design notes

- no save-to-file method: triggering a download is application
  policy (file name, share sheet, or an upload instead). Build the download
  from `await api.toBlob('image/png')` and an object URL.
- no save event or Ctrl+S shortcut: a global shortcut conflicts
  with the browser and assistive technology. Call `api.toBlob()` from your
  own save button.

## Props

| Prop | Type | Default |
| --- | --- | --- |
| `value`, `defaultValue` | `string \| null` (data URL) | `null` |
| `onValueChange` | `(value, { source, reason, action }) => void` | |
| `strokeColor` | `string` | `'#000000'` |
| `minStrokeWidth`, `maxStrokeWidth` | `number` | `0.5`, `2.5` |
| `velocity` | `number` (0..1) | `0.7` |
| `backgroundColor`, `backgroundImage` | `string` | none |
| `height` | `number \| string` | `160` |
| `toolbar` | `boolean` | `true` |
| `fontFamily` | `string` | `'cursive'` |
| `name`, `form` | `string` | not submitted |
| `required`, `disabled`, `readOnly` | `boolean` | `false` |
| `label`, `description`, `errorMessage`, `invalid`, `validation` | see [Field](/docs/inputs/field) | |
| `localeText` | `{ empty, signed, typeMode, typeLabel, clear, validation* }` | `'Signature, empty'`, `'Signature, signed'`, `'Type your name'`, `'Name'`, `'Clear'` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `dir`, `id`, `className`, `style` | root passthrough | |
| `classNames` | `{ label, surface, canvas, toolbar, description, error }` | |
| `ref` | `SignaturePadApi` | |

Full signatures: [`@salmonui/inputs/signature-pad` API reference](/docs/reference/inputs/signature-pad).
