// Input that arrives while a lazily imported interaction chunk loads. A
// component that loads its drag or key handling after mount (or on the first
// press) holds the events its chunk would have handled, then hands them to
// the chunk once it is attached, in order, so a fast press, drag or key
// sequence is not lost. DOM only, no React; the hold lives in an effect or
// an event handler, never in render.

/** The events of a pointer press, from down to release. */
export const PRESS_EVENTS: readonly string[] = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'];

/**
 * Records the `types` events that reach `target` (capture phase) until the
 * returned function runs; that function stops recording and returns them, in
 * order (once: a second call returns none). With `swallow`, only the events it accepts are held, and they are
 * stopped (no default action, no other handler) so the replay is their only run.
 */
export function holdInput(target: EventTarget, types: readonly string[], swallow?: (event: Event) => boolean): () => Event[] {
  const held: Event[] = [];
  const hold = (event: Event): void => {
    if (swallow) {
      if (!swallow(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    held.push(event);
  };
  for (const type of types) target.addEventListener(type, hold, true);
  return () => {
    for (const type of types) target.removeEventListener(type, hold, true);
    return held.splice(0);
  };
}

/**
 * Dispatches a copy of each held event at `at(event)`: listeners added since
 * (on the window, a root, the focused element) see the input they missed.
 */
export function replayInput(events: readonly Event[], at: (event: Event) => EventTarget | null | undefined): void {
  for (const event of events) at(event)?.dispatchEvent(new (event.constructor as typeof Event)(event.type, event));
}
