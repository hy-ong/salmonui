'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/dropdowns/select`: Select (DropDownList and the non-typing
// MultiSelect modes).
export { Select } from './select/SelectField.js';
export { SELECT_DEFAULT_LOCALE_TEXT } from './select/Select.js';
export type { SelectMultipleProps, SelectProps, SelectSingleProps } from './select/Select.js';
export type {
  DropdownChipRenderProps as SelectChipRenderProps,
  DropdownEventSource as SelectEventSource,
  DropdownFieldProps as SelectFieldProps,
  DropdownItemRenderProps as SelectItemRenderProps,
  DropdownLocaleText as SelectLocaleText,
  DropdownOpenChangeEvent as SelectOpenChangeEvent,
  DropdownOpenChangeReason as SelectOpenChangeReason,
  DropdownPart as SelectPart,
  DropdownPartProps as SelectPartProps,
  DropdownQuery as SelectQuery,
  DropdownSearchChangeEvent as SelectSearchChangeEvent,
  DropdownValue as SelectValue,
  DropdownValueChangeEvent as SelectValueChangeEvent,
  DropdownValueChangeReason as SelectValueChangeReason,
  RemoteSource as SelectRemoteSource,
  SearchOperator as SelectSearchOperator,
} from './dropdown/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/dropdowns/select', 'salmon-select');
