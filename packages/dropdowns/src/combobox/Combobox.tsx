'use client';

// Combobox: the APG editable combobox with list autocomplete. The
// `<input role="combobox">` keeps DOM focus; the popup
// is driven by `aria-activedescendant`. Covers ComboBox, AutoComplete
// (`creatable showTrigger={false}`), the typing MultiSelect (`multiple`,
// chips, `creatable`, `commitOnBlur`) and MultiColumn ComboBox (`columns`,
// a lazy `role="grid"` popup).

import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type Ref } from 'react';
import type { SortDescriptor } from '@salmonui/core/data';
import { foldText } from '../internal/collection/fold.js';
import type { DropdownValue } from '../dropdown/types.js';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { isRtl } from '@salmonui/core/internal/position';
import { DEV } from '@salmonui/core/internal/dev';
import { assignRef, changeEvent, resolvePopupContext, usePopupModule, type PopupContext, HiddenSelect, Icon, ICON_CHEVRON, ICON_X, partClass, partStyle, preventFocusLoss, rootClass, sourceOf, useDropdownController } from '../dropdown/core.js';
import { DROPDOWN_DEFAULT_LOCALE_TEXT } from '../dropdown/locale.js';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';

import type { DropdownCommonProps, DropdownDomProps, DropdownEventSource, DropdownFieldProps, DropdownLocaleText, DropdownOpenChangeEvent, DropdownOpenChangeReason, DropdownValueChangeEvent } from '../dropdown/types.js';
import { compareBy, type ComboboxColumn, type ComboboxSort } from './columns.js';

export const COMBOBOX_DEFAULT_LOCALE_TEXT: DropdownLocaleText = DROPDOWN_DEFAULT_LOCALE_TEXT;

// The `columns` grid popup is a lazy chunk (not in the initial JS).
const ColumnsGrid = lazy(() => import('./columns-grid.js'));

const EMPTY: readonly DropdownValue[] = Object.freeze([]);

export type ComboboxInputChangeReason = 'input' | 'select' | 'clear' | 'escape' | 'blur' | 'reset';

export interface ComboboxInputChangeEvent {
  readonly source: DropdownEventSource;
  readonly reason: ComboboxInputChangeReason;
}

// `DropdownFieldProps` are handled by the public wrapper (`ComboboxField.tsx`); this
// bare control never reads them, so internal consumers do not pass them.
interface ComboboxOwnProps<Item> extends DropdownCommonProps<Item>, DropdownFieldProps, DropdownDomProps {
  /** Text of the input (reactive); `onInputChange` reports every edit. */
  readonly inputValue?: string;
  readonly defaultInputValue?: string;
  readonly onInputChange?: (text: string, event: ComboboxInputChangeEvent) => void;
  /** Committed text without a matching item becomes the value. Default `false`. */
  readonly creatable?: boolean;
  /** Builds the item for created text; `null` rejects it. Default: the text itself. */
  readonly onCreateItem?: (text: string) => Item | null;
  /** Completes the first match inline (`aria-autocomplete="both"`). */
  readonly autofill?: boolean;
  /** The dropdown button (not in the tab order). Default `true`. */
  readonly showTrigger?: boolean;
  /** A click in the input opens the popup. Default `true`. */
  readonly openOnClick?: boolean;
  /** Typed text is committed (created) when focus leaves. */
  readonly commitOnBlur?: boolean;
  /** Table popup (MultiColumn ComboBox): a lightweight `role="grid"`. */
  readonly columns?: readonly ComboboxColumn<Item>[];
  /** Fixed row height of the `columns` popup in px. */
  readonly rowHeight?: number;
  readonly gridLines?: 'default' | 'both' | 'none' | 'horizontal' | 'vertical';
  readonly striped?: boolean;
  /** Header sorting of the `columns` popup. Default `true`. */
  readonly sorting?: boolean | ComboboxSort;
  /** The `<input role="combobox">`. */
  readonly ref?: Ref<HTMLInputElement>;
}

