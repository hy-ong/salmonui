// Shared event model of every `DataGrid` event, also used by Gantt and Pivot
// Table for their grid-shaped events:
// `on*` props; before-events cancel with `event.preventDefault()` like the DOM;
// event objects are allocated only when a handler is bound (callers check the
// handler before calling `gridEvent`). Large payload fields are lazy getters.
// development builds freeze every event object after construction
// (shallow `Object.freeze`; production skips it, so it costs nothing there).
// Fields a handler may edit (a menu event's `items`) are separate mutable
// arrays referenced from the frozen object; cancel only with
// `preventDefault()`.

import { DEV } from './dev.js';

/** Input that caused an action. */
export type DataGridEventSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** Base of every `DataGrid` event object. */
export interface DataGridEvent {
  /** `'sortChange'`, `'beforeSortChange'`, ... */
  readonly type: string;
  readonly source: DataGridEventSource;
  /** True after `preventDefault()` (before-events and click events). */
  readonly defaultPrevented: boolean;
  /** Before-events and click events: cancels the action (or the built-in behavior). */
  preventDefault(): void;
}

/** Fields of an event type without the `DataGridEvent` members the helper adds. */
export type DataGridEventInit<E extends DataGridEvent> = Omit<E, 'type' | 'source' | 'defaultPrevented' | 'preventDefault'>;

/**
 * Builds an event object. `fields` is adopted (not copied); getters on it
 * stay lazy. Call only when a handler is bound. Frozen in development
 * builds: define every field (lazy ones with `lazyField`) before calling.
 */
export function gridEvent<E extends DataGridEvent>(type: string, source: DataGridEventSource, fields: DataGridEventInit<E>): E {
  let prevented = false;
  const target = fields as Record<string, unknown>;
  Object.defineProperty(target, 'type', { value: type, enumerable: true });
  Object.defineProperty(target, 'source', { value: source, enumerable: true });
  Object.defineProperty(target, 'defaultPrevented', { get: () => prevented, enumerable: true });
  Object.defineProperty(target, 'preventDefault', {
    value: () => {
      prevented = true;
    },
    enumerable: false,
  });
  if (DEV) Object.freeze(target);
  return target as unknown as E;
}

/** Defines a lazy, memoized getter on an event's fields object. */
export function lazyField<T extends object, K extends string, V>(target: T, key: K, compute: () => V): T & { readonly [P in K]: V } {
  let done = false;
  let value: V;
  Object.defineProperty(target, key, {
    get: () => {
      if (!done) {
        value = compute();
        done = true;
      }
      return value;
    },
    enumerable: true,
  });
  return target as T & { readonly [P in K]: V };
}
