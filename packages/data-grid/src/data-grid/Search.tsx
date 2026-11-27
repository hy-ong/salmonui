'use client';

// Search box: a `role="search"` landmark with a labelled
// `type="search"` input wired to the search module. Hosted by the toolbar's
// `Search` item, or placed anywhere: inside a `<DataGrid>` subtree it finds the
// grid from context; elsewhere pass `api` (the grid instance from `ref`).
// The input is uncontrolled; the applied text is written back only when it
// changes elsewhere (`search.text`, `api.search()`).

import { use, useId, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { DataGridCommand, DataGridEngine } from '@salmonui/data-grid/engine';
import { DataGridInstanceContext, DataGridRenderContext } from './context.js';
import { gridEvent } from '@salmonui/core/internal/events';
import type { DataGridSearchBoxSearchEvent } from './feature-types.js';
import { DEFAULT_GRID_TEXT } from './locale-text.js';
import type { DataGridApi } from './types.js';

export interface DataGridSearchBoxProps<Row = unknown> {
  /** The grid to search when rendered outside its subtree. */
  api?: DataGridApi<Row> | null;
  /** Delay before typed text applies, in ms. Default 0 (Enter always applies at once). */
  debounce?: number;
  placeholder?: string;
  /** Accessible name of the search landmark. Default `localeText.searchLabel`. */
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
  /** Roving tab index from a host (the toolbar). */
  tabIndex?: number;
  disabled?: boolean;
  title?: string | undefined;
  /** Called before each search is applied; `event.preventDefault()` skips it (like grid before-events). */
  onBeforeSearch?: (event: DataGridSearchBoxSearchEvent) => void;
  onFocus?: () => void;
  /** Extra attributes on the landmark (toolbar item hooks). */
  dataAttributes?: Readonly<Record<string, string | number | undefined>>;
  hidden?: boolean | undefined;
}

const NO_ENGINE_SUBSCRIBE = (): (() => void) => () => {};

export function DataGridSearchBox<Row = unknown>(props: DataGridSearchBoxProps<Row>) {
  const instance = use(DataGridInstanceContext);
  const engine: DataGridEngine<unknown> | null = (instance?.engine ?? props.api?.engine ?? null) as DataGridEngine<unknown> | null;
  const text = use(DataGridRenderContext)?.text ?? instance?.interaction.text ?? DEFAULT_GRID_TEXT;
  const read = (): string => (engine?.getSnapshot().query.search?.text ?? '');
  const readServer = (): string => (engine?.getServerSnapshot().query.search?.text ?? '');
  const applied = useSyncExternalStore(engine ? engine.subscribe : NO_ENGINE_SUBSCRIBE, read, readServer);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  /** The text this box last applied; a different applied text came from elsewhere and is shown. */
  const own = useRef<string | null>(null);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input && input.value !== applied && applied !== own.current) input.value = applied;
    own.current = null;
  }, [applied]);
  useLayoutEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const apply = (value: string): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (!engine || value === read()) return;
    const before = props.onBeforeSearch;
    if (before) {
      const event = gridEvent<DataGridSearchBoxSearchEvent>('beforeSearch', 'keyboard', { text: value });
      before(event);
      if (event.defaultPrevented) return;
    }
    own.current = value;
    const command: DataGridCommand = value ? { type: 'search.set', text: value } : { type: 'search.clear' };
    if (instance) instance.dispatchFrom('keyboard', command);
    else engine.dispatch(command);
  };
  const onInput = (value: string): void => {
    const delay = props.debounce ?? 0;
    if (delay <= 0) {
      apply(value);
      return;
    }
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(value), delay);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      apply(event.currentTarget.value);
    } else if (event.key === 'Escape' && event.currentTarget.value !== '') {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.value = '';
      apply('');
    }
  };
  const label = props['aria-label'] ?? text('searchLabel');
  return (
    <div
      {...props.dataAttributes}
      role="search"
      aria-label={label}
      className={props.className ? `salmon-data-grid-search ${props.className}` : 'salmon-data-grid-search'}
      style={props.style}
      hidden={props.hidden}
    >
      <input
        ref={inputRef}
        id={`${id}-input`}
        type="search"
        className="salmon-data-grid-input salmon-data-grid-search__input"
        aria-label={text('search')}
        placeholder={props.placeholder ?? text('search')}
        defaultValue={applied}
        tabIndex={props.tabIndex}
        disabled={props.disabled || !engine}
        title={props.title}
        onFocus={props.onFocus}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
