// Legend: drawn in the SVG (symbols and possibly truncated
// text, so server and client agree and export keeps it), with an HTML APG
// Toolbar of toggle buttons laid over the drawn items: one tab stop, roving
// arrows mirrored in RTL, `aria-pressed`, the full label as accessible name.

import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { LEGEND_SYMBOL, LEGEND_SYMBOL_GAP, lineHeight, n2, pct, symbolPath, type LegendLayout, type SymbolShape } from '#viz';
import { isRtl } from '@salmonui/core/internal/position';
import { applyRovingMove, rovingMove } from '@salmonui/core/internal/roving';

export type LegendShape = SymbolShape | 'line' | 'area' | 'column' | 'seriesType';

export interface VizLegendItem {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly shape: LegendShape;
  /** Toggled off (series or point hidden). */
  readonly hidden: boolean;
  readonly lineStyle?: 'solid' | 'dashed' | 'dotted' | undefined;
}

export interface LegendSymbolProps {
  readonly shape: LegendShape;
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly size?: number;
  readonly dash?: string | undefined;
}

/** Legend glyph at (x, y) = top-left of the symbol box. */
export function LegendSymbol({ shape, x, y, color, size = LEGEND_SYMBOL, dash }: LegendSymbolProps): ReactNode {
  const cx = x + size / 2;
  const cy = y + size / 2;
  if (shape === 'line') return <path d={`M${n2(x)},${n2(cy)}H${n2(x + size)}`} stroke={color} strokeWidth={2} strokeDasharray={dash} fill="none" />;
  if (shape === 'column' || shape === 'area' || shape === 'seriesType' || shape === 'rectangle') return <rect x={n2(x)} y={n2(y)} width={size} height={size} rx={2} fill={color} />;
  const stroke = shape === 'cross' || shape === 'plus' || shape === 'multiply' || shape === 'horizontalLine' || shape === 'verticalLine';
  return <path d={symbolPath(shape, cx, cy, size)} fill={stroke ? 'none' : color} stroke={stroke ? color : undefined} strokeWidth={stroke ? 2 : undefined} />;
}

export interface LegendSvgProps {
  readonly layout: LegendLayout;
  readonly items: readonly VizLegendItem[];
  readonly page: number;
}

/** The drawn legend (aria-hidden with the rest of the SVG). */
export function LegendSvg({ layout, items, page }: LegendSvgProps): ReactNode {
  const lh = lineHeight('sm');
  return (
    <g className="salmon-viz-legend-marks">
      {layout.title ? (
        <text className="salmon-viz-legend-title" x={n2(layout.title.x)} y={n2(layout.title.y)}>
          {layout.title.text}
        </text>
      ) : null}
      {layout.items.map((box) => {
        if (box.page !== page) return null;
        const item = items[box.index];
        if (!item) return null;
        const sy = box.y + (box.height - LEGEND_SYMBOL) / 2;
        return (
          <g key={item.id} data-hidden={item.hidden ? '' : undefined} className="salmon-viz-legend-item">
            <LegendSymbol shape={item.shape} x={box.x} y={sy} color={item.hidden ? 'var(--salmon-text-disabled)' : item.color} dash={item.lineStyle === 'dashed' ? '6 3' : item.lineStyle === 'dotted' ? '2 3' : undefined} />
            <text x={n2(box.x + LEGEND_SYMBOL + LEGEND_SYMBOL_GAP)} y={n2(box.y + box.height / 2 + lh * 0.32)}>
              {box.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export interface LegendButtonsProps {
  readonly layout: LegendLayout;
  readonly items: readonly VizLegendItem[];
  readonly width: number;
  readonly height: number;
  readonly page: number;
  readonly label: string;
  /** Toggling disabled (`legend.toggle: false`): buttons are plain, not pressed toggles. */
  readonly toggle: boolean;
  readonly onToggle?: ((id: string, event: MouseEvent | KeyboardEvent) => void) | undefined;
  readonly onHighlight?: ((id: string | null) => void) | undefined;
  /** After the item buttons: the `LegendPager` of a paged legend. */
  readonly children?: ReactNode;
}


/** HTML toolbar over the drawn legend. */
export function LegendButtons(props: LegendButtonsProps): ReactNode {
  const { layout, items, width, height, page } = props;
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const visible = layout.items.filter((b) => b.page === page);
  const count = visible.length;
  const current = Math.min(active, Math.max(0, count - 1));
  const orientation = layout.position === 'start' || layout.position === 'end' ? 'vertical' : 'horizontal';
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = rovingMove(event.key, { orientation, rtl: isRtl(event.currentTarget) });
    if (!move) return;
    event.preventDefault();
    const next = applyRovingMove(move, count, current, () => true);
    setActive(next);
    refs.current[next]?.focus();
  };
  return (
    <div role="toolbar" aria-label={props.label} aria-orientation={orientation} className="salmon-viz-legend" onKeyDown={onKeyDown}>
      {visible.map((box, i) => {
        const item = items[box.index];
        if (!item) return null;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            className="salmon-viz-legend-button"
            tabIndex={i === current ? 0 : -1}
            aria-pressed={props.toggle ? !item.hidden : undefined}
            // Physical offsets: they track the SVG drawing, which never mirrors. The button reaches 6 px into
            // the item gaps: the item width is the deterministic text estimate, and a font wider than it
            // (DejaVu or Noto Sans for system-ui) still draws the label end under the button.
            style={{ left: pct(box.x - 6, width), top: pct(box.y - 1, height), width: pct(box.width + 12, width), height: pct(box.height + 2, height) }}
            onFocus={() => {
              setActive(i);
              props.onHighlight?.(item.id);
            }}
            onBlur={() => props.onHighlight?.(null)}
            onPointerEnter={() => props.onHighlight?.(item.id)}
            onPointerLeave={() => props.onHighlight?.(null)}
            onClick={(event) => props.onToggle?.(item.id, event)}
          >
            <span className="salmon-visually-hidden">{item.label}</span>
          </button>
        );
      })}
      {props.children}
    </div>
  );
}

export interface LegendPagerProps {
  readonly layout: LegendLayout;
  readonly width: number;
  readonly height: number;
  readonly page: number;
  readonly text: { readonly previousLegendPage: string; readonly nextLegendPage: string };
  readonly onPage: (page: number) => void;
}

/**
 * Page buttons of a paged legend (legend `overflow: 'page'`), passed as the
 * `children` of `LegendButtons`. A separate component, so the families
 * without paged legends do not carry it.
 */
export function LegendPager({ layout, width, height, page, text, onPage }: LegendPagerProps): ReactNode {
  return layout.pages > 1 ? (
    <span className="salmon-viz-legend-pager" style={{ left: pct(layout.x + layout.width + 4, width), top: pct(layout.y, height) }}>
      <button type="button" className="salmon-viz-legend-page" tabIndex={-1} aria-label={text.previousLegendPage} disabled={page <= 0} onClick={() => onPage(page - 1)}>
        ‹
      </button>
      <span aria-live="polite">{`${page + 1}/${layout.pages}`}</span>
      <button type="button" className="salmon-viz-legend-page" tabIndex={-1} aria-label={text.nextLegendPage} disabled={page >= layout.pages - 1} onClick={() => onPage(page + 1)}>
        ›
      </button>
    </span>
  ) : null;
}
