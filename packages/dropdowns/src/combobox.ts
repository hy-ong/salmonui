'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/dropdowns/combobox`: Combobox (ComboBox, AutoComplete, the typing
// MultiSelect and MultiColumn ComboBox). The
// `columns` grid popup is a lazy chunk.
export { Combobox } from './combobox/ComboboxField.js';
export { COMBOBOX_DEFAULT_LOCALE_TEXT } from './combobox/Combobox.js';
export type { ComboboxInputChangeEvent, ComboboxInputChangeReason, ComboboxMultipleProps, ComboboxProps, ComboboxSingleProps } from './combobox/Combobox.js';
export type { ComboboxColumn, ComboboxSort } from './combobox/columns.js';
export type {
  DropdownChipRenderProps as ComboboxChipRenderProps,
  DropdownEventSource as ComboboxEventSource,
  DropdownFieldProps as ComboboxFieldProps,
  DropdownItemRenderProps as ComboboxItemRenderProps,
  DropdownLocaleText as ComboboxLocaleText,
  DropdownOpenChangeEvent as ComboboxOpenChangeEvent,
  DropdownOpenChangeReason as ComboboxOpenChangeReason,
  DropdownPart as ComboboxPart,
  DropdownPartProps as ComboboxPartProps,
  DropdownQuery as ComboboxQuery,
  DropdownValue as ComboboxValue,
  DropdownValueChangeEvent as ComboboxValueChangeEvent,
  DropdownValueChangeReason as ComboboxValueChangeReason,
  RemoteSource as ComboboxRemoteSource,
  SearchOperator as ComboboxSearchOperator,
} from './dropdown/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/dropdowns/combobox', 'salmon-combobox');
