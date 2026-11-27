---
title: Image editor
description: A zero-dependency Canvas 2D image editor - crop, rotate, straighten, flip, resize, zoom and pan, finetune, filter presets, frames, shape / text / freehand / image annotations, redaction, undo and redo, and export to a Blob.
category: Components
order: 25
demos: [image-editor, image-editor-controlled]
---

`ImageEditor` from `@salmonui/editors/image-editor` edits an image on a Canvas
2D surface with no dependencies. Every edit is a controlled value with a
change callback, so the application owns (and can persist) the whole edit;
pointer, pinch, pan and drag transients never touch React state.

```tsx
import { ImageEditor, type ImageEditorActions } from '@salmonui/editors/image-editor';
import '@salmonui/editors/image-editor/styles.css';

const actions = useRef<ImageEditorActions>(null);

<ImageEditor
  src={file}
  annotations={annotations}
  onAnnotationsChange={setAnnotations}
  actionsRef={actions}
  style={{ height: 520 }}
/>;

const blob = await actions.current?.toBlob({ type: 'image/webp', quality: 0.9 });
```

The stylesheet carries the `Button`, `Toolbar`, `Menu` and visually hidden
rules the editor renders, so it is the only stylesheet besides
`@salmonui/core/styles.css` (the theme, once per app).

<!-- demo: image-editor -->

## Opening an image

`src` takes a URL or data URL, a `Blob` or `File`, an `ImageBitmap`,
`ImageData`, an `<img>` or a `<canvas>`. URL sources load with
`crossOrigin="anonymous"` (`crossOrigin` prop) so the canvas stays
exportable. `onLoad({ width, height })` and `onLoadError(error)` report the
result. The `'open'` toolbar item opens a native file picker (`accept`,
default `image/*`); an image opened there, or through
`actionsRef.current.open(source)`, starts a fresh edit: every value resets
and the history is cleared.

## Export

`actionsRef.current.toBlob({ type, quality })`, `toDataURL(options)` and
`toImageData()` render the edit at output size: crop, rotation, flips,
straighten, resize, finetune, filter, annotations, redaction and frame.
`onBeforeExport(event)` runs first with the type, quality and
size; `event.preventDefault()` cancels and the promise resolves `null`. The
download is the application's:

```ts
const blob = await actions.current?.toBlob({ type: 'image/jpeg', quality: 0.85 });
if (blob) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'photo.jpg' });
  a.click();
  URL.revokeObjectURL(a.href);
}
```

With `onSave`, the toolbar shows a `'save'` item that exports a PNG and
passes the Blob to it.

## The edit: transform, adjustments, filter, frame, annotations

| Value | Triad | Content |
| --- | --- | --- |
| Geometry | `transform` / `defaultTransform` / `onTransformChange` | `crop` (`{ x, y, width, height, shape: 'rect' \| 'circle' }`), `rotation` (90-degree steps), `straighten` (-45 to 45), `flip` (`{ horizontal, vertical }`), `resize` (`{ width, height }`), `zoom` |
| Finetune | `adjustments` / `defaultAdjustments` / `onAdjustmentsChange` | `brightness`, `contrast`, `saturation`, `exposure` (-100 to 100), `hue` (degrees), `opacity` (0 to 100), `blur` (pixels) |
| Filter preset | `filter` / `defaultFilter` / `onFilterChange` | `'default'`, `'chrome'`, `'cold'`, `'warm'`, `'grayscale'`, `'sepia'`, `'invert'` |
| Frame | `frame` / `defaultFrame` / `onFrameChange` | `type` (`'none'`, `'mat'`, `'bevel'`, `'line'`, `'inset'`, `'hook'`), `color`, `gradientColor`, `size`, `inset`, `radius` |
| Annotations | `annotations` / `defaultAnnotations` / `onAnnotationsChange` | the array; order is z-order |
| Tool | `tool` / `defaultTool` / `onToolChange` | the active tool |

Each change callback receives `(value, { source, reason })`, where `reason`
names the operation (`'crop'`, `'rotate'`, `'add'`, `'undo'`, ...).
Coordinates of the crop and of every annotation are in the *oriented image*:
source pixels after the 90-degree rotation and the flips, before the crop.
Rotating or flipping from the toolbar moves the crop and the annotations
with the image.

