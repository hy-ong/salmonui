---
title: Toast
description: A labelled toast region rendered on the server, a framework-agnostic toast queue with pause on hover and focus, actions, countdown bars, logical placement, F6 navigation and no React render per timer tick.
category: Components
order: 30
demos: [toast-basic, toast-options]
---

```tsx
// app/toasts.ts: a client module owned by the application
'use client';
import { createToastQueue } from '@salmonui/notifications/toast';
export const toasts = createToastQueue({ max: 5 });

// layout.tsx
import { Toaster } from '@salmonui/notifications/toast';
import '@salmonui/notifications/toast/styles.css';
<Toaster queue={toasts} placement="bottomEnd" />;

// anywhere on the client
toasts.add({ title: 'Saved', tone: 'success' });
```

`@salmonui/notifications/toast` has three parts:

- `createToastQueue()`: a small store with `add`, `update`, `dismiss`,
  `pause`, `resume`, `subscribe` and `getSnapshot`. It has no React and no
  DOM code, so non-React code (a fetch wrapper, a router callback) can call
  it.
- `Toaster`: the region that renders a queue. Without a `queue` prop it
  creates its own.
- `useToast()`: the queue of the nearest `Toaster`. Put the components that
  call it inside the `Toaster` as `children`:

```tsx
function SaveButton() {
  const queue = useToast();
  return <Button onClick={() => queue.add({ title: 'Saved' })}>Save</Button>;
}

<Toaster>
  <SaveButton />
</Toaster>;
```

The entry is a `"use client"` module. On the server `Toaster` renders the
empty labelled region, so toasts that arrive after hydration are announced.
Toasts, timers and the top layer are client-only. `queue.add()` called on
the server does nothing and logs a development warning.

<!-- demo: toast-basic -->

## No global `toast()`

Salmon UI has no library-owned `toast()` function. Such a
function needs module-level mutable state. That breaks the React Compiler
rules, and under SSR or React Server Components one module instance serves
every request, so toasts could leak between users. You get the same
call-from-anywhere ergonomics by creating the queue once in a client module,
as shown above, and importing it where you need it.

## Toast options

`queue.add(options)` returns the toast id; `queue.update(id, options)`
merges new options into the toast.

| Option | Meaning |
| --- | --- |
| `title`, `description` | Heading line and body (`ReactNode`) |
| `content` | Replaces the default layout: icon, title, description and actions |
| `tone` | `'neutral'` (default), `'primary'`, `'info'`, `'success'`, `'warning'`, `'danger'` |
| `icon` | Replaces the built-in tone icon; `false` hides it |
| `duration` | Time on screen in ms: 5000 by default, `Infinity` keeps the toast |
| `progress` | Shows the countdown bar |
| `dismissible` | Shows a close button; Escape on the focused toast closes it too |
| `actions` | `{ label, onAction, altText }[]` buttons |
| `className`, `style` | Go to the toast element, for example a width |
| `onOpen`, `onBeforeClose`, `onClose`, `onClick` | Events |

```tsx
const id = queue.add({ title: 'Uploading', duration: Infinity });
// later
queue.update(id, { title: 'Uploaded', tone: 'success', duration: 5000, progress: true });
```

An update that sets `duration` restarts the timer and the countdown bar.

## Timing

- The timer counts only while the toast is visible. It pauses while the
  pointer is over the region, while focus is inside it, and while the
  document is hidden, then resumes with the remaining time.
  There is no separate extended timeout after hover: raise `duration` when
  a toast needs more time.
- A toast with `actions` stays until it is used or dismissed unless you set
  `duration` explicitly. A toast must not vanish before a keyboard or screen
  reader user can reach its action (WCAG 2.2.1).
- `queue.pause()` and `queue.resume()` pause every timer. Calls nest: each
  `pause()` needs its own `resume()`.
- The countdown bar (`progress`) is a CSS animation. Pausing toggles
  `data-paused` on the region, which sets `animation-play-state: paused`, so
  no React render happens while toasts count down. The bar shrinks toward
  the inline end and mirrors under `dir="rtl"`.

