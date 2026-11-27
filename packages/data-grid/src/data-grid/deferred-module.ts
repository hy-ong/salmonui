// A core module registered before its code is loaded (a lazy feature
// chunk). The engine takes its modules at construction, but an
// optional feature (editing) should not put its module in the default bundle.
// The stand-in declares the module's name, command types and method names up
// front and serves the at-rest state, which renders the same markup as the
// real module before any command; once `resolve()` hands it the real module,
// every reducer, notification and method call is forwarded to it.

import type { DataGridModule, DataGridOptions, ModuleContext, NotificationScope } from '@salmonui/data-grid/engine';

// Erased module shapes: the stand-in forwards whatever the real module takes.
type AnyModule<Row> = DataGridModule<Row, unknown, never>;
type Read<Row> = (ctx: ModuleContext<Row>, ...args: never[]) => unknown;

export interface DeferredModuleShape<Row> {
  readonly name: string;
  readonly commands: readonly string[];
  readonly inSnapshot?: boolean;
  readonly dependencies?: readonly string[];
  /** The at-rest state the real module's `initialState` returns for `options` (equal in value). */
  initialState(options: DataGridOptions<Row>): unknown;
  /** Every method of the real module, with its at-rest result until the module loads. */
  readonly methods: Readonly<Record<string, Read<Row>>>;
  /** The real module implements `notify`. */
  readonly notify?: boolean;
}

export interface DeferredModule<Row> {
  readonly module: AnyModule<Row>;
  /** Installs the real module. Commands dispatched before it are rejected with `moduleLoading`. */
  resolve(real: object): void;
}

export function deferModule<Row>(shape: DeferredModuleShape<Row>): DeferredModule<Row> {
  let real: AnyModule<Row> | null = null;
  let options: DataGridOptions<Row> | null = null;
  // The stand-in state the engine holds until the first forwarded command, and its replacement.
  let restState: unknown = undefined;
  let realState: unknown = undefined;
  const methods: Record<string, Read<Row>> = {};
  for (const [name, fallback] of Object.entries(shape.methods)) {
    methods[name] = (ctx, ...args) => {
      const read = real ? (real.methods as Record<string, Read<Row>> | undefined)?.[name] : fallback;
      return read ? read(ctx, ...args) : undefined;
    };
  }
  const own = (state: unknown): unknown => (state === restState && real ? realState : state);
  const module = {
    name: shape.name,
    commands: shape.commands,
    ...(shape.inSnapshot !== undefined ? { inSnapshot: shape.inSnapshot } : {}),
    ...(shape.dependencies ? { dependencies: shape.dependencies } : {}),
    methods,
    initialState(o: DataGridOptions<Row>): unknown {
      options = o;
      restState = shape.initialState(o);
      return restState;
    },
    reduce(state: unknown, command: never, ctx: ModuleContext<Row>) {
      if (!real) return ctx.reject('moduleLoading');
      return real.reduce ? real.reduce(own(state), command, ctx) : state;
    },
    ...(shape.notify
      ? {
          notify(previous: unknown, next: unknown, ctx: ModuleContext<Row>): NotificationScope {
            return real?.notify ? real.notify(own(previous), next, ctx) : {};
          },
        }
      : {}),
    dispose(): void {
      real?.dispose?.();
    },
  } as unknown as AnyModule<Row>;
  return {
    module,
    resolve(impl) {
      if (real) return;
      const next = impl as AnyModule<Row>;
      real = next;
      // The real module initializes its own stores from the same options.
      realState = options ? next.initialState(options) : undefined;
    },
  };
}
