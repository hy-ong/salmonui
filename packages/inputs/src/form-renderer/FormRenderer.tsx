'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type SubmitEvent } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '../checkbox/Checkbox.js';
import { Field } from '../form/Field.js';
import { Form, type FormProps, type FormValidationResult } from '../form/Form.js';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { assignRef } from '@salmonui/core/internal/form';
import { useLocaleText } from '@salmonui/core/internal/locale';
import type { FieldSize, FieldValidationText } from '../internal/field/field.js';
import { NumberField } from '../number-field/NumberField.js';
import { Radio, RadioGroup } from '../radio-group/RadioGroup.js';
import { Select } from '@salmonui/dropdowns/select';
import { Switch } from '../switch/Switch.js';
import { TextArea, TextField } from '../text-field/TextField.js';
import { dataOf, rowsOf, rulesOf, widgetOf, type FormRendererData, type FormSchema, type FormSchemaProperty, type FormUiField, type FormUiSchema, type FormUiWidget } from './schema.js';
import type { FieldValidation } from '@salmonui/core/validation';

/** Second argument of `onSubmit`: errors keyed by property name. */
export interface FormRendererSubmitDetails {
  readonly isValid: boolean;
  readonly errors: Readonly<Record<string, readonly string[]>>;
}

/** Validation strings (`validation*` keys, shared with every field) and the default submit label. */
export type FormRendererLocaleText = FieldValidationText & { readonly submit?: string };

export interface FormRendererProps extends Omit<FormProps, 'onSubmit' | 'children'> {
  /** JSON Schema subset. */
  readonly schema: FormSchema;
  /** Layout and widget choices. */
  readonly uiSchema?: FormUiSchema | undefined;
  /** Every submit, valid or not, with the data typed by the schema. The native submit is prevented unless `action` is set. */
  readonly onSubmit?: ((data: FormRendererData, details: FormRendererSubmitDetails, event: SubmitEvent<HTMLFormElement> | null) => void) | undefined;
  /** Rendered after the fields, before the submit button. */
  readonly children?: ReactNode;
  /** Metric set of every field and the submit button. Default `'md'`. */
  readonly size?: FieldSize | undefined;
  readonly localeText?: FormRendererLocaleText | undefined;
}

interface Plan {
  readonly name: string;
  readonly property: FormSchemaProperty;
  readonly ui: FormUiField | undefined;
  readonly widget: FormUiWidget;
  readonly rules: FieldValidation | undefined;
  readonly required: boolean;
}

interface FieldPlanProps {
  readonly plan: Plan;
  readonly size: FieldSize | undefined;
  readonly localeText: FieldValidationText | undefined;
}

const VALID: FormRendererSubmitDetails = Object.freeze({ isValid: true, errors: Object.freeze({}) });

const optionsOf = (plan: Plan): { readonly value: string | number; readonly label: string }[] => (plan.property.enum ?? []).map((value, i) => ({ value, label: plan.ui?.enumLabels?.[i] ?? String(value) }));

/** `Select` has no field parts of its own, so `Field` gives it the label, rules and errors. */
function SelectField({ plan, size, localeText }: FieldPlanProps): ReactNode {
  const { name, property, ui, rules } = plan;
  const initial = property.default === undefined || typeof property.default === 'boolean' ? null : property.default;
  const [value, setValue] = useState<string | number | null>(initial);
  const options = useMemo(() => optionsOf(plan), [plan]);
  return (
    <Field name={name} label={ui?.label ?? property.title ?? name} description={ui?.description ?? property.description} validation={rules} value={value ?? ''} disabled={ui?.disabled} size={size} localeText={localeText}>
      {({ inputProps }) => (
        <Select
          data={options}
          id={inputProps.id}
          name={name}
          defaultValue={initial}
          onValueChange={(next) => setValue(next as string | number | null)}
          {...(ui?.placeholder === undefined ? null : { placeholder: ui.placeholder })}
          disabled={ui?.disabled === true}
          readOnly={ui?.readOnly === true}
          required={plan.required}
          aria-describedby={inputProps['aria-describedby']}
          aria-invalid={inputProps['aria-invalid']}
          aria-errormessage={inputProps['aria-errormessage']}
          onBlur={inputProps.onBlur}
        />
      )}
    </Field>
  );
}

