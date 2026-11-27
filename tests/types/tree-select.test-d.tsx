// Type contract of `@salmonui/dropdowns/tree-select` (built .d.ts through the
// exports map): item inference, the single / multiple value triads, the
// expansion triad and the tree accessors.
import { TreeSelect, TREE_SELECT_DEFAULT_LOCALE_TEXT, type TreeSelectExpandedChangeEvent, type TreeSelectLocaleText, type TreeSelectValue, type TreeSelectValueChangeEvent } from '@salmonui/dropdowns/tree-select';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

interface Folder {
  readonly id: number;
  readonly name: string;
  readonly parent: number | null;
  readonly children?: readonly Folder[];
}
const folders: Folder[] = [{ id: 1, name: 'Root', parent: null }];

// Single selection: the value is one node value or null.
export const single = (
  <TreeSelect
    data={folders}
    getItemValue={(f) => f.id}
    getItemLabel={(f) => f.name}
    getChildren={(f) => f.children}
    defaultValue={1}
    onValueChange={(value, event) => {
      expectType<Equal<typeof value, TreeSelectValue | null>>(true);
      expectType<Equal<typeof event, TreeSelectValueChangeEvent<Folder>>>(true);
      expectType<Equal<typeof event.items, readonly Folder[]>>(true);
    }}
    onExpandedChange={(expanded, event) => {
      expectType<Equal<typeof expanded, readonly TreeSelectValue[]>>(true);
      expectType<Equal<typeof event, TreeSelectExpandedChangeEvent<Folder>>>(true);
    }}
    aria-label="Folder"
  />
);

// Multiple selection with checkboxes over flat data: the value is an array.
export const multiple = (
  <TreeSelect
    data={folders}
    multiple
    indicator="checkbox"
    getItemValue={(f) => f.id}
    getParentId={(f) => f.parent}
    loadChildren={async (f, { signal }) => {
      expectType<Equal<typeof f, Folder>>(true);
      expectType<Equal<typeof signal, AbortSignal>>(true);
      return [];
    }}
    value={[1]}
    valueDisplay="chips"
    onValueChange={(value) => {
      expectType<Equal<typeof value, readonly TreeSelectValue[]>>(true);
    }}
    aria-label="Folders"
  />
);

// @ts-expect-error a single TreeSelect takes one value, not an array.
export const wrongValue = <TreeSelect data={folders} value={[1]} aria-label="x" />;

export const text: TreeSelectLocaleText = TREE_SELECT_DEFAULT_LOCALE_TEXT;
