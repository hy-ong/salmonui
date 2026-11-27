import type { CSSProperties, HTMLAttributes, ReactNode, Ref, RefObject } from 'react';
import type { DataSourceRequest, DataSourceResult, FilterEntry, SortDescriptor, WriteRequest, WriteResult } from '@salmonui/core/data';
import type { KanbanLocaleText } from './locale.js';

/** A card id, column key or swimlane key. */
export type KanbanKey = string | number;

/** Where a change came from. */
export type KanbanEventSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** A cancellable event: `preventDefault()` cancels the built-in action. */
export interface KanbanCancelableEvent {
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

/** One column of the board. */
export interface KanbanColumnDef {
  /** Column value that maps a card to this column (the `columnField` value). */
  readonly key?: KanbanKey | undefined;
  /** Several column values shown in one column; moves write the first. */
  readonly keys?: readonly KanbanKey[] | undefined;
  /** Header text; also the accessible name of the column. */
  readonly header: string;
  /** Shows the collapse toggle (default false). */
  readonly collapsible?: boolean | undefined;
  /** Shows the card count in the header (default true). */
  readonly count?: boolean | undefined;
  /** Replaces the header text content. Pure; the toggle, count and add button stay. */
  readonly renderHeader?: ((ctx: KanbanColumnContext) => ReactNode) | undefined;
  /** WIP minimum. */
  readonly min?: number | undefined;
  /** WIP maximum. */
  readonly max?: number | undefined;
  /** Shows an add button at the end of every cell of the column. */
  readonly addButton?: boolean | undefined;
  /** Cards may be dragged out of this column (default true). */
  readonly draggable?: boolean | undefined;
  /** Cards may be dropped into this column (default true). */
  readonly droppable?: boolean | undefined;
  /** Columns that cards of this column may move to (default: every droppable column). */
  readonly allowedTargets?: readonly KanbanKey[] | undefined;
  /** Hides the column. */
  readonly hidden?: boolean | undefined;
  readonly className?: string | undefined;
}

/** `renderHeader` argument. */
export interface KanbanColumnContext {
  readonly key: KanbanKey;
  readonly header: string;
  readonly count: number;
  readonly collapsed: boolean;
  readonly limit: KanbanLimitState;
}

/** WIP state of a column or cell. */
export type KanbanLimitState = 'over' | 'under' | null;

/** A stacked header over consecutive columns. */
export interface KanbanColumnGroup {
  readonly header: string;
  readonly columns: readonly KanbanKey[];
}

/** A declared swimlane (order, label, and `showEmpty`). */
export interface KanbanSwimlaneDef {
  readonly key: KanbanKey;
  readonly label?: string | undefined;
}

/** `swimlanes.renderHeader` argument. */
export interface KanbanSwimlaneContext {
  /** `null` for the unassigned lane. */
  readonly key: KanbanKey | null;
  readonly label: string;
  readonly count: number;
}

/** Swimlane options. */
export interface KanbanSwimlanes {
  /** Card field holding the swimlane key. */
  readonly field: string;
  /** Card field holding the lane label (default: the key). */
  readonly labelField?: string | undefined;
  /** Declared lanes: their order and labels; with `showEmpty` they render without cards. */
  readonly lanes?: readonly KanbanSwimlaneDef[] | undefined;
  readonly renderHeader?: ((ctx: KanbanSwimlaneContext) => ReactNode) | undefined;
  /** Lane order: by label, or a comparator (default: declared lanes, then first appearance). */
  readonly sort?: 'asc' | 'desc' | ((a: KanbanSwimlaneContext, b: KanbanSwimlaneContext) => number) | undefined;
  /** Renders declared lanes that have no cards (default false). */
  readonly showEmpty?: boolean | undefined;
  /** Shows the card count in the lane header (default true). */
  readonly count?: boolean | undefined;
  /** Cards without a lane key go to an "Unassigned" lane (default true); false hides them. */
  readonly unassigned?: boolean | undefined;
  /** Lane headers stick to the top while the board scrolls. */
  readonly sticky?: boolean | undefined;
  /** Cards may be dragged across lanes (default false). */
  readonly draggable?: boolean | undefined;
}

/** Default card fields. */
export interface KanbanCardFields {
  readonly headerField?: string | undefined;
  readonly contentField?: string | undefined;
  /** Comma-separated string or string array. */
  readonly tagsField?: string | undefined;
  /** A CSS color (data color, used as given) for the card's accent edge. */
  readonly accentField?: string | undefined;
}

/** `renderCard`, `getCardProps` and tooltip argument. */
export interface KanbanCardContext<T> {
  readonly card: T;
  readonly id: KanbanKey;
  readonly columnKey: KanbanKey;
  /** `null` without swimlanes or in the unassigned lane. */
  readonly swimlaneKey: KanbanKey | null;
  /** Position in its cell (0-based). */
  readonly index: number;
  readonly selected: boolean;
}

/** Pure per-card props from `getCardProps`. */
export interface KanbanCardProps {
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly title?: string | undefined;
  readonly [data: `data-${string}`]: string | number | boolean | undefined;
}

/** Card sort within a cell. */
export interface KanbanSort<T> {
  /** `data`: array order (default); `field`: by `field`; `custom`: `comparator`. */
  readonly by: 'data' | 'field' | 'custom';
  readonly field?: string | undefined;
  readonly direction?: 'asc' | 'desc' | undefined;
  readonly comparator?: ((a: T, b: T) => number) | undefined;
}

/** A remote or local `@salmonui/data` source (the structural `DataSource` contract). */
export interface KanbanDataSource<T> {
  read(request: DataSourceRequest): DataSourceResult<T> | Promise<DataSourceResult<T>>;
  write?(request: WriteRequest<T>): Promise<WriteResult<T>>;
  subscribe?(listener: (event: unknown) => void): () => void;
}

/** Base query merged into every source read. */
export interface KanbanQuery {
  readonly filters?: readonly FilterEntry[] | undefined;
  readonly sorting?: readonly SortDescriptor[] | undefined;
}

/** A cell position: column and swimlane. */
export interface KanbanCellRef {
  readonly columnKey: KanbanKey;
  readonly swimlaneKey: KanbanKey | null;
}

/** `onCardMove`. */
export interface KanbanCardMoveEvent<T> extends KanbanCancelableEvent {
  /** The first moved card. */
  readonly cardId: KanbanKey;
  readonly cardIds: readonly KanbanKey[];
  /** Moved cards before the move. */
  readonly cards: readonly T[];
  readonly from: KanbanCellRef;
  readonly to: KanbanCellRef;
  /** Insertion index among the other cards of the target cell. */
  readonly index: number;
  readonly source: KanbanEventSource;
  /** `'in'` on the receiving board and `'out'` on the source board of a drop between boards. */
  readonly external: 'in' | 'out' | null;
}

/** `onCardChange`: every write the board makes. */
export interface KanbanCardChangeEvent<T> extends KanbanCancelableEvent {
  readonly kind: 'add' | 'update' | 'delete' | 'move';
  /** The first card (new value; the deleted card for `delete`). */
  readonly card: T;
  readonly cards: readonly T[];
  /** Previous values (empty for `add`). */
  readonly previous: readonly T[];
  readonly source: KanbanEventSource;
}

/** `onCardAdd`. */
export interface KanbanCardAddEvent extends KanbanCancelableEvent, KanbanCellRef {
  readonly source: KanbanEventSource;
}

/** `onCardClick`, `onCardDoubleClick`. */
export interface KanbanCardClickEvent<T> extends KanbanCancelableEvent {
  readonly card: T;
  readonly id: KanbanKey;
  readonly source: KanbanEventSource;
}

/** Second argument of the triad callbacks. */
export interface KanbanChangeDetails {
  readonly source: KanbanEventSource;
}

/** An external drop target: an element outside the board that accepts cards. */
export interface KanbanDropTarget<T> {
  readonly ref: RefObject<Element | null>;
  /** Accepts or refuses the dragged cards (default: accepts). */
  accept?(cards: readonly T[]): boolean;
  /** `preventDefault()` keeps the cards on the board; otherwise they are removed (a `delete` write). */
  onDrop(event: KanbanExternalDropEvent<T>): void;
}

/** `KanbanDropTarget.onDrop` argument. */
export interface KanbanExternalDropEvent<T> extends KanbanCancelableEvent {
  readonly cardIds: readonly KanbanKey[];
  readonly cards: readonly T[];
  /** The element under the pointer, inside the target. */
  readonly target: Element;
  readonly clientX: number;
  readonly clientY: number;
}

/** A field of the built-in editor. */
export interface KanbanEditorField<T> {
  readonly field: string;
  readonly label: string;
  readonly kind?: 'text' | 'select' | 'number' | 'textarea' | undefined;
  /** Options of a `select` field (default for the column and swimlane fields: the columns and lanes). */
  readonly options?: readonly { readonly value: KanbanKey; readonly label: string }[] | undefined;
  readonly required?: boolean | undefined;
  /** Returns an error message, or nothing when the value is valid. */
  readonly validate?: ((value: unknown, draft: T) => string | null | undefined) | undefined;
}

/** `renderEditor` argument. */
export interface KanbanEditorContext<T> {
  /** The edited card, or the draft of a new card. */
  readonly card: T;
  readonly isNew: boolean;
  save(next: T): void;
  cancel(): void;
  /** Deletes the edited card (no-op for a new card). */
  delete(): void;
}

/** What the editor shows: a card id, `'new'`, or `null` when closed. */
export type KanbanEditing = KanbanKey | 'new' | null;

/** Tooltip options. */
export interface KanbanTooltip<T> {
  /** Tooltip content (default: the header and content fields). */
  readonly render?: ((ctx: KanbanCardContext<T>) => ReactNode) | undefined;
  /** Delay before showing, ms (default 500). */
  readonly delay?: number | undefined;
}

/** Commands props cannot express (`ref`). */
export interface KanbanApi {
  readonly element: HTMLDivElement | null;
  /** Moves focus (the board's tab stop) to a card, scrolling it into view. */
  focusCard(id: KanbanKey): void;
  /** Scrolls a card into view without focusing it. */
  scrollToCard(id: KanbanKey): void;
  /** Opens the editor for a card, or a new card in `at` (default: the first column). */
  openEditor(id: KanbanKey | 'new', at?: Partial<KanbanCellRef>): void;
  closeEditor(): void;
}

export interface KanbanProps<T> extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onChange' | 'defaultValue'> {
  /** Cards (an array, copied for built-in writes), or a `@salmonui/data` source. A new array resets the board's copy. */
  readonly data: readonly T[] | KanbanDataSource<T>;
  readonly getCardId: (card: T) => KanbanKey;
  /** Card field that holds the column key. */
  readonly columnField: string;
  readonly columns?: readonly KanbanColumnDef[] | undefined;
  /** `KanbanColumn` elements: the declarative alternative to `columns`. */
  readonly children?: ReactNode;
  /** Shows columns without cards (default true). */
  readonly showEmptyColumns?: boolean | undefined;
  readonly collapsedColumns?: readonly KanbanKey[] | undefined;
  readonly defaultCollapsedColumns?: readonly KanbanKey[] | undefined;
  readonly onCollapsedColumnsChange?: ((value: readonly KanbanKey[], details: KanbanChangeDetails) => void) | undefined;
  /** WIP limits count per column (default) or per swimlane cell. */
  readonly limitScope?: 'column' | 'swimlane' | undefined;
  readonly columnGroups?: readonly KanbanColumnGroup[] | undefined;
  readonly swimlanes?: KanbanSwimlanes | undefined;
  readonly card?: KanbanCardFields | undefined;
  /** Replaces the card body. Pure; called for rendered cards only. */
  readonly renderCard?: ((ctx: KanbanCardContext<T>) => ReactNode) | undefined;
  /** Fixed card height in px, or `'auto'` (default) for measured heights. */
  readonly cardHeight?: number | 'auto' | undefined;
  readonly getCardProps?: ((ctx: KanbanCardContext<T>) => KanbanCardProps | undefined) | undefined;
  /** Default `'single'`. */
  readonly selection?: 'none' | 'single' | 'multiple' | undefined;
  readonly selectedCards?: readonly KanbanKey[] | undefined;
  readonly defaultSelectedCards?: readonly KanbanKey[] | undefined;
  readonly onSelectedCardsChange?: ((value: readonly KanbanKey[], details: KanbanChangeDetails) => void) | undefined;
  readonly sort?: KanbanSort<T> | undefined;
  /** Client-side card filter (pure). */
  readonly filter?: ((card: T) => boolean) | undefined;
  /** Base query of source reads; a new identity re-reads, so memoize it (as `data` for a source). */
  readonly query?: KanbanQuery | undefined;
  /** Forces the loading state. */
  readonly loading?: boolean | undefined;
  /** Enables pointer and keyboard card drag. */
  readonly cardsDraggable?: boolean | undefined;
  readonly onCardMove?: ((event: KanbanCardMoveEvent<T>) => void) | undefined;
  /** Boards with the same group accept each other's cards. */
  readonly dragGroup?: string | undefined;
  readonly dropTargets?: readonly KanbanDropTarget<T>[] | undefined;
  /** Enables column reorder by pointer and Alt+Arrow keys. */
  readonly columnsReorderable?: boolean | undefined;
  readonly columnOrder?: readonly KanbanKey[] | undefined;
  readonly defaultColumnOrder?: readonly KanbanKey[] | undefined;
  readonly onColumnOrderChange?: ((value: readonly KanbanKey[], details: KanbanChangeDetails) => void) | undefined;
  readonly onCardChange?: ((event: KanbanCardChangeEvent<T>) => void) | undefined;
  readonly onCardAdd?: ((event: KanbanCardAddEvent) => void) | undefined;
  /** Draft of a new card in a cell (default: `{ id: 'new-<n>', [columnField], [swimlanes.field] }`); called once when the editor opens for a new card, never during render. */
  readonly newCard?: ((at: KanbanCellRef) => T) | undefined;
  /** Built-in editor: `true` edits the card fields, or a field list. */
  readonly editor?: boolean | { readonly fields: readonly KanbanEditorField<T>[] } | undefined;
  readonly renderEditor?: ((ctx: KanbanEditorContext<T>) => ReactNode) | undefined;
  readonly editing?: KanbanEditing | undefined;
  readonly defaultEditing?: KanbanEditing | undefined;
  readonly onEditingChange?: ((value: KanbanEditing, details: KanbanChangeDetails) => void) | undefined;
  readonly tooltip?: boolean | KanbanTooltip<T> | undefined;
  /** Per-column card virtualization; ignored with swimlanes. */
  readonly virtualization?: boolean | undefined;
  /** Board height (px or CSS length); columns scroll inside it. */
  readonly height?: number | string | undefined;
  readonly onCardClick?: ((event: KanbanCardClickEvent<T>) => void) | undefined;
  /** Default action: opens the editor (with `editor`). */
  readonly onCardDoubleClick?: ((event: KanbanCardClickEvent<T>) => void) | undefined;
  /** Read and write failures of a source (`writeError` reverts the optimistic change). */
  readonly onDataError?: ((error: unknown, kind: 'read' | 'write') => void) | undefined;
  readonly localeText?: Partial<KanbanLocaleText> | undefined;
  readonly ref?: Ref<KanbanApi> | undefined;
}

/** Props of `KanbanColumn`: a column declared as an element (`columnKey` stands for `key`, which React reserves). */
export interface KanbanColumnProps extends Omit<KanbanColumnDef, 'key'> {
  readonly columnKey?: KanbanKey | undefined;
}
