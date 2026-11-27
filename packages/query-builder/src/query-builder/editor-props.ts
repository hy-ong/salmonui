// Routing of `editorProps.value` to the built-in value editors.

/**
 * The non-DOM props of each built-in value editor, keyed by the editors that
 * take them (t TextField, n NumberField, d DateField, b Checkbox, s Select,
 * c Combobox). `editorProps.value` is shared by every editor; a prop listed
 * here reaches only its editors, so `clearable` or `searchable` never lands
 * on a DateField or Checkbox element. Other keys (DOM, `aria-*`, `data-*`)
 * reach every editor. tests/types/query-builder.test-d.tsx keeps the table
 * equal to the editors' prop types.
 */
export const EDITOR_PROPS = {
  tnbsc: 'classNames',
  tnsc: 'clearable',
  tn: 'endAdornment startAdornment',
  tndbsc: 'description errorMessage invalid localeText',
  tndsc: 'onValueChange',
  tnb: 'validateOn validation',
  n: 'clampBehavior currency decimals formatOptions incrementOnWheel restrictDecimals showStepper',
  nd: 'format',
  ndsc: 'locale',
  d: 'granularity hourCycle inputFormats isDateDisabled parse placeholderValue strict timeZone',
  b: 'indeterminate labelPlacement onCheckedChange',
  sc: 'closeOnSelect debounce defaultOpen getChipProps getItemGroup getItemIcon getItemLabel getItemProps getItemValue groupSelection hideSelected highlightMatches ignoreAccents indicator isItemDisabled loading matchCase maxResults maxSelected maxVisibleItems maxVisibleValues minSearchLength onLoadError onOpenChange popupFooter popupHeader popupMode query renderChip renderEmpty renderError renderGroupHeader renderItem renderLoading renderValue searchFields searchOperator selectedItems showSelectAll styles valueSeparator virtualization',
  s: 'onSearchChange searchPlaceholder searchable valueDisplay',
  c: 'autofill columns commitOnBlur creatable defaultInputValue gridLines inputValue onCreateItem onInputChange openOnClick rowHeight showTrigger sorting striped',
} as const;

const OWNERS = new Map(Object.entries(EDITOR_PROPS).flatMap(([kinds, names]) => names.split(' ').map((n) => [n, kinds] as const)));

/** The `editorProps.value` entries the editor `kind` (a letter of EDITOR_PROPS) takes. */
export const propsOf = (extra: Readonly<Record<string, unknown>> | undefined, kind: string): Readonly<Record<string, unknown>> | undefined =>
  extra && Object.fromEntries(Object.entries(extra).filter(([k]) => OWNERS.get(k)?.includes(kind) ?? true));
