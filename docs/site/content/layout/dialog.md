---
title: Dialog
description: Modal and modeless dialogs on the native dialog element, with trigger and close parts, cancellable dismissal, placement and position, sizes, full-screen sheets and opt-in drag and resize loaded on demand.
category: Overlays
order: 10
demos: [dialog, dialog-options, dialog-draggable, drawer]
---

`Dialog` is the native `<dialog>` element opened with `showModal()` (or
`show()` for a modeless dialog). The platform provides the top layer, the
`::backdrop`, the inert background and Tab containment; Salmon UI adds the
open state, labelling, dismissal rules, placement and optional drag and
resize. It lives in `@salmonui/overlays/dialog` with
[AlertDialog](/docs/layout/alert-dialog); [Drawer](#drawer) shares its core from
`@salmonui/overlays/drawer`.

```tsx
import { Dialog } from '@salmonui/overlays/dialog';
import { Button } from '@salmonui/buttons/button';
import '@salmonui/overlays/dialog/styles.css';
import '@salmonui/buttons/button/styles.css';

export function EditOrder() {
  return (
    <Dialog trigger={<Dialog.Trigger render={(p) => <Button {...p}>Edit</Button>} />} closeButton>
      <Dialog.Title>Edit order</Dialog.Title>
      <Dialog.Description>Changes are saved on submit.</Dialog.Description>
      <form method="dialog">
        <Dialog.Body>…fields…</Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close render={(p) => <Button {...p} variant="outline" />}>Cancel</Dialog.Close>
          <Button type="submit" value="save" tone="primary">Save</Button>
        </Dialog.Footer>
      </form>
    </Dialog>
  );
}
```

<!-- demo: dialog -->

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Dialog` | the open state and `<dialog class="salmon-dialog">` | `ref` is the `HTMLDialogElement` |
| `Dialog.Trigger` | `<button type="button">` | Pass it in `trigger` (it is rendered before the dialog with its context); `aria-haspopup="dialog"`, `aria-expanded`; `render` swaps the element |
| `Dialog.Title` | `<h2>` | Labels the dialog (`aria-labelledby`); the `title` prop is a shorthand |
| `Dialog.Description` | `<p>` | Describes the dialog (`aria-describedby`) |
| `Dialog.Body` | `<div>` | The scrolling region |
| `Dialog.Footer` | `<div>` | The action row: put `Button` elements here |
| `Dialog.Close` | `<button type="button">` | Closes with `reason: 'close'` |

Every part is also exported flat (`DialogTrigger`, `DialogTitle`, ...).
Footer buttons are ordinary `Button` elements in `Dialog.Footer` rather
than a button configuration array: they take every Button prop,
their own handlers and loading state, and `Dialog.Close` wraps a cancel
button. The application holds refs to its own footer buttons and
measures the dialog through `ref` with `getBoundingClientRect()`, or reads
`onResizeEnd`.

## Open state and dismissal

- `open` / `defaultOpen` / `onOpenChange(open, event)`. `event.reason` is
  `'trigger' | 'close' | 'closeButton' | 'escape' | 'outside' | 'submit'`
  (AlertDialog adds `'confirm'` and `'cancel'`); `event.source` is
  `'pointer'`, `'keyboard'`, `'touch'` or `'api'`. `event.preventDefault()` keeps an uncontrolled dialog as it is,
  which cancels an open or a close. A controlled dialog vetoes by not
  updating `open`.
- `dismissible` (default `{ escape: true, outside: false }`): `true` also
  closes on a backdrop press, `false` never closes on either.
  `onOverlayPress` reports backdrop presses either way.
- A `<form method="dialog">` inside closes the dialog with
  `reason: 'submit'` and its submitter's `returnValue`.
- `closeButton` adds a close button in the corner; its label is
  `localeText.close` (default "Close").
- `onAfterOpen` fires after the open transition, `onAfterClose` after the
  dialog closed. Mounting and unmounting the dialog is its lifecycle; there
  are no create or destroy events.

## Focus

On open, focus moves to `initialFocus` (a ref), else to the element with
`data-autofocus`, else to the first focusable element (the platform
default). On close it returns to the element that opened the dialog
(`returnFocus={false}` keeps it where it is). A modal dialog keeps Tab
inside; a modeless dialog (`modal={false}`) keeps the page's Tab order, and
Escape closes it from inside.

## Popups inside a dialog

A modal dialog makes the rest of the page inert, so Select, Combobox,
TreeSelect, the date and time pickers, menus, Tooltip, Popover, Mention and
ColorPicker opened inside a modal `Dialog` or `Drawer` render inside the
`<dialog>` element and stack above it in the top layer: they stay clickable
and keep their placement, flip and shift against the viewport.
Escape closes the open popup first and the dialog on the next press; a
press on the backdrop while a popup is open only closes the popup. An
explicit `container` prop on a popup still wins. Toasts are not anchored and
stay in the page: while a modal dialog is open they are announced but cannot
be operated until it closes.

## Placement, position and size

- `placement`: `'center'` (default) or `'top'`. Centering is CSS, so the
  position never needs refreshing.
- `position` / `defaultPosition` / `onPositionChange` (`{ x, y }`, `x` along
  the inline axis, mirrored in RTL) offset the dialog from its placement.
- `width`, `height`, `minHeight`: numbers (px) or CSS lengths.
- `fullScreen`: `true`, or `'mobile'` to fill the screen below 640 px (the
  Data Grid adaptive sheet rule).
- Modal dialogs live in the top layer, which the browser stacks above the
  whole page in opening order, so there is no z-index setting.
- A modal dialog cannot be confined to a target element: the
  platform makes the whole page inert, so a modal limited to one region
  would still block the rest. A modeless dialog (`modal={false}`) accepts
  `container` and is rendered and positioned inside that element (mounted
  after hydration); for a panel-local modal, render the content inline in
  the panel instead.

<!-- demo: dialog-options -->

## Drag and resize

`draggable` moves the dialog by its title (`dragHandle`: another selector);
`resizable` adds a bottom-end handle (`true`) or the given logical edges
(`['bottomEnd', 'end', 'top', ...]`). Their code is a separate chunk loaded
the first time either prop is true, so dialogs that never move pay nothing.

- During a drag the dialog's position variables are written once per
  animation frame; React renders only when the drag ends. `onMoveStart`,
  `onMove` (per frame, not for React state) and `onMoveEnd({ x, y })`;
  `onResizeStart`, `onResize` and `onResizeEnd({ width, height })`.
- Escape during a pointer drag cancels it.
- Keyboard: the drag handle and resize handles
  are focusable; arrow keys move or resize by 10 px (Shift: 50 px) and a
  polite live region announces the result (`localeText.moved`,
  `localeText.resized`). Each resize handle is named by
  `localeText.resizeEdge(edge)`, by default `localeText.resize` and the
  edge in words ("Resize (bottom end)").
- In RTL, horizontal drags and arrow keys follow the reading direction.

<!-- demo: dialog-draggable -->

Persist position and size by storing what `onPositionChange` and
`onResizeEnd` report and passing them back as `position` and
`width` / `height`. There is no built-in persistence:
`localStorage` is not readable on the server, so a restored position would
not hydrate. Content is `ReactNode`; HTML strings are not parsed, so there
is nothing to sanitize. Dialogs have one fade transition, off
under `prefers-reduced-motion`, rather than a set of animation effects:
more effects would add bytes to every dialog; restyle the
transition with CSS on `.salmon-dialog` if needed.

## SSR

A closed dialog renders only its trigger. `keepMounted` renders the closed
`<dialog>` too (content in the HTML). A modal `defaultOpen` dialog renders
`<dialog>` without `open` and calls `showModal()` after hydration; a
modeless one renders `<dialog open>`, visible without JavaScript.

## Drawer


`Drawer` is a dialog docked to an edge: navigation on a phone, a filter
panel, a details pane. It shares the dialog host, parts and props of
Dialog and lives in its own subpath, `@salmonui/overlays/drawer`, with its
own stylesheet (the dialog core plus the drawer rules; it does not load
AlertDialog or Button). The Navigation category's Sidebar overlay mode
renders the same drawer core without importing `@salmonui/overlays`, and
needs this stylesheet too.

```tsx
import { Drawer } from '@salmonui/overlays/drawer';
import '@salmonui/overlays/drawer/styles.css';

<Drawer trigger={<Drawer.Trigger aria-label="Menu">☰</Drawer.Trigger>} side="start" size={280} title="Navigation">
  <Drawer.Body>…links…</Drawer.Body>
</Drawer>;
```

<!-- demo: drawer -->

| Prop | Values | Default |
| --- | --- | --- |
| `side` | `'start' \| 'end' \| 'top' \| 'bottom'` (`start` / `end` follow `dir`) | `'start'` |
| `size` | inline size for start / end, block size for top / bottom (number px or CSS length) | 320 px |
| `modal` | `true`: backdrop, inert page, focus containment; `false`: no backdrop | `true` |
| `dismissible` | Escape and backdrop press | `true` (both) |

`open` / `defaultOpen` / `onOpenChange(open, event)`, `closeButton`,
`initialFocus`, `returnFocus`, `keepMounted`, `onAfterOpen` /
`onAfterClose` and the parts (`Drawer.Title`, `Drawer.Body`,
`Drawer.Footer`, `Drawer.Close`, `Drawer.Trigger`) behave as in Dialog.
The panel slides in from its edge (off under `prefers-reduced-motion`);
the hooks are `.salmon-drawer[data-side]`.

API reference: [`@salmonui/overlays/dialog`](/docs/reference/overlays/dialog) and
[`@salmonui/overlays/drawer`](/docs/reference/overlays/drawer).

## Bundle

The initial `@salmonui/overlays/dialog` JavaScript (Dialog, AlertDialog,
DialogProvider, without the `Button` AlertDialog composes) is 4.44 KB gzip;
the drag and resize chunk 2.10 KB; the stylesheet 2.94 KB including the
Button rules. `@salmonui/overlays/drawer` is 3.03 KB (no drag chunk) and
1.45 KB (measured 2026-11-26 with `bundle:check`).