## Closing and events

- `queue.dismiss(id)` closes one toast and `queue.dismiss()` closes all of
  them (toasts still waiting in the queue are dropped without events).
- `onOpen(id)` runs when the toast enters the visible stack. To cancel a
  toast before it opens, do not call `queue.add()`.
- `onBeforeClose(event)` runs first; `event.preventDefault()` keeps the
  toast open. A kept toast that timed out stays until it is dismissed.
- `onClose({ id, reason })` reports why the toast closed: `'timeout'`,
  `'dismiss'` (close button or Escape), `'action'` (an action button) or
  `'programmatic'` (`queue.dismiss()`).
- An action closes its toast with reason `'action'` after `onAction` runs,
  unless `onAction` calls `event.preventDefault()`.
- `onClick` runs on any click inside the toast, buttons included.

## The stack

- `placement`: `'topStart'`, `'top'`, `'topEnd'`, `'bottomStart'`,
  `'bottom'`, `'bottomEnd'` (default). `Start` and `End` are logical, so
  they swap under `dir="rtl"`. For custom offsets set
  `inset-*` through `style` or `className` on the `Toaster`.
- `newestOnTop` (default `true`) puts the newest toast first.
- `max` (default 5) is the number of visible toasts. The others wait in the
  queue and start their timers when a slot frees.
- On screens narrower than 480 px the stack spans the width of the viewport
  and respects the safe-area insets.

## Layering and containers

The region is `popover="manual"` and is shown with `showPopover()` after it
mounts, so it sits in the top layer above page content with no `z-index`.
Browsers without the Popover API get a fixed-position region.

`container` renders a scoped region inside another element instead.
Give that element `position: relative`. `null` renders nothing
until the element exists, so you can pass a ref callback's state:

```tsx
const [panel, setPanel] = useState<HTMLElement | null>(null);
<div ref={setPanel} style={{ position: 'relative' }} />
<Toaster container={panel} />;
```

<!-- demo: toast-options -->

While a modal `<dialog>` is open, the rest of the document is inert, so
toast actions cannot be used until the dialog closes. Toasts are still
announced.

## Accessibility

- The region is a `<section role="region">` landmark named by
  `localeText.notifications` (default `"Notifications"`). It is in the
  server HTML with a polite and an assertive live region that exist before
  any toast.
- Each toast is `role="status"`, or `role="alert"` for `tone="danger"`. A
  new toast is announced through the pre-existing live region: polite for
  most tones, assertive for `danger`. The announcement is the title, the
  description and each action's `altText`. Write `altText` as a keyboard
  hint, for example "Press F6 to reach Undo".
- F6 moves focus to the first toast of the stack and F6 again returns focus to where it
  was (`hotkey={false}` turns this off). Tab moves between the toasts and
  their buttons.
- Escape closes the focused toast if it is `dismissible`. Focus then moves
  to the next toast, or back to where F6 came from.
- The close button is named by `localeText.dismiss` (default `"Dismiss"`).

## Styling

`className`, `style`, `ref` and other DOM props go to the region. Hooks:
`.salmon-toaster` (`data-placement`, `data-paused`, `data-scoped`) and
`.salmon-toaster-list`; `.salmon-toast` (`data-tone`, `data-closing`) with
the parts `.salmon-toast-body`, `-icon`, `-main`, `-title`, `-description`,
`-actions`, `-action`, `-dismiss`, `-progress`.

A toast enters and leaves with one short opacity and transform transition.
Under `prefers-reduced-motion` the transitions and the countdown animation
are off. The action and close buttons are native `<button>`
elements styled by the toast stylesheet, not `Button`, which keeps the
subpath small.

## Design notes

- Toast content is a `ReactNode`, never an HTML string, so there is nothing
  to sanitize.
- Toasts are transient and are not persisted; store what must survive a
  reload yourself.
- Direction comes from the inherited `dir` and strings from `localeText`.
- There are no lifecycle events or teardown method: mount and unmount the
  `Toaster`.

API reference: [`@salmonui/notifications/toast`](/docs/reference/notifications/toast).
