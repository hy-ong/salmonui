// Adaptive UI controller for one DataGrid. The core holds no adaptive state: the
// adaptive mode is a pure projection of the grid's measured container width
// (renderer-local, like every other viewport input) and the `adaptive` prop.
// The width itself never reaches React; React reads only the derived
// booleans through useSyncExternalStore, so a resize re-renders only when
// the mode flips. Touch multi-select mode is the engine's own selection
// option (`simpleMultiRow`), so it lives in the engine store. Long-press
// timers exist only while a finger is down (no idle timers).
//
// This part is the `adaptive` render feature (features/feature-adaptive.tsx),
// resolved before creation because the adaptive layout renders on the server
// (`target: 'both'`, `defaultActive`): the mode store, the measurement, the
// open dialog state and the multi-select mode. A grid without `adaptive`
// never loads it (`instance.adaptive` is null). Opening the
// sheets and the touch long-press are the lazy adaptive chunk
// (`adaptive-chunk.ts`), loaded when a
// grid with `adaptive` is created on the client; a sheet opened before it
// arrives opens once it is loaded.

import type { ColumnId, SelectionState } from '@salmonui/data-grid/engine';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { DataGridAdaptiveInteraction } from './adaptive-interaction.js';
import type { AdaptiveView } from './adaptive-view.js';
import type { DataGridText } from './locale-text.js';
import type { DataGridEventSource } from '@salmonui/core/internal/events';
import type { DataGridInstance } from './instance.js';
import type { AnchorRect } from './anchor.js';

/** The lazy adaptive chunk. */
export type AdaptiveChunk = typeof import('./adaptive-chunk.js');

// One load per page (a load cache, not render state).
let chunkLoad: Promise<AdaptiveChunk> | null = null;
let loadedChunk: AdaptiveChunk | null = null;

/** Starts (once) and returns the adaptive chunk load. */
export function loadAdaptiveChunk(): Promise<AdaptiveChunk> {
  return (chunkLoad ??= import('./adaptive-chunk.js').then((chunk) => (loadedChunk = chunk)));
}

export type AdaptiveDialog =
  | { readonly kind: 'sort'; readonly anchor: AnchorRect; readonly container: Element }
  | { readonly kind: 'filterColumns'; readonly anchor: AnchorRect; readonly container: Element };

type Listener = () => void;

export class DataGridAdaptiveController<Row> {
  private readonly instance: DataGridInstance<Row>;
  private readonly listeners = new Set<Listener>();
  /** DataGrid root content width (px); 0 until measured. */
  private width = 0;
  private dialog: AdaptiveDialog | null = null;
  private returnFocus: Element | null = null;
  /** A touch tap selected a row (the multi-select toggle shows from then on). */
  private touchSelected = false;
  private views = new Map<string, AdaptiveView>();
  /** The loaded chunk and the interaction built from it. */
  private chunk: AdaptiveChunk | null = null;
  private interaction: DataGridAdaptiveInteraction<Row> | null = null;
  private mounted = false;
  /** Sheets opened before the chunk loaded. */
  private queue: ((interaction: DataGridAdaptiveInteraction<Row>) => void)[] = [];

  constructor(instance: DataGridInstance<Row>) {
    this.instance = instance;
    if (!instance.props.adaptive) return;
    if (loadedChunk) this.attach(loadedChunk);
    // Warm the chunk on the client (the server renders the layout without it).
    else if (typeof window !== 'undefined') void loadAdaptiveChunk().catch(() => undefined);
  }

  private attach(chunk: AdaptiveChunk): void {
    if (this.interaction) return;
    this.chunk = chunk;
    this.interaction = new chunk.DataGridAdaptiveInteraction<Row>(this.instance, this);
    this.emit();
  }

  /** Runs `work` now, or once the chunk is loaded and the grid mounted. */
  private run(work: (interaction: DataGridAdaptiveInteraction<Row>) => void): void {
    if (this.interaction && this.mounted) work(this.interaction);
    else this.queue.push(work);
  }

  /** The loaded chunk (sheets), or null before it loads (and on the server). */
  readonly getChunk = (): AdaptiveChunk | null => this.chunk;
  readonly getServerChunk = (): AdaptiveChunk | null => null;

  // ------------------------------------------------------------------------
  // Store
  // ------------------------------------------------------------------------

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** The measured root content width (px); 0 before mount and on the server. The mode is `adaptive-view.ts` `adaptiveActiveFor`. */
  readonly getWidth = (): number => this.width;

  /** Stable view object per (active, vertical, close label). */
  viewOf(active: boolean, vertical: boolean, closeLabel: string): AdaptiveView {
    const key = `${active ? 1 : 0}${vertical ? 1 : 0}${closeLabel}`;
    let view = this.views.get(key);
    if (!view) {
      view = Object.freeze({ active, vertical: active && vertical, sheet: active ? Object.freeze({ closeLabel }) : null });
      this.views.set(key, view);
    }
    return view;
  }

  /** Adaptive UI text: the grid catalog (`adaptive*` keys). */
  get text(): DataGridText {
    return this.instance.text;
  }

  readonly getDialog = (): AdaptiveDialog | null => this.dialog;
  readonly getServerDialog = (): AdaptiveDialog | null => null;
  readonly getTouchSelected = (): boolean => this.touchSelected;
  readonly getServerTouchSelected = (): boolean => false;

