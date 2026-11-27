'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/form`: Form, Field and the
// error / description parts. CSS: `@salmonui/inputs/form/styles.css`.
export { Form } from './form/Form.js';
export type { FormProps, FormValidateEvent, FormValidationResult } from './form/Form.js';
export { Field, FieldDescription, FieldError, useFieldContext } from './form/Field.js';
export type { FieldProps, FieldRenderProps } from './form/Field.js';
export type { FieldCommonProps, FieldSize, FieldState, FieldValidationText } from './internal/field/field.js';
export type { ValidateOn, ValidationBehavior, ValidationErrors } from '@salmonui/core/internal/field/context';
export type { FieldValidation, FieldValidatorContext } from '@salmonui/core/validation';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/form', 'salmon-field');
