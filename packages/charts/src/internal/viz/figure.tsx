// Figure root shared by every visualization: `<figure>` labelled by the title (or the automatic
// summary), described by the summary, with the accessible data table and the
// polite live region for the focused point. The visual layer (SVG, optional
// canvas, legend buttons, tooltip) goes in `children` inside the surface.

import { cloneElement, type CSSProperties, type ReactElement, type ReactNode, type Ref } from 'react';
import type { TableModel } from '#viz';

export interface VizFigureProps {
  /** Family class, `salmon-chart`. */
  readonly family: string;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly rootRef?: Ref<HTMLElement> | undefined;
  readonly surfaceRef?: Ref<HTMLDivElement> | undefined;
  /** Inline size of the surface (height in px, or undefined for CSS-driven). */
  readonly surfaceStyle?: CSSProperties | undefined;
  readonly idBase: string;
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
  /** Automatic or user description (`description` prop). */
  readonly summary: string;
  readonly table?: TableModel | null | undefined;
  readonly showTable?: boolean | undefined;
  readonly tableSummary?: ((omitted: number) => string) | undefined;
  /** Live region text (the focused point). */
  readonly announcement?: ReactNode;
  readonly children?: ReactNode;
  readonly extra?: Record<string, unknown> | undefined;
  readonly dir?: string | undefined;
}

export function VizFigure(props: VizFigureProps): ReactNode {
  const titleId = `${props.idBase}-title`;
  const summaryId = `${props.idBase}-summary`;
  const hasTitle = Boolean(props.title);
  const className = `salmon-viz ${props.family}${props.className ? ` ${props.className}` : ''}`;
  return (
    <figure
      {...props.extra}
      ref={props.rootRef as Ref<HTMLElement>}
      className={className}
      style={props.style}
      dir={props.dir}
      aria-labelledby={hasTitle ? titleId : undefined}
      aria-label={hasTitle ? undefined : props.summary.split('.')[0]}
      aria-describedby={summaryId}
    >
      {hasTitle ? (
        <figcaption id={titleId} className="salmon-visually-hidden">
          {props.title}
          {props.subtitle ? `. ${props.subtitle}` : null}
        </figcaption>
      ) : null}
      <div ref={props.surfaceRef} className="salmon-viz-surface" style={props.surfaceStyle}>
        {props.children}
      </div>
      <p id={summaryId} className="salmon-visually-hidden">
        {props.summary}
      </p>
      {props.table ? <VizDataTable model={props.table} visible={props.showTable === true} summary={props.tableSummary} /> : null}
      <div className="salmon-visually-hidden" aria-live="polite" aria-atomic="true">
        {props.announcement}
      </div>
    </figure>
  );
}

/**
 * `VizFigure` with an application `aria-label` / `aria-labelledby` in place of
 * the title or summary name. A separate export, so only the families
 * that take a name pay for it; `VizFigure` has no hooks, so calling it is pure.
 */
export function NamedVizFigure({ naming, ...props }: VizFigureProps & { readonly naming?: { readonly 'aria-label': string | undefined; readonly 'aria-labelledby': string | undefined } | undefined }): ReactNode {
  return cloneElement(VizFigure(props) as ReactElement<Record<string, unknown>>, naming);
}

export interface VizDataTableProps {
  readonly model: TableModel;
  readonly visible: boolean;
  readonly summary?: ((omitted: number) => string) | undefined;
}

/** Accessible data table: visually hidden unless `showDataTable`. */
export function VizDataTable({ model, visible, summary }: VizDataTableProps): ReactNode {
  return (
    <table className={visible ? 'salmon-viz-table' : 'salmon-viz-table salmon-visually-hidden'}>
      <caption>{model.caption}</caption>
      <thead>
        <tr>
          {model.columns.map((c, i) => (
            <th key={i} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {model.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) =>
              c === 0 ? (
                <th key={c} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={c}>{cell}</td>
              ),
            )}
          </tr>
        ))}
        {model.omitted > 0 ? (
          <tr>
            <td colSpan={model.columns.length}>{summary ? summary(model.omitted) : `${model.omitted} more rows not shown`}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
