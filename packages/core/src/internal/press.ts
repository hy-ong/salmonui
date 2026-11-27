// Press handling: input source
// detection and press-and-hold repeat (spin buttons, calendar navigation,
// scroll arrows). The repeat scheduler is plain timers (Node-testable with
// mocked timers); `usePressRepeat` keeps it in a ref, never React state.
// Source detection is `clickSource` from `data-grid/popover.tsx`.

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

export type PressSource = 'pointer' | 'keyboard' | 'touch';

/** Source of a click: keyboard-synthesized clicks have `detail === 0`; taps carry `pointerType: 'touch'`. */
export function pressSource(event: { readonly detail?: number; readonly nativeEvent?: unknown; readonly pointerType?: string }): PressSource {
  if (event.detail === 0) return 'keyboard';
  const pointerType = event.pointerType ?? (event.nativeEvent as { pointerType?: string } | undefined)?.pointerType;
  return pointerType === 'touch' ? 'touch' : 'pointer';
}

/** Source of a pointer event by its `pointerType`. */
export function pointerSource(pointerType: string): PressSource {
  return pointerType === 'touch' ? 'touch' : 'pointer';
}

export interface RepeatOptions {
  /** Delay before the first repeat in ms. Default 400. */
  readonly delay?: number | undefined;
  /** Interval between repeats in ms. Default 60. */
  readonly interval?: number | undefined;
}

export interface Repeater {
  /** Fires `onPress` now and starts repeating after `delay`. Restarts when already running. */
  start(onPress: (source: PressSource, repeat: boolean) => void, source: PressSource, options?: RepeatOptions): void;
  stop(): void;
  readonly running: boolean;
}

export function createRepeater(): Repeater {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  const stop = (): void => {
    clearTimeout(timer);
    timer = undefined;
    running = false;
  };
  return {
    start(onPress, source, options = {}) {
      stop();
      running = true;
      const interval = options.interval ?? 60;
      const tick = (): void => {
        if (!running) return;
        onPress(source, true);
        // `onPress` may have stopped the repeat (a limit was reached).
        if (running) timer = setTimeout(tick, interval);
      };
      onPress(source, false);
      if (running) timer = setTimeout(tick, options.delay ?? 400);
    },
    stop,
    get running() {
      return running;
    },
  };
}

export interface PressRepeatOptions extends RepeatOptions {
  /** Called on press (`repeat` false) and on every repeat (`repeat` true). */
  readonly onPress: (source: PressSource, repeat: boolean) => void;
  readonly disabled?: boolean | undefined;
}

export interface PressRepeatHandlers<E extends Element> {
  readonly onPointerDown: (event: ReactPointerEvent<E>) => void;
  readonly onPointerUp: () => void;
  readonly onPointerLeave: () => void;
  readonly onPointerCancel: () => void;
  readonly onKeyDown: (event: ReactKeyboardEvent<E>) => void;
  readonly onKeyUp: (event: ReactKeyboardEvent<E>) => void;
  readonly onBlur: () => void;
  readonly onContextMenu: (event: { preventDefault(): void }) => void;
}

/**
 * Press-and-hold handlers for an element: the press fires on pointer down
 * (primary button) or Enter / Space key down, repeats after `delay` every
 * `interval`, and stops on pointer up / leave / cancel, key up, blur,
 * disable or unmount. Do not also handle `onClick` for the same action.
 */
export function usePressRepeat<E extends Element = HTMLElement>(options: PressRepeatOptions): PressRepeatHandlers<E> {
  const repeater = useRef<Repeater | null>(null);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
    if (options.disabled) repeater.current?.stop();
  });
  useEffect(() => () => repeater.current?.stop(), []);
  const begin = (source: PressSource): void => {
    if (latest.current.disabled) return;
    const r = (repeater.current ??= createRepeater());
    r.start((s, repeat) => latest.current.onPress(s, repeat), source, latest.current);
  };
  const stop = (): void => repeater.current?.stop();
  return {
    onPointerDown: (event) => {
      if (event.button !== 0 || event.defaultPrevented) return;
      // Touch: keep the long press from selecting text or opening a callout.
      if (event.pointerType === 'touch') event.preventDefault();
      begin(pointerSource(event.pointerType));
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onKeyDown: (event) => {
      if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat || event.defaultPrevented) return;
      // The repeat drives the action; the native button click would add a second press.
      event.preventDefault();
      begin('keyboard');
    },
    onKeyUp: (event) => {
      if (event.key === 'Enter' || event.key === ' ') stop();
    },
    onBlur: stop,
    onContextMenu: (event) => {
      if (repeater.current?.running) event.preventDefault();
    },
  };
}
