// Type contract of the Inputs and Forms subpaths.
// Compiles against dist/*.d.ts.
import { Field, Form, type FieldRenderProps, type FieldValidatorContext } from '@salmonui/inputs/form';
import { TextArea, TextField, type TextChangeDetails } from '@salmonui/inputs/text-field';
import { formatMasked, MaskedField, type MaskedChangeDetails } from '@salmonui/inputs/masked-field';
import { NumberField, type NumberChangeDetails } from '@salmonui/inputs/number-field';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

// Triad: string value, details with source and reason.
export const text = <TextField label="A" value="x" onValueChange={(value: string, details: TextChangeDetails) => [value, details.reason, details.source]} />;
// @ts-expect-error numbers use NumberField
export const numberType = <TextField type="number" />;
// @ts-expect-error size is a closed union without density tokens
export const badSize = <TextField size="xl" />;
export const area = <TextArea resize="vertical" autoResize rows={3} ref={(el: HTMLTextAreaElement | null) => void el} />;
export const inputRef = <TextField ref={(el: HTMLInputElement | null) => void el} />;

// Custom validators get the field context.
export const confirm = (
  <TextField
    validation={{
      required: [true, 'Needed'],
      validate: (value: unknown, ctx: FieldValidatorContext) => value === ctx.formData?.get('password'),
    }}
  />
);

// Forms: behaviour union and server errors.
export const form = (
  <Form validationBehavior="aria" validationErrors={{ email: 'Taken', tags: ['a', 'b'] }} onValidate={(r) => r.valid} action={async (data: FormData) => void data}>
    <Field label="Custom">{(f: FieldRenderProps) => <input {...f.inputProps} />}</Field>
  </Form>
);
// @ts-expect-error unknown behaviour
export const badBehaviour = <Form validationBehavior="silent" />;

// MaskedField: raw string value with masked details.
export const masked = <MaskedField mask="(000) 000-0000" onValueChange={(raw: string, d: MaskedChangeDetails) => [raw, d.masked, d.complete]} submitValue="masked" tokens={{ '#': /[0-9]/ }} />;
// @ts-expect-error mask is required
export const noMask = <MaskedField />;
export const maskedText: string = formatMasked('00-00', '1234');
// NumberField: number | null.
export const num = <NumberField value={null} onValueChange={(v: number | null, d: NumberChangeDetails) => [v, d.formattedValue]} formatOptions={{ style: 'currency', currency: 'EUR' }} clampBehavior="none" />;
// @ts-expect-error a string value is not a number
export const badNum = <NumberField value="1" />;