export interface ComboboxSingleProps<Item> extends ComboboxOwnProps<Item> {
  readonly multiple?: false;
  readonly value?: DropdownValue | null;
  readonly defaultValue?: DropdownValue | null;
  readonly onValueChange?: (value: DropdownValue | null, event: DropdownValueChangeEvent<Item>) => void;
}

export interface ComboboxMultipleProps<Item> extends ComboboxOwnProps<Item> {
  readonly multiple: true;
  readonly value?: readonly DropdownValue[];
  readonly defaultValue?: readonly DropdownValue[];
  readonly onValueChange?: (value: readonly DropdownValue[], event: DropdownValueChangeEvent<Item>) => void;
}

export type ComboboxProps<Item = unknown> = ComboboxSingleProps<Item> | ComboboxMultipleProps<Item>;

const toArray = (value: DropdownValue | null | readonly DropdownValue[] | undefined): readonly DropdownValue[] => (value == null ? EMPTY : Array.isArray(value) ? (value as readonly DropdownValue[]) : [value as DropdownValue]);

export function Combobox<Item = unknown>(props: ComboboxProps<Item>) {
  const {
    open: openProp,
    defaultOpen,
    onOpenChange,
    matchCase = false,
    ignoreAccents = false,
    minSearchLength = 0,
    searchFields,
    clearable = true,
    placeholder,
    disabled = false,
    readOnly = false,
    name,
    required,
    form,
    id,
    maxSelected,
    closeOnSelect,
    maxVisibleValues,
    renderChip,
    getChipProps,
    className,
    style,
    size,
    inputValue: inputValueProp,
    defaultInputValue,
    onInputChange,
    creatable = false,
    onCreateItem,
    autofill = false,
    showTrigger = true,
    openOnClick = true,
    commitOnBlur = false,
    columns,
    rowHeight,
    gridLines = 'default',
    striped = false,
    sorting = true,
    ref,
    multiple: multipleProp,
    value: valueProp,
    defaultValue,
    onValueChange,
    data: _data,
    getItemValue: _getItemValue,
    getItemLabel: _getItemLabel,
    getItemGroup: _getItemGroup,
    getItemIcon: _getItemIcon,
    isItemDisabled: _isItemDisabled,
    selectedItems: _selectedItems,
    searchOperator: _searchOperator,
    debounce: _debounce,
    maxResults: _maxResults,
    query: _query,
    virtualization: _virtualization,
    maxVisibleItems: _maxVisibleItems,
    popupMode: _popupMode,
    autoFocus,
    indicator: _indicator,
    showSelectAll: _showSelectAll,
    groupSelection: _groupSelection,
    hideSelected: _hideSelected,
    valueSeparator: _valueSeparator,
    locale: localeProp,
    renderItem: _renderItem,
    renderValue: _renderValue,
    renderGroupHeader: _renderGroupHeader,
    renderEmpty: _renderEmpty,
    renderError: _renderError,
    renderLoading: _renderLoading,
    popupHeader: _popupHeader,
    popupFooter: _popupFooter,
    getItemProps: _getItemProps,
    highlightMatches: _highlightMatches,
    loading: _loading,
    onLoadError: _onLoadError,
    localeText: localeTextProp,
    classNames: _classNames,
    styles: _styles,
    ...dom
  } = props;
  const multiple = multipleProp === true;
  const reactId = useId();
  const listId = `${reactId}-listbox`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chipsRef = useRef<HTMLSpanElement | null>(null);
  const composing = useRef(false);


  const [initial] = useState(() => toArray(defaultValue));
  const [values, setValues] = useControllableState<readonly DropdownValue[], [DropdownValueChangeEvent<Item>]>(
    valueProp === undefined ? undefined : toArray(valueProp),
    initial,
    onValueChange
      ? (next, event) => {
          if (multiple) (onValueChange as ComboboxMultipleProps<Item>['onValueChange'])?.(next, event);
          else (onValueChange as ComboboxSingleProps<Item>['onValueChange'])?.(next[0] ?? null, event);
        }
      : undefined,
    DEV ? 'Combobox value' : undefined,
  );
  const [open, setOpenState] = useControllableState<boolean, [DropdownOpenChangeEvent]>(openProp, false, onOpenChange, DEV ? 'Combobox open' : undefined);
  const [popupContext, setPopupContext] = useState<PopupContext | null>(null);
  const popupModule = usePopupModule();
  // Typed text: `null` while the input shows the committed value (no filtering).
  const [typed, setTyped] = useState<string | null>(defaultInputValue ?? null);
  // Inline completion of `autofill` (shown, not searched).
  const [completion, setCompletion] = useState<string | null>(null);
  const [extraItems, setExtraItems] = useState<ReadonlyMap<DropdownValue, Item>>(() => new Map());
  const [sortBy, setSortBy] = useState<readonly SortDescriptor[]>(() => (typeof sorting === 'object' && sorting.sortBy ? sorting.sortBy : []));
  const sortByProp = typeof sorting === 'object' ? sorting.sortBy : undefined;
  useEffect(() => {
    // `sorting.sortBy` is reactive: re-applied when it changes.
    if (sortByProp) setSortBy(sortByProp);
  }, [sortByProp]);

  const compare = useMemo(() => (columns && sortBy.length ? compareBy<Item>(sortBy, columns) : undefined), [columns, sortBy]);
  const searchTextOf = useMemo(() => (columns && searchFields?.length ? (item: Item) => searchFields.map((f) => String((item as Record<string, unknown>)[f] ?? '')).join(' ') : undefined), [columns, searchFields]);
  const searchText = inputValueProp !== undefined ? (typed !== null ? inputValueProp : '') : (typed ?? '');
  const ctl = useDropdownController<Item>({
    kind: 'combobox',
    props,
    localeText: useLocaleText('combobox', localeTextProp),
    locale: useLocale(localeProp),
    multiple,
    values,
    setValues,
    open,
    listId,
    searchText: searchText.length >= minSearchLength ? searchText : '',
    extraItems,
    wantSearch: true,
    defaultOperator: 'startsWith',
    searchTextOf,
    compare,
    sorting: columns && sortBy.length ? sortBy : undefined,
  });
  const { store, text } = ctl;

  const selectedLabel = !multiple && values.length ? ctl.labelFor(values[0] as DropdownValue) : '';
  const shown = inputValueProp ?? completion ?? typed ?? (multiple ? '' : selectedLabel);

  // Inline completion: select the completed part after render (never while composing).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || completion === null || typed === null) return;
    if (el.ownerDocument.activeElement === el) el.setSelectionRange(typed.length, completion.length, 'forward');
  }, [completion, typed]);

  useEffect(() => {
    if (defaultOpen && openProp === undefined) setOpenState(true, Object.freeze({ source: 'api', reason: 'trigger' }));
    // Read once at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (open && !popupContext && rootRef.current) setPopupContext(resolvePopupContext('popover', rootRef.current));
  }, [open, popupContext]);

  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (open && popupContext && popupModule && !wasOpen.current) {
      wasOpen.current = true;
      store.set({ first: 0, last: 0 });
      if (store.getState().active === -1 && typed === null) ctl.setActive(ctl.initialActive());
      else ctl.setActive(store.getState().active);
    } else if (!open && wasOpen.current) {
      wasOpen.current = false;
      store.set({ active: -1, first: 0, last: 0 });
    }
  });

  useEffect(() => {
    if (!open || !popupContext || !popupModule) return;
    const sync = (): void => {
      const el = inputRef.current;
      if (!el) return;
      const active = store.getState().active;
      if (active < 0) el.removeAttribute('aria-activedescendant');
      else el.setAttribute('aria-activedescendant', ctl.optionId(active));
    };
    sync();
    const unsubscribe = store.subscribe(sync);
    return () => {
      unsubscribe();
      inputRef.current?.removeAttribute('aria-activedescendant');
    };
  }, [open, popupContext, popupModule, store, ctl.listId]);

  // A new search resets the window; the first match becomes active with autofill.
  useLayoutEffect(() => {
    if (!open || !popupContext || typed === null) return;
    store.set({ active: -1, first: 0, last: 0 });
    if (ctl.listRef.current) ctl.listRef.current.scrollTop = 0;
    if (autofill || (columns !== undefined && typed !== '')) ctl.setActive(ctl.move('first'));
    // Only when a new result set arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.resultKey]);

  const setOpen = (next: boolean, source: DropdownEventSource, reason: DropdownOpenChangeReason): void => {
    if (next === open) return;
    if (next) {
      if (disabled || readOnly) return;
      if (rootRef.current) setPopupContext(resolvePopupContext('popover', rootRef.current));
    }
    setOpenState(next, Object.freeze({ source, reason }));
  };

  const setText = (next: string | null, source: DropdownEventSource, reason: ComboboxInputChangeReason): void => {
    setTyped(next);
    setCompletion(null);
    onInputChange?.(next ?? (multiple ? '' : selectedLabel), Object.freeze({ source, reason }));
  };

  /** Creates (or finds) the item for `raw` text and commits it. */
  const create = (raw: string, source: DropdownEventSource): boolean => {
    const t = raw.trim();
    if (!t) return false;
    // An existing label (case-insensitive) selects that item instead.
    const i = findLabel(t, true);
    if (i >= 0) {
      commitValue(ctl.collection.value(i), source, multiple ? 'add' : 'select');
      return true;
    }
    if (!creatable) return false;
    const item = onCreateItem ? onCreateItem(t) : (t as unknown as Item);
    if (item === null || item === undefined) return false;
    const value = ctl.valueOf(item);
    if (multiple && maxSelected !== undefined && values.length >= maxSelected && !values.includes(value)) return false;
    const map = new Map(extraItems);
    map.set(value, item);
    setExtraItems(map);
    if (multiple) {
      if (!values.includes(value)) ctl.commit([...values, value], 'create', source, [item]);
    } else ctl.commit([value], 'create', source, [item]);
    return true;
  };

  /** First enabled item whose folded label equals (`exact`) or starts with `text`, or -1. */
  const findLabel = (text: string, exact: boolean): number => {
    const q = foldText(text, ignoreAccents, matchCase);
    const n = ctl.collection.size;
    for (let i = 0; i < n; i++) {
      if (ctl.collection.disabled(i)) continue;
      const l = foldText(ctl.collection.label(i), ignoreAccents, matchCase);
      if (exact ? l === q : l.startsWith(q)) return i;
    }
    return -1;
  };

  const commitValue = (value: DropdownValue, source: DropdownEventSource, reason: 'select' | 'add'): void => {
    if (multiple) {
      if (!values.includes(value)) ctl.commit([...values, value], reason, source);
    } else if (values[0] !== value) ctl.commit([value], 'select', source);
  };

  const chooseRow = (row: number, source: DropdownEventSource): void => {
    const changed = ctl.choose(row, source, multiple ? 'add' : 'select');
    if (!changed) return;
    setText(multiple ? '' : null, source, 'select');
    if (closeOnSelect ?? !multiple) setOpen(false, source, 'select');
  };

  const onChoose = (row: number, event: ReactMouseEvent): void => {
    chooseRow(row, sourceOf(event));
    inputRef.current?.focus({ preventScroll: true });
  };

  /** Focus left the control: commit or revert the typed text, close. */
  const settle = (source: DropdownEventSource): void => {
    if (typed !== null) {
      if (multiple) {
        if (commitOnBlur && typed.trim()) create(typed, source);
        setText(multiple ? '' : null, source, 'blur');
      } else {
        const t = typed.trim();
        if (t === '') {
          if (values.length) ctl.clear(source);
        } else create(t, source);
        setText(null, source, 'blur');
      }
    }
    if (open) setOpen(false, source, 'blur');
  };

  const focusChip = (index: number): void => {
    const buttons = chipsRef.current?.querySelectorAll<HTMLButtonElement>('.salmon-combobox-chip-remove');
    if (!buttons?.length) return;
    const i = Math.max(0, Math.min(buttons.length - 1, index));
    buttons[i]?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.defaultPrevented || disabled) return;
    // IME composition: no filtering, autofill or Enter commit until it ends.
    if (composing.current || event.nativeEvent.isComposing) return;
    const { key, altKey } = event;
    const el = event.currentTarget;
    let handled = true;
    switch (key) {
      case 'ArrowDown':
        if (!open) {
          setOpen(true, 'keyboard', 'keyboard');
          if (!altKey && store.getState().active === -1) store.set({ active: -1 });
        } else if (!altKey) ctl.move('next');
        break;
      case 'ArrowUp':
        if (!open) {
          if (altKey) break;
          setOpen(true, 'keyboard', 'keyboard');
        } else if (altKey) setOpen(false, 'keyboard', 'keyboard');
        else ctl.move('prev');
        break;
      case 'PageDown':
        if (!open) return;
        ctl.move('pageDown');
        break;
      case 'PageUp':
        if (!open) return;
        ctl.move('pageUp');
        break;
      case 'Enter': {
        const active = store.getState().active;
        if (open && active !== -1) chooseRow(active, 'keyboard');
        else if (typed !== null && typed.trim()) {
          if (create(typed, 'keyboard')) {
            setText(multiple ? '' : null, 'keyboard', 'select');
            if (closeOnSelect ?? !multiple) setOpen(false, 'keyboard', 'select');
          } else handled = open;
        } else handled = open;
        if (open && !multiple && active === -1) setOpen(false, 'keyboard', 'keyboard');
        break;
      }
      case 'Escape':
        if (open) {
          setOpen(false, 'keyboard', 'escape');
          if (completion !== null) setCompletion(null);
        } else if (shown !== '') {
          // A second Escape clears the input.
          setText(multiple ? '' : null, 'keyboard', 'escape');
          if (!multiple && values.length && clearable) ctl.clear('keyboard');
          else if (!multiple && typed !== null) setTyped(null);
        } else handled = false;
        break;
      case 'Tab':
        handled = false;
        break;
      case 'Backspace':
        // Backspace on an empty input removes the last chip.
        if (multiple && el.value === '' && values.length && !readOnly) ctl.remove(values[values.length - 1] as DropdownValue, 'keyboard');
        else handled = false;
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const back = isRtl(el) ? 'ArrowRight' : 'ArrowLeft';
        if (multiple && key === back && el.selectionStart === 0 && el.selectionEnd === 0 && values.length) focusChip(values.length - 1);
        else handled = false;
        break;
      }
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onChipKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number, value: DropdownValue): void => {
    const el = event.currentTarget;
    const rtl = isRtl(el);
    const prev = rtl ? 'ArrowRight' : 'ArrowLeft';
    const next = rtl ? 'ArrowLeft' : 'ArrowRight';
    let handled = true;
    if (event.key === prev) focusChip(index - 1);
    else if (event.key === next) {
      if (index >= values.length - 1) inputRef.current?.focus();
      else focusChip(index + 1);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      ctl.remove(value, 'keyboard');
      if (values.length <= 1) inputRef.current?.focus();
      else queueMicrotask(() => focusChip(event.key === 'Backspace' ? index - 1 : index));
    } else if (event.key === 'Escape' || event.key === 'Tab' && !event.shiftKey) {
      handled = event.key === 'Escape';
      inputRef.current?.focus();
    } else handled = false;
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const setRef = useCallback((el: HTMLInputElement | null) => assignRef(inputRef, ref, el), [ref]);

  // Chips and the other multiple displays.
  const items = values.map((v) => ctl.itemFor(v));
  const labels = values.map((v, i) => {
    const it = items[i];
    return it === undefined ? String(v) : ctl.labelOf(it);
  });
  let valuesNode: ReactNode = null;
  if (multiple && values.length) {
    {
      const max = maxVisibleValues ?? values.length;
      valuesNode = (
        <span ref={chipsRef} role="list" aria-label={text.selectedValues} className="salmon-combobox-chips">
          {values.slice(0, max).map((v, i) => {
            const it = items[i];
            const label = labels[i] as string;
            const extra = it !== undefined ? getChipProps?.(it) : undefined;
            const { className: extraClass, style: extraStyle, ...dataProps } = extra ?? {};
            const remove = (): void => ctl.remove(v, 'api');
            return (
              <span
                {...dataProps}
                key={String(v)}
                role="listitem"
                className={partClass(`salmon-combobox-chip${extraClass ? ` ${extraClass}` : ''}`, props as never, 'chip')}
                style={extraStyle || props.styles?.chip ? { ...props.styles?.chip, ...extraStyle } : undefined}
              >
                <span className="salmon-combobox-chip-label">{renderChip && it !== undefined ? renderChip({ item: it, label, remove, disabled }) : label}</span>
                {!disabled && !readOnly ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="salmon-combobox-chip-remove"
                    aria-label={text.removeValue(label)}
                    onPointerDown={preventFocusLoss}
                    onClick={(event) => {
                      ctl.remove(v, sourceOf(event));
                      inputRef.current?.focus({ preventScroll: true });
                    }}
                    onKeyDown={(event) => onChipKeyDown(event, i, v)}
                  >
                    <Icon d={ICON_X} size={14} />
                  </button>
                ) : null}
              </span>
            );
          })}
          {values.length > max ? (
            <span role="listitem" className="salmon-combobox-chip salmon-combobox-more">
              {text.moreValues(values.length - max)}
            </span>
          ) : null}
        </span>
      );
    }
  }

  const labelledBy = dom['aria-labelledby'];
  const label = dom['aria-label'];
  const hasPopup = columns ? 'grid' : 'listbox';
  const empty = values.length === 0;
  const body = columns ? (
    <Suspense fallback={null}>
      <ColumnsGrid
        ctl={ctl as never}
        columns={columns as never}
        rowHeight={rowHeight}
        gridLines={gridLines}
        striped={striped}
        sortBy={sortBy}
        sortable={sorting !== false}
        multiSort={typeof sorting === 'object' && sorting.multiple === true}
        onSort={setSortBy}
        onChoose={onChoose}
        labelledBy={labelledBy}
        label={label}
      />
    </Suspense>
  ) : undefined;

  return (
    <div
      ref={rootRef}
      className={rootClass('salmon-combobox', props.classNames?.root, className)}
      style={style || props.styles?.root ? { ...props.styles?.root, ...style } : undefined}
      data-size={size ?? 'md'}
      data-open={open ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-readonly={readOnly ? '' : undefined}
      data-multiple={multiple ? '' : undefined}
      data-empty={empty ? '' : undefined}
      onPointerDown={(event) => {
        // A press on the field chrome (not the input or a chip button) focuses the input.
        const target = event.target as HTMLElement;
        if (target !== inputRef.current && !target.closest('button') && !disabled) {
          event.preventDefault();
          inputRef.current?.focus();
        }
      }}
    >
      <div className={partClass('salmon-combobox-field', props as never, 'trigger')} style={partStyle(props as never, 'trigger')}>
        {valuesNode}
        <input
          {...dom}
          ref={setRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete={autofill ? 'both' : 'list'}
          aria-haspopup={hasPopup}
          aria-expanded={open}
          aria-controls={open && popupContext ? listId : undefined}
          aria-readonly={readOnly ? true : undefined}
          aria-required={required ? true : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled}
          readOnly={readOnly}
          autoFocus={autoFocus}
          placeholder={multiple && !empty ? undefined : placeholder}
          className={partClass('salmon-combobox-input', props as never, 'input')}
          style={partStyle(props as never, 'input')}
          value={shown}
          onChange={(event) => {
            const t = event.currentTarget.value;
            const native = event.nativeEvent as InputEvent;
            setText(t, 'keyboard', 'input');
            let nextCompletion: string | null = null;
            if (autofill && !composing.current && t && native.inputType?.startsWith('insert')) {
              // Inline completion from the first enabled match.
              const i = findLabel(t, false);
              const l = i >= 0 ? ctl.collection.label(i) : '';
              if (l.length > t.length) nextCompletion = t + l.slice(t.length);
            }
            setCompletion(nextCompletion);
            if (!composing.current) {
              if (t.length >= minSearchLength) setOpen(true, 'keyboard', 'type');
              else if (open) setOpen(false, 'keyboard', 'type');
            }
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            // The search runs once composition ends.
            const t = event.currentTarget.value;
            setTyped(t);
            if (t.length >= minSearchLength) setOpen(true, 'keyboard', 'type');
          }}
          onClick={(event) => {
            dom.onClick?.(event as never);
            if (!event.defaultPrevented && openOnClick && !open && shown.length >= minSearchLength) setOpen(true, sourceOf(event), 'trigger');
          }}
          onKeyDown={(event) => {
            dom.onKeyDown?.(event as never);
            onKeyDown(event);
          }}
          onBlur={(event) => {
            dom.onBlur?.(event as never);
            const next = event.relatedTarget as Node | null;
            if (next && rootRef.current?.contains(next)) return;
            settle('keyboard');
          }}
        />
        {clearable && !disabled && !readOnly && (!empty || shown !== '') ? (
          <button
            type="button"
            tabIndex={-1}
            className="salmon-combobox-clear"
            aria-label={text.clear}
            onPointerDown={preventFocusLoss}
            onClick={(event) => {
              ctl.clear(sourceOf(event));
              setText(multiple ? '' : null, sourceOf(event), 'clear');
              inputRef.current?.focus({ preventScroll: true });
            }}
          >
            <Icon d={ICON_X} />
          </button>
        ) : null}
        {showTrigger ? (
          <button
            type="button"
            tabIndex={-1}
            className="salmon-combobox-trigger"
            aria-label={text.toggle}
            aria-expanded={open}
            aria-controls={open && popupContext ? listId : undefined}
            disabled={disabled}
            onPointerDown={preventFocusLoss}
            onClick={(event) => {
              if (readOnly) return;
              inputRef.current?.focus({ preventScroll: true });
              setOpen(!open, sourceOf(event), 'trigger');
            }}
          >
            <Icon d={ICON_CHEVRON} />
          </button>
        ) : null}
      </div>
      {name !== undefined ? (
        <HiddenSelect
          name={name}
          values={!multiple && empty && creatable && typed ? [typed] : values}
          multiple={multiple}
          required={required}
          disabled={disabled}
          form={form}
          onReset={() => {
            const same = initial.length === values.length && initial.every((v, i) => v === values[i]);
            if (!same) setValues(initial, changeEvent<Item>('api', 'reset', values, () => ctl.itemsFor(initial)));
            setText(defaultInputValue ?? null, 'api', 'reset');
          }}
          onInvalid={(event) => (event.preventDefault(), inputRef.current?.focus())}
        />
      ) : null}
      {open && popupContext && popupModule ? (
        <popupModule.DropdownPopup
          ctl={ctl}
          base="salmon-combobox"
          anchorRef={rootRef}
          context={popupContext}
          onOutsidePress={() => setOpen(false, 'pointer', 'outside')}
          onChoose={onChoose}
          labelledBy={labelledBy}
          label={label}
          body={body}
        />
      ) : null}
    </div>
  );
}
