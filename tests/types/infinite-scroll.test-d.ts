// Type-contract test for the infinite scroll façade and commands: `api.engine.infiniteScroll` is typed without casts,
// and the public commands dispatch through `engine.dispatch`.
import type { CommandResult, DataGridEngine } from '@salmonui/data-grid/engine';
import type { InfiniteScrollFacade, InfiniteScrollPublicCommand, InfiniteScrollState, InfiniteScrollStats } from '@salmonui/data-grid/engine/infinite';
import type { DataGridApi, DataGridApiEngine, DataGridInfiniteScrollFacade } from '@salmonui/data-grid';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

interface Order {
  readonly id: string;
}

declare const api: DataGridApi<Order>;

// `api.engine` is the engine plus the optional infinite scroll façade.
expectType<Equal<typeof api.engine, DataGridApiEngine<Order>>>(true);
const engine: DataGridEngine<Order> = api.engine;
void engine;
expectType<Equal<typeof api.engine.infiniteScroll, DataGridInfiniteScrollFacade<Order> | undefined>>(true);

const facade = api.engine.infiniteScroll;
if (facade) {
  expectType<Equal<ReturnType<typeof facade.loadNext>, CommandResult>>(true);
  expectType<Equal<ReturnType<typeof facade.retry>, CommandResult>>(true);
  expectType<Equal<ReturnType<typeof facade.reload>, CommandResult>>(true);
  expectType<Equal<ReturnType<typeof facade.getStatus>, InfiniteScrollState>>(true);
  // Undefined until the lazy infinite chunk is installed.
  expectType<Equal<ReturnType<typeof facade.getStats>, InfiniteScrollStats | undefined>>(true);
  facade.ensureRange(0, 50);
  // @ts-expect-error the internal `infiniteScroll.loaded` is not on the façade
  facade.loaded({ version: 1 });
}

// The core façade type (`@salmonui/data-grid/engine/infinite`).
declare const core: InfiniteScrollFacade<Order>;
expectType<Equal<ReturnType<typeof core.getStats>, InfiniteScrollStats>>(true);
expectType<Equal<Parameters<typeof core.isRowLoaded>, [index: number]>>(true);

// Public commands dispatch without casts.
const commands: InfiniteScrollPublicCommand[] = [{ type: 'infiniteScroll.loadNext' }, { type: 'infiniteScroll.retry' }, { type: 'infiniteScroll.reload' }];
for (const command of commands) api.engine.dispatch(command);
api.engine.dispatch({ type: 'infiniteScroll.loadNext' });
// @ts-expect-error not an infinite scroll command
const wrong: InfiniteScrollPublicCommand = { type: 'infiniteScroll.loaded' };
void wrong;