### Crop

The crop tool shows the whole image with a crop frame, rule-of-thirds lines
and eight handles; drag inside to move, outside to draw a new frame. The
panel offers `cropRatios` (default `['free', 'square', 'circle', '3:2',
'4:3', '16:9']`, plus `{ label, ratio }` entries); `'circle'` crops to the
inscribed ellipse with transparent corners. Apply commits the crop (and
clears `resize`); the draft lives outside React until then.

### Rotate, straighten, flip, resize

Rotate left / right turn in 90-degree steps; straighten is a slider from
-45 to 45 degrees that scales the image so no empty corner shows. The flips
mirror the current view. Resize sets the output size; `Keep aspect ratio`
is on by default.

### Zoom and pan

Zoom in / out, `Ctrl` (or `Cmd`) + wheel, trackpad and touch pinch zoom
around the pointer; the pan tool, a drag on an empty area while zoomed, the
middle mouse button and two fingers pan. These run in a
`requestAnimationFrame` loop and commit `transform.zoom` once per gesture
(`minZoom` 1 and `maxZoom` 10 by default; 1 fits the image).

### Finetune and filters

The finetune sliders preview while you drag and commit on release. Both
finetune and presets render through Canvas 2D `ctx.filter`; where a browser
lacks it (Safari before 18) a pixel fallback applies the same CSS filter
math to the image data.

### Frames

Frames draw over the output edges: `mat` and `bevel` fill a band, `line`
strokes a rectangle at `inset`, `inset` combines a band with an inner line,
and `hook` draws corner brackets. `gradientColor` turns the color into a
linear gradient.

## Annotations

| Kind | Fields |
| --- | --- |
| `'rectangle'`, `'ellipse'` | `x`, `y`, `width`, `height`, `stroke`, `fill`, `strokeWidth`, `radius` (rectangle) |
| `'line'`, `'arrow'`, `'path'`, `'freehand'` | `points` (`[x0, y0, x1, y1, ...]`), `stroke`, `strokeWidth`, `fill` and `closed` (path) |
| `'text'` | `x`, `y`, `text`, `fontFamily`, `fontSize`, `color`, `bold`, `italic` |
| `'image'` | `x`, `y`, `width`, `height`, `src` |
| `'redact'` | `x`, `y`, `width`, `height`, `mode` (`'blur'` or `'pixelate'`), `strength` |

Every kind also takes `id`, `rotation` and `opacity`.

- Shapes: drag to draw (Shift keeps a square), a click places a
  default size. The path tool adds a point per click; a double click or
  Enter ends it, Escape drops it.
- Text: click to place a text box; type in the input over the
  canvas and press Enter (Shift+Enter for a new line, Escape keeps the old
  text). Double click or Enter on a selected text edits it; an empty text
  removes the annotation.
- Freehand: the stroke records every coalesced pointer sample
  outside React and commits once on release.
- Image: the `'image'` item picks a file and places it centered
  (at most half the shorter side); `src` may also be any URL.
- Redaction: a blur or pixelate region burned into the pixels
  below it, on screen and in every export.

### Selection and z-order

Click an annotation to select it: drag to move, drag a handle to resize
(Shift locks the ratio), drag the round knob to rotate (Shift snaps to 15
degrees). The quick-access toolbar next to the selection offers Edit text,
Duplicate, Bring forward, Send backward, Bring to front, Send to back and
Delete (`quickAccessToolbar` lists the items; `false` hides it). In the
crop tool it shows Apply crop and Cancel crop. Z-order is array order, so
the reorder items reorder `annotations` through `onAnnotationsChange`.
`annotationDefaults` sets the stroke, fill, width and font of new shapes;
the panel of a shape tool or selection changes them.

## History

Every committed edit (not zoom or pan) is an undo step: toolbar `'undo'`,
`'redo'`, `'reset'`, `Mod+Z`, `Mod+Shift+Z` and `Mod+Y`, or
`actionsRef.current.undo()` / `redo()` / `reset()`. Reset returns to the
values the editor started with (and is itself undoable). `undoLimit`
(default 50) caps the steps; repeated keyboard nudges of one annotation
merge into one step. `onHistoryChange({ canUndo, canRedo, undoCount,
redoCount })` reports the state.