  // ------------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------------

  /** Client-only: measures the root (after commit) and observes it with the grid's shared ResizeObserver. */
  mount(): () => void {
    const root = this.instance.root;
    let live = true;
    const start = (): void => {
      if (!live || !this.interaction) return;
      this.mounted = true;
      const queue = this.queue;
      this.queue = [];
      for (const work of queue) work(this.interaction);
    };
    if (this.interaction) start();
    else
      loadAdaptiveChunk().then(
        (chunk) => {
          if (!live) return;
          this.attach(chunk);
          start();
        },
        () => undefined,
      );
    const offChrome = this.instance.chrome.subscribe(() => {
      // One overlay at a time: a chrome overlay replaces an adaptive dialog.
      if (this.instance.chrome.isOpen() && this.dialog) {
        this.dialog = null;
        this.emit();
      }
    });
    if (!root) {
      return () => {
        live = false;
        this.mounted = false;
        offChrome();
      };
    }
    const measure = (): void => {
      const width = root.clientWidth;
      if (width === this.width) return;
      this.width = width;
      this.emit();
    };
    measure();
    const offObserve = this.instance.observeElement(root, measure);
    return () => {
      live = false;
      this.mounted = false;
      offObserve();
      offChrome();
      this.interaction?.cancelPress();
      this.width = 0;
    };
  }

  // ------------------------------------------------------------------------
  // Dialogs
  // ------------------------------------------------------------------------

  /** Opens the sort sheet (once the chunk is loaded). */
  openSortDialog(source: DataGridEventSource, invoker: Element | null = null): void {
    this.run((i) => i.openSortDialog(source, invoker));
  }

  /** Opens the filter sheet of `field`, or the filterable column list (once the chunk is loaded). */
  openFilterDialog(field: string | undefined, source: DataGridEventSource, invoker: Element | null = null): void {
    this.run((i) => i.openFilterDialog(field, source, invoker));
  }

  /** Sets the open dialog (the chunk opens them); keeps the first invoker for focus return. */
  setDialog(dialog: AdaptiveDialog, invoker: Element | null): void {
    if (!this.dialog) this.returnFocus = invoker;
    this.dialog = dialog;
    this.emit();
  }

  returnFocusElement(): Element | null {
    return this.returnFocus;
  }

  /** Closes the adaptive dialog; focus returns to the invoker (or the grid content). */
  readonly close = (restore = true): void => {
    if (!this.dialog) return;
    this.dialog = null;
    const el = this.returnFocus;
    this.returnFocus = null;
    this.emit();
    if (!restore) return;
    if (el && el.isConnected && el instanceof HTMLElement) el.focus({ preventScroll: true });
    else this.instance.interaction.focusContent();
  };

  /** Filter column list: closes the list and opens that column's filter sheet. */
  pickFilterColumn(columnId: ColumnId): void {
    this.interaction?.pickFilterColumn(columnId);
  }

  // ------------------------------------------------------------------------
  // Touch: multi-select mode, long-press
  // ------------------------------------------------------------------------

  private selection(): SelectionState | undefined {
    return this.instance.interaction.selectionState();
  }

  /** Multiple row selection is on (the multi-select affordance applies). */
  multiSelectAvailable(): boolean {
    const s = this.selection();
    return s !== undefined && s.options.enabled && s.options.type === 'multiple' && s.options.mode !== 'cell';
  }

  /** Multi-select mode: plain taps toggle rows (engine option `simpleMultiRow`). */
  multiSelectOn(): boolean {
    return this.selection()?.options.simpleMultiRow === true;
  }

  setMultiSelect(on: boolean, source: DataGridEventSource): void {
    if (!this.multiSelectAvailable()) return;
    const base = (this.instance.props.selection && typeof this.instance.props.selection === 'object' ? this.instance.props.selection.additive : undefined) ?? false;
    this.instance.dispatchFrom(source, { type: 'selection.setOptions', options: { simpleMultiRow: on || base } } as never);
  }

  /** The first touch selection (the multi-select toggle shows from then on). */
  markTouchSelected(): void {
    if (this.touchSelected) return;
    this.touchSelected = true;
    this.emit();
  }

  // Long-press handlers: the chunk's; a press before it loads is queued and runs once it is attached.
  readonly onPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    const at = performance.now();
    this.run((i) => i.onPointerDown(event, at));
  };

  readonly onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    if (this.queue.length || this.interaction) this.run((i) => i.onPointerMove(event));
  };

  readonly onPointerEnd = (event: ReactPointerEvent<HTMLElement>): void => {
    this.run((i) => i.onPointerEnd(event));
  };

  /** Click capture: swallows the click that ends a long-press; records the first touch selection. */
  readonly onClickCapture = (event: ReactMouseEvent<HTMLElement>): void => {
    if (this.interaction?.consumeClick(event)) return;
    if (this.touchSelected || (event.nativeEvent as PointerEvent).pointerType !== 'touch') return;
    if (!(event.target as Element).closest('.salmon-data-grid-rows [data-row-id]')) return;
    if (!this.multiSelectAvailable()) return;
    this.markTouchSelected();
  };

  readonly onContextMenuCapture = (event: ReactMouseEvent<HTMLElement>): void => {
    this.interaction?.onContextMenuCapture(event);
  };
}
