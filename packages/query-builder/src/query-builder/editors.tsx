'use client';

// Built-in value editors of QueryBuilder, composed from the other
// families' components: TextField (text), NumberField (numbers, `step`),
// DateField from `@salmonui/calendars/date-picker` (dates), Checkbox
// (booleans), Select for
// fixed `values` and a multiple creatable Combobox for `in` / `notIn` lists.
// Each editor gets the `editorProps.value` entries it takes (editor-props.ts).

import type { ReactNode } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { NumberField } from '@salmonui/inputs/number-field';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { DateField, type DateFieldProps } from '@salmonui/calendars/date-field';
import type { ComboboxValue as DropdownValue } from '@salmonui/dropdowns/combobox';
import { Select } from '@salmonui/dropdowns/select';
import { TextField } from '@salmonui/inputs/text-field';
import { LIST_OPERATORS } from '@salmonui/core/internal/query/operators';
import type { Json } from '@salmonui/core/internal/query/types';
import { propsOf } from './editor-props.js';
import { labelOf, parseText, valueOf, type FlatField } from './fields.js';
import type { QueryText } from './locale.js';

export interface EditorProps {
  readonly field: FlatField | undefined;
  readonly operator: string;
  readonly value: Json | undefined;
  readonly onChange: (value: Json | undefined) => void;
  readonly label: string;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly text: QueryText;
  readonly locale: string;
  readonly extra: Readonly<Record<string, unknown>> | undefined;
  /** A list operator (`in`, `notIn`, or a custom `list` operator). */
  readonly list: boolean;
}

const asDropdown = (v: unknown): DropdownValue | null => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null);

/** One scalar value editor for the field type. */
function ScalarEditor(props: EditorProps): ReactNode {
  const { field, value, onChange, label, invalid, disabled, text, locale, extra } = props;
  const type = field?.type ?? 'string';
  const values = field?.def.values;
  if (values?.length) {
    return (
      <Select
        {...propsOf(extra, 's')}
        aria-label={label}
        data={values}
        getItemValue={valueOf}
        getItemLabel={labelOf}
        value={asDropdown(value)}
        placeholder={label}
        disabled={disabled}
        onValueChange={(v) => onChange(v === null ? undefined : (v as Json))}
      />
    );
  }
  switch (type) {
    case 'number':
      return (
        <NumberField
          {...propsOf(extra, 'n')}
          aria-label={label}
          locale={locale}
          value={typeof value === 'number' ? value : null}
          step={field?.def.step}
          invalid={invalid || undefined}
          disabled={disabled}
          onValueChange={(n) => onChange(n === null ? undefined : n)}
        />
      );
    case 'date':
    case 'datetime':
      return (
        <DateField
          {...({
            ...propsOf(extra, 'd'),
            'aria-label': label,
            locale,
            ...(type === 'datetime' ? { granularity: 'minute' } : {}),
            value: typeof value === 'string' && value ? value : null,
            invalid,
            disabled,
            onValueChange: (v: { toString(): string } | null) => onChange(v ? v.toString() : undefined),
          } as DateFieldProps)}
        />
      );
    case 'boolean':
      return (
        <Checkbox {...propsOf(extra, 'b')} checked={value === true} disabled={disabled} invalid={invalid || undefined} onCheckedChange={(c) => onChange(c)}>
          {label}
        </Checkbox>
      );
    default:
      return <TextField {...propsOf(extra, 't')} aria-label={label} value={typeof value === 'string' ? value : value == null ? '' : String(value)} invalid={invalid || undefined} disabled={disabled} onValueChange={(t) => onChange(t)} />;
  }
}

/** The value editor of a rule: none, one, two (`between`) or a list. */
export function ValueEditor(props: EditorProps): ReactNode {
  const { field, operator, value, onChange, label, disabled, text, extra } = props;
  if (operator === 'between') {
    const pair = Array.isArray(value) ? value : [];
    const set = (i: number) => (v: Json | undefined) => {
      const next = [pair[0] ?? null, pair[1] ?? null];
      next[i] = v ?? null;
      onChange(next[0] === null && next[1] === null ? undefined : (next as Json));
    };
    return (
      <span className="salmon-query-builder__range">
        <ScalarEditor {...props} value={(pair[0] ?? undefined) as Json | undefined} onChange={set(0)} label={text('filterFrom')} />
        <ScalarEditor {...props} value={(pair[1] ?? undefined) as Json | undefined} onChange={set(1)} label={text('filterTo')} />
      </span>
    );
  }
  if (props.list || LIST_OPERATORS.has(operator)) {
    const list = (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]).map(asDropdown).filter((v): v is DropdownValue => v !== null);
    const values = field?.def.values;
    const commit = (next: readonly DropdownValue[]) => onChange(next.length ? (next as Json) : undefined);
    if (values?.length) {
      return <Select {...propsOf(extra, 's')} multiple aria-label={label} data={values} getItemValue={valueOf} getItemLabel={labelOf} value={list} placeholder={label} disabled={disabled} onValueChange={commit} />;
    }
    const type = field?.type ?? 'string';
    return (
      <Combobox
        {...propsOf(extra, 'c')}
        multiple
        creatable
        aria-label={label}
        data={list}
        value={list}
        disabled={disabled}
        placeholder={label}
        onValueChange={(next: readonly DropdownValue[]) => commit(next.map((v) => (type === 'string' ? v : (parseText(type, String(v)) as DropdownValue | undefined) ?? v)))}
      />
    );
  }
  return <ScalarEditor {...props} />;
}
