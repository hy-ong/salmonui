import type { CSSProperties, ReactNode, Ref } from 'react';
import type { VizInstance } from '../internal/viz/instance.js';

export type SankeyChartApi = VizInstance;

export interface SankeyNode {
  readonly id: string;
  readonly label?: string | undefined;
  /** Pixel shift along the column after layout. */
  readonly offset?: number | undefined;
  /** Data color. */
  readonly color?: string | undefined;
}

export interface SankeyLink {
  readonly source: string;
  readonly target: string;
  readonly value: number;
}

export interface SankeyNodeInfo {
  readonly index: number;
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly column: number;
  readonly color: string;
}

export interface SankeyLinkInfo {
  /** Index in `links`. */
  readonly index: number;
  readonly source: SankeyNodeInfo;
  readonly target: SankeyNodeInfo;
  readonly value: number;
}

export interface SankeyEvent {
  readonly source: 'pointer' | 'keyboard' | 'touch';
}

/** Built-in text of a SankeyChart (`text` prop; the `sankeyChart` entry of a `LocaleProvider` catalog). */
export interface SankeyChartText {
  /** Name and role description of the chart when there is no `title`. Default `"Sankey chart"`. */
  readonly sankeyChart: string;
  readonly legend: string;
  /** Data table headers. */
  readonly source: string;
  readonly target: string;
  readonly value: string;
}

export interface SankeyChartProps {
  readonly nodes: readonly SankeyNode[];
  readonly links: readonly SankeyLink[];
  readonly orientation?: 'horizontal' | 'vertical' | undefined;
  /** Node thickness across the flow, px. Default 16. */
  readonly nodeWidth?: number | undefined;
  /** Gap between nodes in a column, px. Default 12. */
  readonly nodePadding?: number | undefined;
  /** Link color: the source or target node color, or a gradient between them. Default `source`. */
  readonly linkColor?: 'source' | 'target' | 'gradient' | undefined;
  /** 0 (straight) .. 1. Default 0.5. */
  readonly curvature?: number | undefined;
  readonly labels?: boolean | { readonly position?: 'inside' | 'outside' | undefined } | undefined;
  readonly legend?: boolean | { readonly position?: 'top' | 'bottom' | 'start' | 'end' | undefined; readonly title?: string | undefined } | undefined;
  readonly tooltip?: boolean | { readonly renderNode?: ((node: SankeyNodeInfo) => ReactNode) | undefined; readonly renderLink?: ((link: SankeyLinkInfo) => ReactNode) | undefined } | undefined;
  /** Dim everything not connected to the hovered or focused node or link. Default `adjacent`. */
  readonly highlight?: 'adjacent' | false | undefined;
  readonly onNodeClick?: ((node: SankeyNodeInfo, event: SankeyEvent) => void) | undefined;
  readonly onLinkClick?: ((link: SankeyLinkInfo, event: SankeyEvent) => void) | undefined;
  readonly onNodeHover?: ((node: SankeyNodeInfo | null) => void) | undefined;
  readonly onLinkHover?: ((link: SankeyLinkInfo | null) => void) | undefined;
  readonly getNodeStyle?: ((node: SankeyNodeInfo) => { readonly color?: string | undefined } | undefined) | undefined;
  readonly getLinkStyle?: ((link: SankeyLinkInfo) => { readonly color?: string | undefined; readonly opacity?: number | undefined } | undefined) | undefined;
  readonly formatLabel?: ((node: SankeyNodeInfo) => string) | undefined;
  readonly format?: Intl.NumberFormatOptions | ((value: number) => string) | undefined;
  readonly locale?: string | undefined;
  /** Built-in text (over the nearest `LocaleProvider`'s `sankeyChart` entry). */
  readonly text?: Partial<SankeyChartText> | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
  readonly description?: string | undefined;
  readonly showDataTable?: boolean | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly id?: string | undefined;
  readonly ref?: Ref<SankeyChartApi> | undefined;
  readonly onResize?: ((size: { readonly width: number; readonly height: number }) => void) | undefined;
  /**
   * Entrance and update transitions, default `true`: client only
   * (never in server markup), off under `prefers-reduced-motion`. The CSS is
   * the opt-in `@salmonui/charts/viz-animations.css`.
   */
  readonly animated?: boolean | undefined;
}
