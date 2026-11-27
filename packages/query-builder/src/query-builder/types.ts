// Public types of `@salmonui/query-builder` (docs/site/content/inputs/query-builder.md).
import type { CSSProperties, ReactNode, Ref } from 'react';
import type { FormatOptions } from '@salmonui/core/format';
import type { FieldValidation } from '@salmonui/core/validation';
import type { Json, QueryGroup, QueryNode, QueryRule } from '@salmonui/core/internal/query/types';
import type { QueryBuilderLocaleText } from './locale.js';

export type { Json, QueryGroup, QueryNode, QueryRule };

/** Value type of a field; selects the default operators and value editor. */
export type QueryFieldType = 'string' | 'number' | 'date' | 'datetime' | 'boolean';

/** A fixed value of a field (`values`): a primitive, or a value with its label. */
export type QueryFieldValue = string | number | boolean | { readonly value: string | number | boolean; readonly label: string };

export interface QueryValueEditorContext {
  readonly rule: QueryRule & { readonly id: string };
  readonly field: QueryField | undefined;
  readonly operator: string;
  readonly value: Json | undefined;
  /** Writes the rule's value. */
  setValue(value: Json | undefined): void;
  /** Accessible name for the editor. */
  readonly label: string;
  readonly invalid: boolean;
  readonly disabled: boolean;
}

export interface QueryField {
  /** Field name; with `fields` it is the path segment of the children. */
  readonly field: string;
  readonly label?: string | undefined;
  /** Default `'string'`. */
  readonly type?: QueryFieldType | undefined;
  /** Operators offered (Data Grid filter operator names or custom ones); default per type (`operatorsFor`). */
  readonly operators?: readonly string[] | undefined;
  /** Fixed values: a Select (or a multiple Select for `in` / `notIn`). */
  readonly values?: readonly QueryFieldValue[] | undefined;
  /** Value of a new rule on this field. */
  readonly defaultValue?: Json | undefined;
  /** Display format of values (summary): a Data Grid format (`'N2'`, `'C2'`, `'yMMMd'`, `'dd/MM/yyyy'`) or format options. */
  readonly format?: string | FormatOptions | undefined;
  /** Step of the numeric editor. */
  readonly step?: number | undefined;
  /** Rules of the value (the Form rule vocabulary), checked by `validation` / `api.validate()`. */
  readonly validation?: FieldValidation | undefined;
  /** Group of the field in the field list. */
  readonly category?: string | undefined;
  /** Nested fields: paths `parent.child` with `pathSeparator`. A field with children is not selectable itself. */
  readonly fields?: readonly QueryField[] | undefined;
  /** Custom value editor. */
  readonly renderValueEditor?: ((ctx: QueryValueEditorContext) => ReactNode) | undefined;
}

/** A custom operator: labels and types here; evaluation through `filterRows` / the Data Grid filter module, SQL / Mongo through the converter hooks. */
export interface QueryOperator {
  readonly name: string;
  readonly label?: string | undefined;
  /** Field types that offer it; default every type. */
  readonly types?: readonly QueryFieldType[] | undefined;
  /** The operator takes no value. */
  readonly valueless?: boolean | undefined;
  /** The value is a list (like `in`). */
  readonly list?: boolean | undefined;
  /** Row test for `filterRows` (the core custom operator signature). */
  readonly evaluate?: ((cellValue: unknown, filterValue: Json, ctx: { readonly matchCase: boolean; readonly ignoreAccents: boolean }) => boolean) | undefined;
}

export type QueryBuilderAction = 'addCondition' | 'addGroup' | 'removeGroup' | 'removeCondition' | 'logic' | 'not' | 'edit' | 'clone' | 'lock' | 'move' | 'set' | 'reset';

export interface QueryBuilderChangeDetails {
  readonly source: 'pointer' | 'keyboard' | 'touch' | 'api';
  readonly reason: QueryBuilderAction;
  readonly action: QueryBuilderAction;
  /** The node the action acted on (the new node for add and clone). */
  readonly nodeId: string | null;
}

