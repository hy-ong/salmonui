// Type contract of `@salmonui/query-builder` and its converters
// (docs/site/content/inputs/query-builder.md). Compiles against dist/*.d.ts.
import { createRef, type AllHTMLAttributes, type AriaAttributes, type DOMAttributes } from 'react';
import { filterRows, operatorsFor, QueryBuilder, type QueryBuilderApi, type QueryBuilderProps, type QueryGroup } from '@salmonui/query-builder';
import type { CheckboxProps } from '@salmonui/inputs/checkbox';
import type { ComboboxProps } from '@salmonui/dropdowns/combobox';
import type { DateFieldProps } from '@salmonui/calendars/date-picker';
import type { NumberFieldProps } from '@salmonui/inputs/number-field';
import type { SelectProps } from '@salmonui/dropdowns/select';
import type { TextFieldProps } from '@salmonui/inputs/text-field';
import type { EDITOR_PROPS } from '../../packages/query-builder/dist/query-builder/editor-props.js';
import { fromSql, toSql, type SqlResult } from '@salmonui/query-builder/sql';
import { fromMongo, toMongo } from '@salmonui/query-builder/mongo';
import type { DataGridFilterGroup } from '@salmonui/data-grid';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

const value: QueryGroup = { logic: 'and', not: true, filters: [{ field: 'a', operator: 'equal', value: 1 }, { logic: 'or', filters: [] }] };
// a QueryGroup is a Data Grid filter group.
export const asGrid: DataGridFilterGroup = value;

const ref = createRef<QueryBuilderApi>();
export const builder = (
  <QueryBuilder
    ref={ref}
    fields={[{ field: 'a', type: 'number', step: 2, validation: { min: 0 } }, { field: 'b', fields: [{ field: 'c' }] }]}
    value={value}
    onValueChange={(v, d) => void [v.logic, d.action, d.source]}
    onBeforeChange={(e) => e.preventDefault()}
    buttons={{ clone: true, lock: true }}
    fieldSort="asc"
  />
);
// Optional props accept an explicit `undefined` (exactOptionalPropertyTypes).
export const explicitUndefined = (
  <QueryBuilder
    fields={[{ field: 'a', label: undefined, type: undefined, operators: undefined, values: undefined, defaultValue: undefined, format: undefined, step: undefined, validation: undefined, category: undefined, fields: undefined, renderValueEditor: undefined }]}
    value={undefined}
    defaultValue={undefined}
    onValueChange={undefined}
    onBeforeChange={undefined}
    operators={[{ name: 'odd', label: undefined, types: undefined, valueless: undefined, list: undefined, evaluate: undefined }]}
    notCondition={undefined}
    buttons={{ deleteRule: undefined, addGroup: undefined, deleteGroup: undefined, clone: undefined, lock: undefined }}
    maxGroups={undefined}
    addRuleToNewGroups={undefined}
    autoSelectField={undefined}
    autoSelectOperator={undefined}
    fieldSort={undefined}
    matchCase={undefined}
    summary={undefined}
    fieldPicker={undefined}
    pathSeparator={undefined}
    validation={undefined}
    readOnly={undefined}
    disabled={undefined}
    reorderable={undefined}
    onDragStart={undefined}
    onDrag={undefined}
    onDrop={undefined}
    renderRule={undefined}
    renderGroupHeader={undefined}
    editorProps={{ field: undefined, operator: undefined, value: undefined }}
    localeText={undefined}
    locale={undefined}
    name={undefined}
    form={undefined}
    id={undefined}
    className={undefined}
    style={undefined}
    aria-label={undefined}
    aria-labelledby={undefined}
    dir={undefined}
    ref={undefined}
  />
);
// A props object built with optional values spreads as is.
const optional: QueryBuilderProps = { fields: [], value: undefined, buttons: undefined, editorProps: undefined };
export const spread = <QueryBuilder {...optional} />;

// The editor prop table equals the non-DOM props of each built-in
// value editor, so a new editor prop is routed, not leaked to the DOM.
type Keys<T> = T extends unknown ? keyof T : never;
type Dom = keyof AllHTMLAttributes<HTMLElement> | keyof AriaAttributes | keyof DOMAttributes<HTMLElement> | 'ref' | 'key';
type Own<P> = Exclude<Keys<P>, Dom>;
type Words<S extends string> = S extends `${infer A} ${infer B}` ? A | Words<B> : S;
type Table = typeof EDITOR_PROPS;
type Listed<C extends string> = { [K in keyof Table]: K extends `${string}${C}${string}` ? Words<Table[K]> : never }[keyof Table];
expectType<Equal<Listed<'t'>, Own<TextFieldProps>>>(true);
expectType<Equal<Listed<'n'>, Own<NumberFieldProps>>>(true);
expectType<Equal<Listed<'d'>, Own<DateFieldProps>>>(true);
expectType<Equal<Listed<'b'>, Own<CheckboxProps>>>(true);
expectType<Equal<Listed<'s'>, Own<SelectProps<unknown>>>>(true);
expectType<Equal<Listed<'c'>, Own<ComboboxProps<unknown>>>>(true);

// @ts-expect-error unknown field type
export const badType = <QueryBuilder fields={[{ field: 'a', type: 'money' }]} />;
// @ts-expect-error fieldSort is 'asc' | 'desc' | null
export const badSort = <QueryBuilder fields={[]} fieldSort="up" />;

const sql: SqlResult = toSql(value, { dialect: 'postgres', named: true });
expectType<Equal<ReturnType<typeof fromSql>, QueryGroup>>(true);
export const back = fromSql(sql.sql, { named: true, params: sql.params });
export const mongo = fromMongo(toMongo(value));
export const ops: readonly string[] = operatorsFor('date');
export const rows: { a: number }[] = filterRows([{ a: 1 }], value);
export const rowsUndefined = filterRows([{ a: 1 }], value, [], { pathSeparator: undefined, matchCase: undefined, ignoreAccents: undefined, operators: undefined });
