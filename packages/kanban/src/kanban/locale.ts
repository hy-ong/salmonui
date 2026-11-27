/** Static texts of `Kanban`; `{param}` templates. Plain JSON, safe to pass from a server component. */
export interface KanbanLocaleText {
  /** `aria-roledescription` of the board grid. */
  readonly board: string;
  /** `aria-roledescription` of a card. */
  readonly card: string;
  /** `{count}`: accessible card count of a column or swimlane. */
  readonly count: string;
  /** `{min}`: WIP minimum shown in the column header. */
  readonly limitMin: string;
  /** `{max}`: WIP maximum shown in the column header. */
  readonly limitMax: string;
  /** `{column}`, `{max}`, `{count}`: announced when a column goes over its maximum. */
  readonly overLimit: string;
  /** `{column}`, `{min}`, `{count}`: announced when a column goes under its minimum. */
  readonly underLimit: string;
  /** `{column}` */
  readonly collapse: string;
  /** `{column}` */
  readonly expand: string;
  /** `{column}`: accessible name of an add button. */
  readonly addCard: string;
  /** Visible text of an add button. */
  readonly add: string;
  readonly unassigned: string;
  readonly empty: string;
  readonly loading: string;
  readonly loadError: string;
  readonly writeError: string;
  /** Description of every draggable card. */
  readonly dragInstructions: string;
  /** `{card}`, `{position}` */
  readonly lifted: string;
  /** `{column}`, `{lane}`, `{index}`, `{count}` (`{lane}` is empty without swimlanes). */
  readonly position: string;
  /** `{card}`, `{position}` */
  readonly dropped: string;
  /** `{card}` */
  readonly cancelled: string;
  /** Mobile column picker label. */
  readonly columnPicker: string;
  /** `{column}`: the column grip button with `columnsReorderable`. */
  readonly moveColumn: string;
  /** `{column}`, `{index}`, `{count}` */
  readonly columnMoved: string;
  readonly editTitle: string;
  readonly newTitle: string;
  readonly save: string;
  readonly cancel: string;
  readonly delete: string;
  /** `{label}` */
  readonly required: string;
  /** Labels of the default editor fields. */
  readonly fieldHeader: string;
  readonly fieldContent: string;
  readonly fieldColumn: string;
  readonly fieldSwimlane: string;
}

export const KANBAN_DEFAULT_LOCALE_TEXT: KanbanLocaleText = Object.freeze({
  board: 'board',
  card: 'card',
  count: '{count} cards',
  limitMin: 'Min {min}',
  limitMax: 'Max {max}',
  overLimit: '{column} is over its limit of {max} ({count} cards)',
  underLimit: '{column} is under its minimum of {min} ({count} cards)',
  collapse: 'Collapse {column}',
  expand: 'Expand {column}',
  addCard: 'Add card to {column}',
  add: 'Add card',
  unassigned: 'Unassigned',
  empty: 'No cards',
  loading: 'Loading…',
  loadError: 'Failed to load cards',
  writeError: 'The change could not be saved',
  dragInstructions: 'Press Space to pick up. Arrow keys move, Space drops, Escape cancels.',
  lifted: 'Picked up {card}. {position}',
  position: '{column}{lane}, position {index} of {count}',
  dropped: '{card} dropped. {position}',
  cancelled: 'Move cancelled, {card} returned',
  columnPicker: 'Column',
  moveColumn: 'Move column {column}',
  columnMoved: '{column} moved to position {index} of {count}',
  editTitle: 'Edit card',
  newTitle: 'New card',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  required: '{label} is required',
  fieldHeader: 'Title',
  fieldContent: 'Description',
  fieldColumn: 'Column',
  fieldSwimlane: 'Swimlane',
});

/** `{param}` substitution. */
export function formatKanbanText(template: string, params: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => (key in params ? String(params[key]) : all));
}
