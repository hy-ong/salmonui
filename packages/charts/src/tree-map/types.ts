import type { CSSProperties, DOMAttributes, ReactNode, Ref } from 'react';
import type { VizChangeEvent } from '../internal/viz/frame.js';
import type { VizInstance } from '../internal/viz/instance.js';

export type TreeMapApi = VizInstance;
export type TreeMapChangeEvent = VizChangeEvent<'drill' | 'breadcrumb' | 'keyboard' | 'click'>;

/** Path of group keys and leaf labels from the root (the drill-down address). */
export type TreeMapPath = readonly string[];

export interface TreeMapItem {
  readonly path: TreeMapPath;
  readonly label: string;
  readonly value: number;
  /** Depth below the root (1 = top level). */
  readonly depth: number;
  readonly leaf: boolean;
  /** The record for leaves and hierarchical groups; null for groups built by `levels`. */
  readonly datum: unknown;
  readonly color: string;
}

export interface TreeMapHeaderOptions {
  readonly format?: ((item: TreeMapItem) => string) | undefined;
  readonly render?: ((item: TreeMapItem) => ReactNode) | undefined;
  readonly align?: 'start' | 'center' | 'end' | undefined;
}

export interface TreeMapLevel {
  /** Group flat data by this field (or accessor). */
  readonly groupBy?: string | ((datum: unknown) => string) | undefined;
  /** Gap between the groups of this level, px. Default 2. */
  readonly gap?: number | undefined;
  /** Header band with the group label. Default true. */
  readonly header?: boolean | TreeMapHeaderOptions | undefined;
}

export type TreeMapLabelPosition = 'topStart' | 'topCenter' | 'topEnd' | 'centerStart' | 'center' | 'centerEnd' | 'bottomStart' | 'bottomCenter' | 'bottomEnd';

export interface TreeMapLeaves {
  readonly labelField?: string | undefined;
  /** Value format in the label and tooltip. */
  readonly format?: Intl.NumberFormatOptions | ((value: number) => string) | undefined;
  readonly labelPosition?: TreeMapLabelPosition | undefined;
  readonly labelOverflow?: 'trim' | 'hide' | 'wrapWord' | 'wrap' | undefined;
  /** HTML content laid over the leaf instead of the drawn label. */
  readonly render?: ((item: TreeMapItem) => ReactNode) | undefined;
  /** Gap between leaves, px. Default 1. */
  readonly gap?: number | undefined;
  /** Show `label value` instead of the label alone. */
  readonly showValue?: boolean | undefined;
}

export interface TreeMapColorStop {
  /** Range start (`range`), the exact value (`value`) or the opacity end (`opacity`). */
  readonly value: number | string;
  readonly color: string;
}

export interface TreeMapColorScale {
  readonly kind: 'range' | 'value' | 'opacity';
  /** Record field the scale reads; default the weight. */
  readonly field?: string | undefined;
  readonly stops: readonly TreeMapColorStop[];
}

/** DOM handlers passed to the `<figure>` root. */
export type TreeMapRootHandlers = Pick<DOMAttributes<HTMLElement>, 'onClick' | 'onDoubleClick' | 'onContextMenu' | 'onPointerMove'>;

/** Built-in text of a TreeMap (`text` prop; the `treeMap` entry of a `LocaleProvider` catalog). */
export interface TreeMapText {
  /** Name and role description of the map when there is no `title`. Default `"Tree map"`. */
  readonly treeMap: string;
  /** Name of the breadcrumb navigation. */
  readonly path: string;
  /** Breadcrumb root. */
  readonly all: string;
  readonly legend: string;
}

export interface TreeMapProps extends TreeMapRootHandlers {
  readonly data: readonly unknown[];
  readonly weightField?: string | undefined;
  /** Hierarchical data: children of a record. */
  readonly childrenField?: string | undefined;
  readonly levels?: readonly TreeMapLevel[] | undefined;
  readonly layout?: 'squarified' | 'sliceHorizontal' | 'sliceVertical' | 'sliceAuto' | undefined;
  readonly direction?: 'topStart' | 'topEnd' | 'bottomStart' | 'bottomEnd' | undefined;
  readonly leaves?: TreeMapLeaves | undefined;
  /** Data color field of a record. */
  readonly colorField?: string | undefined;
  readonly colorScale?: TreeMapColorScale | undefined;
  /** Data colors per top-level group; default the derived palette. */
  readonly palette?: readonly string[] | undefined;
  readonly path?: TreeMapPath | undefined;
  readonly defaultPath?: TreeMapPath | undefined;
  readonly onPathChange?: ((path: TreeMapPath, event: TreeMapChangeEvent) => void) | undefined;
  /** Clicking a group drills into it. Default `'click'`. */
  readonly drill?: 'click' | false | undefined;
  readonly breadcrumbs?: boolean | undefined;
  /** Keep the ancestors of the drilled node as header bands. */
  readonly showParentLevels?: boolean | undefined;
  readonly selection?: boolean | { readonly mode?: 'item' | 'group' | undefined; readonly multiple?: boolean | undefined } | undefined;
  readonly selectedItems?: readonly TreeMapPath[] | undefined;
  readonly defaultSelectedItems?: readonly TreeMapPath[] | undefined;
  readonly onSelectedItemsChange?: ((items: readonly TreeMapPath[], event: TreeMapChangeEvent) => void) | undefined;
  /** Outline the hovered item. Default true. */
  readonly highlight?: boolean | undefined;
  readonly onItemHover?: ((item: TreeMapItem | null) => void) | undefined;
  readonly onItemClick?: ((item: TreeMapItem, event: TreeMapChangeEvent) => void) | undefined;
  readonly getItemStyle?: ((item: TreeMapItem) => { readonly color?: string | undefined } | undefined) | undefined;
  /** Legend of the top-level groups; `interactive` highlights a group on hover. */
  readonly legend?: boolean | { readonly mode?: 'list' | 'interactive' | undefined; readonly position?: 'top' | 'bottom' | 'start' | 'end' | undefined; readonly title?: string | undefined } | undefined;
  readonly tooltip?: boolean | { readonly render?: ((item: TreeMapItem) => ReactNode) | undefined } | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
  readonly description?: string | undefined;
  readonly locale?: string | undefined;
  /** Built-in text (over the nearest `LocaleProvider`'s `treeMap` entry). */
  readonly text?: Partial<TreeMapText> | undefined;
  /** Breadcrumb root label. Default `text.all` ("All"). */
  readonly rootLabel?: string | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly id?: string | undefined;
  readonly ref?: Ref<TreeMapApi> | undefined;
  readonly onResize?: ((size: { readonly width: number; readonly height: number }) => void) | undefined;
  /**
   * Entrance and update transitions, default `true`: client only
   * (never in server markup), off under `prefers-reduced-motion`. The CSS is
   * the opt-in `@salmonui/charts/viz-animations.css`.
   */
  readonly animated?: boolean | undefined;
}
