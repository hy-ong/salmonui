'use client';

// Select: the APG select-only combobox. A
// native `<button role="combobox">` owns focus and the keyboard; the popup
// listbox is driven through `aria-activedescendant`, so DOM focus never
// leaves the trigger (or the search input of `searchable`). Covers
// DropDownList and the non-typing MultiSelect modes (CheckBox, Delimiter).

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type Ref } from 'react';
import type { DropdownValue } from '../dropdown/types.js';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { createTypeahead, isTypeaheadKey, typeahead as typeaheadMatch, TYPEAHEAD_MS } from '@salmonui/core/internal/roving';
import { assignRef, changeEvent, resolvePopupContext, usePopupModule, type PopupContext, HiddenSelect, Icon, ICON_CHEVRON, ICON_X, rootClass, joinLabels, partClass, partStyle, preventFocusLoss, sourceOf, useDropdownController, type DropdownController } from '../dropdown/core.js';
import { DROPDOWN_DEFAULT_LOCALE_TEXT } from '../dropdown/locale.js';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';

import { SELECT_ALL_ROW } from '../dropdown/core.js';
import type { DropdownCommonProps, DropdownDomProps, DropdownEventSource, DropdownFieldProps, DropdownLocaleText, DropdownOpenChangeEvent, DropdownOpenChangeReason, DropdownSearchChangeEvent, DropdownValueChangeEvent } from '../dropdown/types.js';

export const SELECT_DEFAULT_LOCALE_TEXT: DropdownLocaleText = DROPDOWN_DEFAULT_LOCALE_TEXT;

const EMPTY: readonly DropdownValue[] = Object.freeze([]);

// `DropdownFieldProps` are handled by the public wrapper (`SelectField.tsx`); this
// bare control never reads them, so internal consumers do not pass them.
interface SelectOwnProps<Item> extends DropdownCommonProps<Item>, DropdownFieldProps, DropdownDomProps {
  /** A search input inside the popup filters the options. */
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  readonly onSearchChange?: (text: string, event: DropdownSearchChangeEvent) => void;
  /** How the selected values of `multiple` show in the trigger: joined labels (default) or a count. Chips are a `Combobox multiple` display. */
  readonly valueDisplay?: 'text' | 'count';
  /** The trigger `<button role="combobox">`. */
  readonly ref?: Ref<HTMLButtonElement>;
}

export interface SelectSingleProps<Item> extends SelectOwnProps<Item> {
  readonly multiple?: false;
  /** Selected value; `null` is a controlled empty selection. */
  readonly value?: DropdownValue | null;
  readonly defaultValue?: DropdownValue | null;
  readonly onValueChange?: (value: DropdownValue | null, event: DropdownValueChangeEvent<Item>) => void;
}

export interface SelectMultipleProps<Item> extends SelectOwnProps<Item> {
  readonly multiple: true;
  readonly value?: readonly DropdownValue[];
  readonly defaultValue?: readonly DropdownValue[];
  readonly onValueChange?: (value: readonly DropdownValue[], event: DropdownValueChangeEvent<Item>) => void;
}

export type SelectProps<Item = unknown> = SelectSingleProps<Item> | SelectMultipleProps<Item>;

const toArray = (value: DropdownValue | null | readonly DropdownValue[] | undefined): readonly DropdownValue[] => (value == null ? EMPTY : Array.isArray(value) ? (value as readonly DropdownValue[]) : [value as DropdownValue]);

/** `onOpenChange` / `onValueChange` events allocate only when a callback is bound. */
function openEvent(source: DropdownEventSource, reason: DropdownOpenChangeReason): DropdownOpenChangeEvent {
  return Object.freeze({ source, reason });
}

