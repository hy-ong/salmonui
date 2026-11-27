// Public types of the adaptive UI.
// `DataGridProps`, `DataGridApi` and `DataGridLocaleText` extend the interfaces here.

import type { DataGridEvent } from '@salmonui/core/internal/events';

/** Where the adaptive layout applies (`adaptiveUIMode`). */
export type DataGridAdaptiveTarget = 'both' | 'mobile' | 'desktop';

/** Row layout in adaptive mode (`rowRenderingMode`). */
export type DataGridAdaptiveRowLayout = 'horizontal' | 'vertical';

/** `adaptive` prop object form. */
export interface DataGridAdaptive {
  /**
   * `both` (default): adaptive at every width. `mobile`: only while the grid
   * is narrower than `breakpoint`. `desktop`: only while it is at least
   * `breakpoint` wide. Width is the grid's own container width (a container
   * query), not the device or the window.
   */
  readonly target?: DataGridAdaptiveTarget;
  /** `vertical` renders each record as a stacked card of label/value fields. Default `horizontal`. */
  readonly rowLayout?: DataGridAdaptiveRowLayout;
  /** Container width in CSS px that separates `mobile` from `desktop`. Default 640. *Salmon* */
  readonly breakpoint?: number;
  /**
   * Mode used for server rendering and hydration, before the container is
   * measured (`mobile` / `desktop` targets). Default: false. Set it from a
   * user-agent hint to avoid a desktop-to-adaptive switch after mount. *Salmon*
   */
  readonly defaultActive?: boolean;
}

/** Dialog kinds raised through `onBeforeAdaptiveDialogOpen`. */
export type DataGridAdaptiveDialogKind = 'sort' | 'filter';

/** `onBeforeAdaptiveDialogOpen` (`beforeOpenAdaptiveDialog`); `preventDefault()` keeps it closed. */
export interface DataGridAdaptiveDialogOpenEvent extends DataGridEvent {
  readonly kind: DataGridAdaptiveDialogKind;
  /** Filter dialog for one column; undefined opens the column list. */
  readonly field: string | undefined;
}

export interface DataGridAdaptiveProps {
  /**
   * Adaptive UI (`enableAdaptiveUI`, `adaptiveUIMode`, `rowRenderingMode`):
   * full-screen sheets for menus and dialogs, 44 px touch targets, touch
   * long-press, and optional vertical (card) rows. `true` is `{ target: 'both' }`.
   */
  adaptive?: boolean | DataGridAdaptive;
  onBeforeAdaptiveDialogOpen?: (event: DataGridAdaptiveDialogOpenEvent) => void;
}

export interface DataGridAdaptiveApi {
  /** Opens the sort sheet (`showAdaptiveSortDialog`). */
  openSortDialog(): void;
  /** Opens the filter sheet of `field`, or the list of filterable columns (`showAdaptiveFilterDialog`). */
  openFilterDialog(field?: string): void;
  /** True while the adaptive layout applies (derived from the measured container width). *Salmon* */
  isAdaptive(): boolean;
}