function FieldOf({ plan, size, localeText }: FieldPlanProps): ReactNode {
  const { name, property, ui, widget, rules, required } = plan;
  const label = ui?.label ?? property.title ?? name;
  const description = ui?.description ?? property.description;
  const common = { name, description, validation: rules, size, localeText, disabled: ui?.disabled };
  const text = typeof property.default === 'string' ? property.default : property.default === undefined ? undefined : String(property.default);
  switch (widget) {
    case 'text':
    case 'password':
      return (
        <TextField
          {...common}
          label={label}
          type={widget === 'password' ? 'password' : property.format === 'email' ? 'email' : property.format === 'uri' ? 'url' : 'text'}
          defaultValue={text}
          placeholder={ui?.placeholder}
          readOnly={ui?.readOnly}
          autoComplete={ui?.autoComplete}
          required={required || undefined}
        />
      );
    case 'textarea':
      return <TextArea {...common} label={label} defaultValue={text} placeholder={ui?.placeholder} readOnly={ui?.readOnly} autoComplete={ui?.autoComplete} required={required || undefined} />;
    case 'number':
      return (
        <NumberField
          {...common}
          label={label}
          defaultValue={typeof property.default === 'number' ? property.default : null}
          min={property.minimum}
          max={property.maximum}
          // Out-of-range values are reported by the minimum / maximum rules, never clamped silently.
          clampBehavior="none"
          decimals={property.type === 'integer' ? 0 : undefined}
          placeholder={ui?.placeholder}
          readOnly={ui?.readOnly}
          required={required || undefined}
        />
      );
    case 'checkbox':
    case 'switch': {
      const Toggle = widget === 'switch' ? Switch : Checkbox;
      return (
        <Toggle {...common} defaultChecked={property.default === true} required={property.const === true || undefined}>
          {label}
        </Toggle>
      );
    }
    case 'radio':
      return (
        <RadioGroup {...common} label={label} defaultValue={text ?? null} readOnly={ui?.readOnly} required={required || undefined} orientation="horizontal">
          {optionsOf(plan).map((o) => (
            <Radio key={String(o.value)} value={String(o.value)}>
              {o.label}
            </Radio>
          ))}
        </RadioGroup>
      );
    case 'select':
      return <SelectField plan={plan} size={size} localeText={localeText} />;
  }
}

/**
 * A form rendered from a JSON Schema subset and a UI schema:
 * Salmon fields inside `Form`, laid out in rows and
 * columns, validated by the shared rule compiler, submitted as typed data.
 * Fields are uncontrolled; the renderer re-renders only when its props change.
 */
export function FormRenderer(props: FormRendererProps): ReactNode {
  const { schema, uiSchema, onSubmit, children, size, localeText: ownText, className, onValidate, onBeforeValidate, ref, ...rest } = props;
  const localeText = useLocaleText('formRenderer', ownText);
  const node = useRef<HTMLFormElement | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  // The result of the submit in progress (`onValidate` runs before the native submit).
  const result = useRef<FormRendererSubmitDetails | null>(null);
  const plan = useMemo(() => {
    const required = new Set(schema.required ?? []);
    const byName = new Map<string, Plan>();
    for (const [name, property] of Object.entries(schema.properties)) {
      const ui = uiSchema?.fields?.[name];
      const widget = widgetOf(property, ui);
      if (!widget) continue;
      byName.set(name, { name, property, ui, widget, rules: rulesOf(property, required.has(name)), required: required.has(name) && property.type !== 'boolean' });
    }
    const rows = rowsOf(schema, uiSchema)
      .map((row) => row.filter((n) => byName.has(n)).map((n) => byName.get(n) as Plan))
      .filter((row) => row.length > 0);
    return rows;
  }, [schema, uiSchema]);

  useEffect(() => {
    if (!DEV) return;
    for (const [name, p] of Object.entries(schema.properties)) if (!widgetOf(p, uiSchema?.fields?.[name])) warnOnce(`form-renderer-type-${String(p.type)}`, `FormRenderer: property "${name}" has an unsupported type "${String(p.type)}" and is not rendered.`);
    for (const row of uiSchema?.layout ?? []) for (const n of typeof row === 'string' ? [row] : row) if (!(n in schema.properties)) warnOnce(`form-renderer-layout-${n}`, `FormRenderer: layout names "${n}", which is not a schema property.`);
  }, [schema, uiSchema]);

  const emit = (form: HTMLFormElement, details: FormRendererSubmitDetails, event: SubmitEvent<HTMLFormElement> | null): void => {
    latest.current.onSubmit?.(dataOf(new FormData(form), latest.current.schema), details, event);
  };
  const submit = uiSchema?.submit;
  const labelled = rest['aria-label'] !== undefined || rest['aria-labelledby'] !== undefined;
  return (
    <Form
      {...rest}
      ref={(el: HTMLFormElement | null) => {
        node.current = el;
        assignRef(ref as never, el);
      }}
      aria-label={labelled ? rest['aria-label'] : schema.title}
      className={className ? `salmon-form-renderer ${className}` : 'salmon-form-renderer'}
      onBeforeValidate={(event) => {
        result.current = null;
        onBeforeValidate?.(event);
      }}
      onValidate={(r: FormValidationResult) => {
        onValidate?.(r);
        result.current = r.valid ? VALID : Object.freeze({ isValid: false, errors: r.errors });
        // A blocked (native) invalid submit never reaches onSubmit.
        if (!r.valid && latest.current.validationBehavior !== 'aria' && node.current) {
          emit(node.current, result.current, null);
          result.current = null;
        }
      }}
      onSubmit={(event) => {
        if (latest.current.action === undefined && latest.current.onSubmit) event.preventDefault();
        emit(event.currentTarget, result.current ?? VALID, event);
        result.current = null;
      }}
    >
      {plan.map((row) => (
        <div key={row.map((p) => p.name).join(' ')} className="salmon-form-renderer-row" data-columns={row.length} style={row.length > 1 ? ({ '--salmon-form-renderer-columns': row.length } as CSSProperties) : undefined}>
          {row.map((p) => (
            <FieldOf key={p.name} plan={p} size={size} localeText={localeText} />
          ))}
        </div>
      ))}
      {children}
      {submit === false ? null : (
        <div className="salmon-form-renderer-actions">
          <Button type="submit" tone={submit?.tone ?? 'primary'} variant={submit?.variant} size={size}>
            {submit?.label ?? localeText?.submit ?? 'Submit'}
          </Button>
        </div>
      )}
    </Form>
  );
}