## Toolbar

`toolbar` lists items: built-in ids, `'|'` separators and custom items
`{ id, label, icon?, disabled?, onClick(actions) }`; `false` hides the bar,
`renderToolbar(defaultToolbar, actions)` wraps or replaces it.
`onToolbarItemClick({ id, source, preventDefault })` runs first and can
cancel the built-in action. The bar is the Salmon `Toolbar`: one tab stop,
arrow keys, and an overflow menu when the container is narrow.

## Events

Before / after pairs: `onBeforeCrop` / `onCrop`, `onBeforeRotate` /
`onRotate` (90-degree steps and straighten), `onBeforeFlip` / `onFlip`,
`onBeforeResize` / `onResize`, `onBeforeZoom` / `onZoom`, `onBeforePan` /
`onPan`, `onBeforeAnnotationChange` / `onAnnotationChange` (with `action`:
`'add'`, `'update'`, `'delete'`, `'clone'`, `'reorder'`), `onBeforeFilter` /
`onFilter`, `onBeforeAdjust` / `onAdjust`, `onBeforeFrame` / `onFrame`,
`onBeforeSelect` / `onSelect`. Each receives `{ operation, previous, value,
source }`; `event.preventDefault()` in a before-callback cancels the
operation. `onEditComplete({ operation, source, state })` follows every
committed edit, undo, redo and reset.

## Keyboard and accessibility

The canvas is `role="img"` with `aria-label` (`localeText.canvas`) and a
visually hidden description of its keys; committed operations are announced
in a polite live region (`localeText.announce(operation, detail)`).

| Key (canvas focused) | Action |
| --- | --- |
| `Enter` on a drawing tool item | Inserts the tool's annotation at the center and selects it |
| `]` / `[` | Select the next / previous annotation |
| Arrows (Shift: 10 px) | Move the selection, or the crop frame in the crop tool |
| `Alt` + arrows | Resize the selection or the crop frame |
| `R` / `Shift+R` | Rotate the selection by 15 degrees |
| `Mod+D`, `Delete` | Duplicate, delete |
| `Mod+]` / `Mod+[` (with Shift: to front / back) | Z-order |
| `Enter` | Edit the selected text; apply the crop |
| `Escape` | Cancel a gesture or path, deselect, leave the crop tool |
| `+` / `-` / `0` | Zoom in / out / fit; arrows pan when zoomed and nothing is selected |

## Mobile

Below the container width the toolbar moves items into its overflow menu.
Touch pinch zooms, two fingers pan, and on coarse pointers the handles and
toolbar buttons grow to touch size.

## Image smoothing

`imageSmoothing` (default `true`) sets `ctx.imageSmoothingEnabled` on the
view and on every export: set it to `false` for pixel art so upscaling keeps
hard edges.

<!-- demo: image-editor-controlled -->

## Common props, RTL and SSR

`localeText` replaces every string (`IMAGE_EDITOR_DEFAULT_LOCALE_TEXT`),
`className` / `style` reach the root and `classNames` / `styles` the parts
(`toolbar`, `panel`, `stage`, `canvas`, `quickToolbar`); size the editor
with CSS `width` and `height` (default height 480 px). Direction comes from
the inherited `dir`: the toolbar and panels mirror. Colors follow the theme
seeds. On the server the editor renders a stable shell (toolbar, canvas,
status) and reads no browser global; the image loads after hydration.
There is no built-in persistence: components never write to
`localStorage` on their own, because hidden persistence breaks server
rendering consistency. Persist what `onTransformChange`,
`onAdjustmentsChange`, `onFilterChange`, `onFrameChange` and
`onAnnotationsChange` report and pass it back as the controlled props.

## Bundle

The initial chunk (editor shell, render engine, toolbar items) stays under
12 KB gzip without React and the composed Button / Toolbar / Menu; the
interaction layer, edit operations, panels, annotation drawing, frames and
the pixel fallback load as separate chunks.

## API reference

[`@salmonui/editors/image-editor`](/docs/reference/editors/image-editor) lists
every prop, callback, annotation type and `ImageEditorActions` method.
