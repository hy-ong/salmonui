// Dismiss layer stack: outside press, Escape and focus leaving, for nested layers.
// The DOM core (`addDismissLayer`) has no React; `useDismiss` binds it to an
// element ref. Generalized from the outside-press and Escape handling of
// `DataGridPopover` (`data-grid/popover.tsx`).
//
// Rules:
// - Layers stack per document in mount order. Escape dismisses the top layer
//   only; content that handles Escape itself calls `preventDefault()` and
//   no layer is dismissed.
// - A press inside a layer above (a submenu, a nested popup) counts as inside
//   for every layer below it; a press on a lower layer dismisses the layers
//   above it only.
// - `inside` elements (the trigger, a combobox input) count as inside.
// - The stack lives in a WeakMap keyed by document and is only touched in
//   effects and event handlers (no module-level render state).

import { useLayoutEffect, useRef, type RefObject } from 'react';

export type DismissReason = 'outside' | 'escape' | 'focus-outside';

export interface DismissLayerOptions {
  /** Called with the reason and the DOM event that caused the dismissal. */
  readonly onDismiss: (reason: DismissReason, event: Event) => void;
  /** Elements that count as inside (the trigger, parent menus). */
  readonly inside?: (() => readonly (Element | null | undefined)[]) | undefined;
  /** Dismiss on a press outside. A function filters per event. Default true. */
  readonly outsidePress?: boolean | ((event: PointerEvent) => boolean) | undefined;
  /** Dismiss on Escape when this is the top layer. Default true. */
  readonly escape?: boolean | undefined;
  /** Dismiss when focus moves outside. Default false. */
  readonly focusOutside?: boolean | undefined;
}

export interface DismissLayer {
  readonly element: Element;
  /** Replaces the options (handlers change identity across renders). */
  update(options: DismissLayerOptions): void;
  /** Removes the layer and its listeners. */
  remove(): void;
}

interface Entry {
  readonly element: Element;
  options: DismissLayerOptions;
}

const stacks = new WeakMap<Document, Entry[]>();

function stackOf(doc: Document): Entry[] {
  let stack = stacks.get(doc);
  if (!stack) stacks.set(doc, (stack = []));
  return stack;
}

/** The layers of `doc`, bottom first (tests and debugging). */
export function dismissLayers(doc: Document): readonly Element[] {
  return (stacks.get(doc) ?? []).map((e) => e.element);
}

function isInside(entry: Entry, stack: readonly Entry[], target: Node): boolean {
  if (entry.element.contains(target)) return true;
  for (const el of entry.options.inside?.() ?? []) if (el?.contains(target)) return true;
  // Layers above this one (opened from it) count as inside.
  for (let i = stack.indexOf(entry) + 1; i < stack.length; i++) if ((stack[i] as Entry).element.contains(target)) return true;
  return false;
}

/** Registers `element` as the new top dismiss layer of its document. */
export function addDismissLayer(element: Element, options: DismissLayerOptions): DismissLayer {
  const doc = element.ownerDocument;
  const stack = stackOf(doc);
  const entry: Entry = { element, options };
  stack.push(entry);
  const onPointerDown = (event: PointerEvent): void => {
    const o = entry.options;
    const target = event.target as Node | null;
    if (!target || o.outsidePress === false || !target.isConnected) return;
    if (isInside(entry, stack, target)) return;
    if (typeof o.outsidePress === 'function' && !o.outsidePress(event)) return;
    o.onDismiss('outside', event);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented || entry.options.escape === false) return;
    if (event.isComposing) return;
    if (stack[stack.length - 1] !== entry) return;
    event.preventDefault();
    entry.options.onDismiss('escape', event);
  };
  const onFocusIn = (event: FocusEvent): void => {
    if (!entry.options.focusOutside) return;
    const target = event.target as Node | null;
    if (!target || isInside(entry, stack, target)) return;
    entry.options.onDismiss('focus-outside', event);
  };
  doc.addEventListener('pointerdown', onPointerDown, true);
  // Bubble phase: handlers inside the layer (React's root listener included) see Escape first.
  doc.addEventListener('keydown', onKeyDown);
  doc.addEventListener('focusin', onFocusIn);
  return {
    element,
    update(next) {
      entry.options = next;
    },
    remove() {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('focusin', onFocusIn);
    },
  };
}

export interface UseDismissOptions {
  /** Default true; false removes the layer. */
  readonly enabled?: boolean | undefined;
  readonly onDismiss: (reason: DismissReason, event: Event) => void;
  /** Refs whose elements count as inside (the trigger, parent menus). */
  readonly insideRefs?: readonly RefObject<Element | null>[] | undefined;
  readonly outsidePress?: boolean | ((event: PointerEvent) => boolean) | undefined;
  readonly escape?: boolean | undefined;
  readonly focusOutside?: boolean | undefined;
}

/**
 * Makes the element in `ref` a dismiss layer while mounted and enabled. The
 * layer is pushed in a layout effect, so a child layer mounted in the same
 * commit lands above its parent.
 */
export function useDismiss(ref: RefObject<Element | null>, options: UseDismissOptions): void {
  const layer = useRef<DismissLayer | null>(null);
  const enabled = options.enabled !== false;
  const latest = toLayerOptions(options);
  useLayoutEffect(() => {
    layer.current?.update(latest);
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const l = addDismissLayer(el, latest);
    layer.current = l;
    return () => {
      l.remove();
      layer.current = null;
    };
    // `latest` reaches the layer through `update` above; re-adding would reorder the stack.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, enabled]);
}

function toLayerOptions(options: UseDismissOptions): DismissLayerOptions {
  const refs = options.insideRefs;
  return {
    onDismiss: options.onDismiss,
    inside: refs && (() => refs.map((r) => r.current)),
    outsidePress: options.outsidePress,
    escape: options.escape,
    focusOutside: options.focusOutside,
  };
}