export function Select<Item = unknown>(props: SelectProps<Item>) {
  const {
    open: openProp,
    defaultOpen,
    onOpenChange,
    popupMode = 'popover',
    clearable = false,
    placeholder,
    disabled = false,
    readOnly = false,
    name,
    required,
    form,
    id,
    closeOnSelect,
    maxVisibleValues,
    valueSeparator,
    locale: ownLocale,
    renderValue,
    className,
    style,
    size,
    searchable = false,
    searchPlaceholder,
    onSearchChange,
    valueDisplay = 'text',
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
    matchCase: _matchCase,
    ignoreAccents: _ignoreAccents,
    debounce: _debounce,
    minSearchLength: _minSearchLength,
    maxResults: _maxResults,
    searchFields: _searchFields,
    query: _query,
    virtualization: _virtualization,
    maxVisibleItems: _maxVisibleItems,
    autoFocus: _autoFocus,
    indicator: _indicator,
    showSelectAll: _showSelectAll,
    maxSelected: _maxSelected,
    groupSelection: _groupSelection,
    hideSelected: _hideSelected,
    renderItem: _renderItem,
    renderChip: _renderChip,
    renderGroupHeader: _renderGroupHeader,
    renderEmpty: _renderEmpty,
    renderError: _renderError,
    renderLoading: _renderLoading,
    popupHeader: _popupHeader,
    popupFooter: _popupFooter,
    getItemProps: _getItemProps,
    getChipProps: _getChipProps,
    highlightMatches: _highlightMatches,
    loading: _loading,
    onLoadError: _onLoadError,
    localeText: _localeText,
    classNames: _classNames,
    styles: _styles,
    ...dom
  } = props;
  const locale = useLocale(ownLocale) ?? 'en-US';
  const multiple = multipleProp === true;
  const reactId = useId();
  const listId = `${reactId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [initial] = useState(() => toArray(defaultValue));
  const [values, setValues] = useControllableState<readonly DropdownValue[], [DropdownValueChangeEvent<Item>]>(
    valueProp === undefined ? undefined : toArray(valueProp),
    initial,
    onValueChange
      ? (next, event) => {
          if (multiple) (onValueChange as SelectMultipleProps<Item>['onValueChange'])?.(next, event);
          else (onValueChange as SelectSingleProps<Item>['onValueChange'])?.(next[0] ?? null, event);
        }
      : undefined,
    'Select value',
  );
  const [open, setOpenState] = useControllableState<boolean, [DropdownOpenChangeEvent]>(openProp, false, onOpenChange, 'Select open');
  const [popupContext, setPopupContext] = useState<PopupContext | null>(null);
  const popupModule = usePopupModule();
  const [search, setSearch] = useState('');

  const ctl = useDropdownController<Item>({
    kind: 'select',
    props,
    localeText: useLocaleText('select', props.localeText),
    locale,
    multiple,
    values,
    setValues,
    open,
    listId,
    searchText: searchable || popupContext?.mode === 'sheet' ? search : '',
    // The search chunk loads after mount when a search field can appear, so the first keystroke filters.
    wantSearch: searchable || popupMode !== 'popover',
    defaultOperator: 'startsWith',
  });
  const { store, text } = ctl;
  const typeahead = useRef<ReturnType<typeof createTypeahead> | null>(null);
  const pendingMove = useRef<'first' | 'last' | null>(null);

  // defaultOpen applies after hydration, so server and client markup match.
  useEffect(() => {
    if (defaultOpen && openProp === undefined) setOpenState(true, openEvent('api', 'trigger'));
    // Read once at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A popup opened by a prop (controlled `open`, `defaultOpen`) resolves its portal and mode here.
  useLayoutEffect(() => {
    if (open && !popupContext && rootRef.current) setPopupContext(resolvePopupContext(popupMode, rootRef.current));
  }, [open, popupContext, popupMode]);

  // On open: the active row starts at the selected item; search focus for `searchable`.
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (open && popupContext && popupModule && !wasOpen.current) {
      wasOpen.current = true;
      store.set({ first: 0, last: 0 });
      const row = store.getState().active;
      ctl.setActive(row === -1 ? ctl.initialActive() : row);
      if (pendingMove.current) ctl.move(pendingMove.current);
      pendingMove.current = null;
      if (searchable || popupContext.mode === 'sheet') (searchRef.current ?? triggerRef.current)?.focus({ preventScroll: true });
    } else if (!open && wasOpen.current) {
      wasOpen.current = false;
      store.set({ active: -1, first: 0, last: 0 });
    }
  });

  // aria-activedescendant follows the store without re-rendering the Select.
  useEffect(() => {
    if (!open || !popupContext || !popupModule) return;
    const host = (): HTMLElement | null => (searchable || popupContext.mode === 'sheet' ? searchRef.current : triggerRef.current);
    const sync = (): void => {
      const el = host();
      if (!el) return;
      const active = store.getState().active;
      if (active === -1) el.removeAttribute('aria-activedescendant');
      else el.setAttribute('aria-activedescendant', ctl.optionId(active));
    };
    sync();
    const unsubscribe = store.subscribe(sync);
    return () => {
      unsubscribe();
      triggerRef.current?.removeAttribute('aria-activedescendant');
    };
  }, [open, popupContext, popupModule, store, searchable, ctl.listId]);

  const setOpen = (next: boolean, source: DropdownEventSource, reason: DropdownOpenChangeReason): void => {
    if (next === open) return;
    if (next) {
      if (disabled || readOnly) return;
      if (rootRef.current) setPopupContext(resolvePopupContext(popupMode, rootRef.current));
    } else {
      if (search) {
        setSearch('');
        onSearchChange?.('', Object.freeze({ source }));
      }
      // Focus returns to the trigger when it was inside the popup.
      const doc = triggerRef.current?.ownerDocument;
      if (doc && doc.activeElement !== triggerRef.current && (doc.activeElement === searchRef.current || reason !== 'outside')) triggerRef.current?.focus({ preventScroll: true });
    }
    setOpenState(next, openEvent(source, reason));
  };

  const closeAfterSelect = closeOnSelect ?? !multiple;
  const choose = (row: number, source: DropdownEventSource): void => {
    const changed = ctl.choose(row, source);
    if (changed && closeAfterSelect && row !== SELECT_ALL_ROW) setOpen(false, source, 'select');
  };

  const onChoose = (row: number, event: ReactMouseEvent): void => choose(row, sourceOf(event));

  /** Type-ahead through the shared `internal/roving.ts` matcher over the view rows. */
  const typeTo = (key: string, timeStamp: number): number => {
    let from = store.getState().active;
    if (!open && !multiple && values.length) from = ctl.initialActive();
    const { view, collection } = ctl;
    return typeaheadMatch(
      (typeahead.current ??= createTypeahead()),
      key,
      timeStamp,
      view.count,
      Math.max(-1, from),
      (row) => {
        const i = view.code(row);
        return i < 0 ? '' : collection.label(i);
      },
      (row) => {
        const i = view.code(row);
        return i >= 0 && !collection.disabled(i);
      },
    );
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>, inSearch: boolean): void => {
    if (disabled || event.defaultPrevented || event.nativeEvent.isComposing) return;
    const { key, altKey, ctrlKey, metaKey } = event;
    let handled = true;
    // A space inside a type-ahead buffer is part of the text ("Item 9"), not an open or select key.
    const t = typeahead.current;
    const typing = key === ' ' && !!t?.text && event.timeStamp - t.at <= TYPEAHEAD_MS;
    if (!open) {
      switch (typing ? '' : key) {
        case ' ':
        case 'ArrowDown':
        case 'ArrowUp':
        case 'Enter':
          if (readOnly) return;
          setOpen(true, 'keyboard', 'keyboard');
          break;
        case 'Home':
        case 'End':
          if (readOnly) return;
          pendingMove.current = key === 'Home' ? 'first' : 'last';
          setOpen(true, 'keyboard', 'keyboard');
          break;
        case 'Backspace':
        case 'Delete':
          if (!clearable || readOnly || !values.length) return;
          ctl.clear('keyboard');
          break;
        default:
          if (isTypeaheadKey(event) && !readOnly && !ctl.remote) {
            const row = typeTo(key, event.timeStamp);
            if (row >= 0) {
              if (multiple) {
                setOpen(true, 'keyboard', 'type');
                store.set({ active: row });
              } else ctl.choose(row, 'keyboard');
            }
          } else handled = false;
      }
    } else {
      const active = store.getState().active;
      switch (key) {
        case 'ArrowDown':
          if (altKey) break;
          ctl.move('next');
          break;
        case 'ArrowUp':
          if (altKey) {
            if (!multiple && active >= 0) choose(active, 'keyboard');
            setOpen(false, 'keyboard', 'keyboard');
            break;
          }
          ctl.move('prev');
          break;
        case 'Home':
          if (inSearch) return;
          ctl.move('first');
          break;
        case 'End':
          if (inSearch) return;
          ctl.move('last');
          break;
        case 'PageDown':
          ctl.move('pageDown');
          break;
        case 'PageUp':
          ctl.move('pageUp');
          break;
        case 'Enter':
          if (active !== -1) choose(active, 'keyboard');
          else if (!multiple) setOpen(false, 'keyboard', 'keyboard');
          break;
        case ' ': {
          if (inSearch) return;
          if (typing) {
            const row = typeTo(' ', event.timeStamp);
            if (row >= 0) ctl.setActive(row);
            break;
          }
          if (active !== -1) choose(active, 'keyboard');
          break;
        }
        case 'Escape':
          if (inSearch && search) {
            setSearch('');
            onSearchChange?.('', Object.freeze({ source: 'keyboard' }));
            break;
          }
          setOpen(false, 'keyboard', 'escape');
          break;
        case 'Tab':
          setOpen(false, 'keyboard', 'tab');
          handled = false;
          break;
        default:
          if ((key === 'a' || key === 'A') && (ctrlKey || metaKey) && multiple && !inSearch) {
            // No select all over a remote source: the value keeps its keys.
            if (!ctl.view.remote) ctl.toggleAll('keyboard');
          } else if (isTypeaheadKey(event) && !inSearch && !ctl.remote) {
            const row = typeTo(key, event.timeStamp);
            if (row >= 0) ctl.setActive(row);
          } else handled = false;
      }
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const setRef = useCallback((el: HTMLButtonElement | null) => assignRef(triggerRef, ref, el), [ref]);

  // Value display. Labels are read for the shown values only, so a large
  // selection (select all over 100,000 items) costs nothing here.
  const labelAt = (v: DropdownValue): string => ctl.labelFor(v);
  let display: ReactNode;
  const empty = values.length === 0;
  if (renderValue && !empty) display = renderValue({ items: ctl.itemsFor(values), labels: values.map(labelAt) });
  else if (empty) display = placeholder !== undefined ? <span className="salmon-select-placeholder" aria-hidden="true">{placeholder}</span> : null;
  else if (!multiple) display = labelAt(values[0] as DropdownValue);
  else if (valueDisplay === 'count') display = text.selectedCount(values.length, new Intl.PluralRules(locale).select(values.length));
  else {
    // Text display: up to `maxVisibleValues` labels (default 100), then "+N".
    const max = maxVisibleValues ?? 100;
    const shown = joinLabels(values.slice(0, max).map(labelAt), valueSeparator, locale);
    display = values.length > max ? `${shown} ${text.moreValues(values.length - max)}` : shown;
  }

  const sheet = popupContext?.mode === 'sheet';
  const showSearch = searchable || sheet;
  const labelledBy = dom['aria-labelledby'] as string | undefined;
  const label = dom['aria-label'] as string | undefined;
  const searchInput = showSearch ? (
    <div className="salmon-select-search">
      <input
        ref={searchRef}
        type="text"
        role="combobox"
        aria-expanded={true}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={text.search}
        autoComplete="off"
        spellCheck={false}
        className={partClass('salmon-select-search-input', props as never, 'search')}
        style={partStyle(props as never, 'search')}
        placeholder={searchPlaceholder}
        value={search}
        onChange={(event) => {
          const t = event.currentTarget.value;
          setSearch(t);
          store.set({ first: 0, last: 0 });
          if (ctl.listRef.current) ctl.listRef.current.scrollTop = 0;
          onSearchChange?.(t, Object.freeze({ source: 'keyboard' }));
        }}
        onKeyDown={(event) => onKeyDown(event, true)}
      />
    </div>
  ) : null;

  // After a search the first match becomes active (the window resets to the top).
  useLayoutEffect(() => {
    if (!open || !popupContext || !showSearch) return;
    store.set({ first: 0, last: 0 });
    if (search) ctl.setActive(ctl.move('first') === SELECT_ALL_ROW ? SELECT_ALL_ROW : store.getState().active);
    // Only when a new result set arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.resultKey]);

  const dataAttrs = {
    'data-size': size ?? 'md',
    'data-open': open ? '' : undefined,
    'data-disabled': disabled ? '' : undefined,
    'data-readonly': readOnly ? '' : undefined,
    'data-multiple': multiple ? '' : undefined,
    'data-empty': empty ? '' : undefined,
    'data-value-display': multiple ? valueDisplay : undefined,
  };
  return (
    <div ref={rootRef} className={rootClass('salmon-select', props.classNames?.root, className)} style={style || props.styles?.root ? { ...props.styles?.root, ...style } : undefined} {...dataAttrs}>
      <button
        {...dom}
        ref={setRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup={sheet ? 'dialog' : 'listbox'}
        aria-expanded={open}
        aria-controls={open && popupContext ? listId : undefined}
        aria-readonly={readOnly || undefined}
        aria-required={required || undefined}
        aria-busy={ctl.loading || undefined}
        disabled={disabled}
        autoFocus={props.autoFocus}
        className={partClass('salmon-select-trigger', props as never, 'trigger')}
        style={partStyle(props as never, 'trigger')}
        onClick={(event) => {
          dom.onClick?.(event as never);
          if (event.defaultPrevented || readOnly) return;
          // Keyboard clicks are handled in keydown.
          if (event.detail === 0) return;
          setOpen(!open, sourceOf(event), 'trigger');
        }}
        onKeyDown={(event) => {
          dom.onKeyDown?.(event as never);
          onKeyDown(event, false);
        }}
        onBlur={(event) => {
          dom.onBlur?.(event as never);
          // Focus left the trigger and the popup: close.
          const next = event.relatedTarget as Node | null;
          if (open && next && !rootRef.current?.contains(next) && !searchRef.current?.closest('.salmon-dropdown-popup')?.contains(next)) setOpen(false, 'keyboard', 'blur');
        }}
      >
        <span className={partClass('salmon-select-value', props as never, 'value')} style={partStyle(props as never, 'value')}>
          {display}
        </span>
        {/* Loading (a pending remote read or `loading`) replaces the chevron with the spinner, also while closed. */}
        <span className="salmon-select-chevron" aria-hidden="true">
          {ctl.loading ? <span className="salmon-dropdown-spinner" /> : <Icon d={ICON_CHEVRON} />}
        </span>
      </button>
      {clearable && !empty && !disabled && !readOnly ? (
        <button type="button" tabIndex={-1} className="salmon-select-clear" aria-label={text.clear} onPointerDown={preventFocusLoss} onClick={(event) => ctl.clear(sourceOf(event))}>
          <Icon d={ICON_X} />
        </button>
      ) : null}
      {name !== undefined ? (
        <HiddenSelect
          name={name}
          values={values}
          multiple={multiple}
          required={required}
          disabled={disabled}
          form={form}
          onReset={() => {
            const same = initial.length === values.length && initial.every((v, i) => v === values[i]);
            if (!same) setValues(initial, changeEvent<Item>('api', 'reset', values, () => ctl.itemsFor(initial)));
          }}
          onInvalid={(event) => (event.preventDefault(), triggerRef.current?.focus())}
        />
      ) : null}
      {open && popupContext && popupModule ? (
        <popupModule.DropdownPopup
          ctl={ctl as DropdownController<Item>}
          base="salmon-select"
          anchorRef={rootRef}
          context={popupContext}
          onOutsidePress={() => setOpen(false, 'pointer', 'outside')}
          onChoose={onChoose}
          search={
            sheet ? (
              <>
                <div className="salmon-dropdown-sheet-header">
                  <span className="salmon-dropdown-sheet-title">{label ?? placeholder ?? text.search}</span>
                  <button type="button" className="salmon-dropdown-sheet-close" aria-label={text.close} onPointerDown={preventFocusLoss} onClick={() => setOpen(false, 'pointer', 'escape')}>
                    <Icon d={ICON_X} />
                  </button>
                </div>
                {searchInput}
              </>
            ) : (
              searchInput
            )
          }
          sheetTitle={label ?? placeholder ?? text.search}
          labelledBy={labelledBy}
          label={label}
        />
      ) : null}
    </div>
  );
}

export type { CSSProperties };
