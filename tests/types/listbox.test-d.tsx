// Type contract of `@salmonui/dropdowns/listbox` (built .d.ts through the
// exports map): item inference, the single / multiple value triads, events,
// remote sources and the pure list helpers.
import { createOfflineDataSource } from '@salmonui/data';
import { Listbox, LISTBOX_DEFAULT_LOCALE_TEXT, moveItems, reorderItems, type ListboxKey, type ListboxProps, type ListboxReorderEvent, type ListboxValueChangeEvent } from '@salmonui/dropdowns/listbox';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

interface Fruit {
  readonly id: number;
  readonly name: string;
}
const fruits: Fruit[] = [{ id: 1, name: 'Apple' }];

// Single selection: the value is one key or null.
export const single = (
  <Listbox
    data={fruits}
    getItemValue={(f) => f.id}
    getItemLabel={(f) => f.name}
    defaultValue={1}
    onValueChange={(value, event) => {
      expectType<Equal<typeof value, ListboxKey | null>>(true);
      expectType<Equal<typeof event, ListboxValueChangeEvent<Fruit>>>(true);
      expectType<Equal<typeof event.items, readonly Fruit[]>>(true);
    }}
    aria-label="Fruit"
  />
);

// Multiple selection: the value is an array.
export const multiple = (
  <Listbox
    data={fruits}
    multiple
    value={[1]}
    indicator="checkbox"
    onValueChange={(value) => {
      expectType<Equal<typeof value, readonly ListboxKey[]>>(true);
    }}
    reorderable
    onReorder={(event) => {
      expectType<Equal<typeof event, ListboxReorderEvent<Fruit>>>(true);
    }}
    aria-label="Fruit"
  />
);

// @ts-expect-error multiple selection takes an array value
export const wrongValue = <Listbox data={fruits} multiple value={1} aria-label="Fruit" />;

// Remote: any @salmonui/data source.
const source = createOfflineDataSource<Fruit>({ load: async () => fruits });
export const remote = <Listbox data={source} searchable searchFields={['name']} aria-label="Fruit" />;

// Primitive data.
export const strings: ListboxProps<string> = { data: ['a', 'b'], 'aria-label': 'Letters' };

// Pure helpers.
const [left, right] = moveItems(fruits, [] as Fruit[], [1], 0, (f) => f.id);
expectType<Equal<typeof left, Fruit[]>>(true);
expectType<Equal<typeof right, Fruit[]>>(true);
expectType<Equal<ReturnType<typeof reorderItems<string>>, string[]>>(true);
expectType<Equal<typeof LISTBOX_DEFAULT_LOCALE_TEXT.noData, string | { readonly [category in Intl.LDMLPluralRule]?: string }>>(true);