/** `onBeforeChange` event: cancellable. */
export interface QueryBuilderBeforeChangeEvent {
  readonly action: QueryBuilderAction;
  readonly nodeId: string | null;
  readonly previousValue: QueryGroup;
  readonly value: QueryGroup;
  readonly source: QueryBuilderChangeDetails['source'];
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export interface QueryBuilderDragEvent {
  readonly nodeId: string;
  /** Target group and index of the drop position (null while outside the tree). */
  readonly targetGroupId: string | null;
  readonly index: number;
}

/** `onDrop` event: cancellable. */
export interface QueryBuilderDropEvent extends QueryBuilderDragEvent {
  readonly source: 'pointer' | 'keyboard';
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

export interface QueryBuilderButtons {
  /** Remove buttons on rules. Default true. */
  readonly deleteRule?: boolean | undefined;
  /** Add-group buttons. Default true. */
  readonly addGroup?: boolean | undefined;
  /** Remove buttons on groups. Default true. */
  readonly deleteGroup?: boolean | undefined;
  /** Clone buttons on rules and groups. Default false. */
  readonly clone?: boolean | undefined;
  /** Lock buttons on rules and groups. Default false. */
  readonly lock?: boolean | undefined;
}

export interface QueryRuleRenderContext {
  readonly rule: QueryRule & { readonly id: string };
  readonly index: number;
  readonly parentId: string;
  readonly locked: boolean;
  readonly fieldPicker: ReactNode;
  readonly operatorPicker: ReactNode;
  readonly valueEditor: ReactNode;
  /** Remove, clone, lock and drag controls. */
  readonly actions: ReactNode;
  readonly errors: readonly string[];
  setRule(rule: QueryRule): void;
  remove(): void;
}

export interface QueryGroupHeaderContext {
  readonly group: QueryGroup & { readonly id: string };
  readonly depth: number;
  readonly locked: boolean;
  readonly isRoot: boolean;
  /** The default header: connector, NOT toggle, add / remove buttons. */
  readonly controls: ReactNode;
  /** Clone, lock and drag controls. */
  readonly actions: ReactNode;
}

/** Settings forwarded to the built-in editors. */
export interface QueryBuilderEditorProps {
  /** Props of the field Select. */
  readonly field?: Readonly<Record<string, unknown>> | undefined;
  /** Props of the operator Select. */
  readonly operator?: Readonly<Record<string, unknown>> | undefined;
  /** Props of the value editors (TextField, numeric field, DateField, Select, Combobox). */
  readonly value?: Readonly<Record<string, unknown>> | undefined;
}

export interface QueryBuilderApi {
  getValue(): QueryGroup;
  setValue(value: QueryGroup): void;
  /** The value without incomplete rules and empty groups. */
  getValidValue(): QueryGroup;
  getNode(id: string): QueryNode | null;
  /** Appends rules to the group `groupId` (default: the root); returns their ids. */
  addRules(rules: readonly QueryRule[], groupId?: string): string[];
  addGroups(groups: readonly QueryGroup[], groupId?: string): string[];
  remove(ids: string | readonly string[]): void;
  /** Copies a node next to itself (or into `parentId` at `index`); returns the copy's id. */
  clone(id: string, options?: { readonly parentId?: string; readonly index?: number }): string | null;
  lock(id: string, locked?: boolean): void;
  /** Validates every rule, shows inline errors and returns whether the value is valid. */
  validate(): boolean;
  /** Back to `defaultValue` (uncontrolled) or proposes it (controlled). */
  reset(): void;
  /** Moves focus to the first control. */
  focus(): void;
}

export interface QueryBuilderProps {
  readonly fields: readonly QueryField[];
  readonly value?: QueryGroup | undefined;
  readonly defaultValue?: QueryGroup | undefined;
  readonly onValueChange?: ((value: QueryGroup, details: QueryBuilderChangeDetails) => void) | undefined;
  readonly onBeforeChange?: ((event: QueryBuilderBeforeChangeEvent) => void) | undefined;
  /** Custom operators. */
  readonly operators?: readonly QueryOperator[] | undefined;
  /** NOT toggles on groups. Default false. */
  readonly notCondition?: boolean | undefined;
  readonly buttons?: QueryBuilderButtons | undefined;
  /** Maximum group nesting levels, the root included. Default 5. */
  readonly maxGroups?: number | undefined;
  /** A new group starts with one rule. Default true. */
  readonly addRuleToNewGroups?: boolean | undefined;
  /** A new rule starts with the first field. Default false. */
  readonly autoSelectField?: boolean | undefined;
  /** A rule gets its field's first operator when the field is picked. Default true. */
  readonly autoSelectOperator?: boolean | undefined;
  /** Field list order. Default `null` (as given). */
  readonly fieldSort?: 'asc' | 'desc' | null | undefined;
  /** Written to every condition (`matchCase`). */
  readonly matchCase?: boolean | undefined;
  /** Read-only sentence view with an Edit button. */
  readonly summary?: boolean | undefined;
  /**
   * Field picker: `'list'` (default) is a `Select` grouped by
   * `field.category`; `'tree'` is a `TreeSelect` with categories and nested
   * `field.fields` as parents (a lazy chunk).
   */
  readonly fieldPicker?: 'list' | 'tree' | undefined;
  /** Separator of nested field paths. Default `'.'`. */
  readonly pathSeparator?: string | undefined;
  /** Show errors of incomplete rules and field rules. */
  readonly validation?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  /** Drag reorder with handles and keyboard move commands (Alt+ArrowUp / Alt+ArrowDown on a handle). */
  readonly reorderable?: boolean | undefined;
  readonly onDragStart?: ((event: QueryBuilderDragEvent) => void) | undefined;
  /** Once per frame while dragging. */
  readonly onDrag?: ((event: QueryBuilderDragEvent) => void) | undefined;
  readonly onDrop?: ((event: QueryBuilderDropEvent) => void) | undefined;
  readonly renderRule?: ((ctx: QueryRuleRenderContext) => ReactNode) | undefined;
  readonly renderGroupHeader?: ((ctx: QueryGroupHeaderContext) => ReactNode) | undefined;
  readonly editorProps?: QueryBuilderEditorProps | undefined;
  readonly localeText?: Partial<QueryBuilderLocaleText> | undefined;
  /** Locale of value formatting (summary) and the editors. Default `'en-US'`. */
  readonly locale?: string | undefined;
  /** Form field name: a hidden input posts the value as JSON. */
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly id?: string | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly 'aria-labelledby'?: string | undefined;
  readonly dir?: 'ltr' | 'rtl' | undefined;
  readonly ref?: Ref<QueryBuilderApi> | undefined;
}
