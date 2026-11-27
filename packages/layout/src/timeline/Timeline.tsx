// Timeline: an `<ol>` of `<li>` items,
// list semantics, no APG pattern. No hooks or context, so it renders in
// React Server Components. `items` and `Timeline.Item` children produce the
// same markup.

import { Children, type HTMLAttributes, type LiHTMLAttributes, type ReactElement, type ReactNode } from 'react';

export type TimelineTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger';

const cx = (base: string, extra: string | undefined): string => (extra ? `${base} ${extra}` : base);

/** One entry of the `items` array. */
export interface TimelineItemData {
  readonly content?: ReactNode;
  /** Content on the other side of the marker. */
  readonly opposite?: ReactNode;
  /** Replaces the default dot (an icon, an avatar). */
  readonly marker?: ReactNode;
  readonly tone?: TimelineTone | undefined;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
  /** React key; default the index. */
  readonly key?: string | number | undefined;
}

export interface TimelineItemProps extends Omit<LiHTMLAttributes<HTMLLIElement>, 'content'> {
  readonly children?: ReactNode;
  readonly opposite?: ReactNode;
  readonly marker?: ReactNode;
  /** Default `'neutral'`. */
  readonly tone?: TimelineTone | undefined;
  /** Muted style and `aria-disabled`. */
  readonly disabled?: boolean | undefined;
}

/** One item (`.salmon-timeline-item`): opposite content, the marker with its connector, the content. */
export function TimelineItem(props: TimelineItemProps): ReactElement {
  const { children, opposite, marker, tone = 'neutral', disabled, className, ...rest } = props;
  return (
    <li {...rest} className={cx('salmon-timeline-item', className)} data-tone={tone} aria-disabled={disabled || undefined}>
      <div className="salmon-timeline-opposite">{opposite}</div>
      <div className="salmon-timeline-marker" aria-hidden="true">
        {marker ?? <span className="salmon-timeline-dot" />}
      </div>
      <div className="salmon-timeline-content">{children}</div>
    </li>
  );
}

export interface TimelineProps extends HTMLAttributes<HTMLOListElement> {
  /** Data form of the items; wins over `children`. */
  readonly items?: readonly TimelineItemData[] | undefined;
  /** Renders each `items` entry; default its `content`. */
  readonly renderItem?: ((item: TimelineItemData, state: { index: number; first: boolean; last: boolean }) => ReactNode) | undefined;
  /** `Timeline.Item` children. */
  readonly children?: ReactNode;
  /** Default `'vertical'`. */
  readonly orientation?: 'vertical' | 'horizontal' | undefined;
  /** Side of the content relative to the line: `'end'` (default), `'start'`, `'alternate'`, `'alternateReverse'`; logical, follows `dir`. */
  readonly align?: 'start' | 'end' | 'alternate' | 'alternateReverse' | undefined;
  /** Reverses the DOM order, so reading order matches the visual order. */
  readonly reverse?: boolean | undefined;
}

/** Timeline (`.salmon-timeline`, `data-orientation`, `data-align`). */
export function Timeline(props: TimelineProps): ReactElement {
  const { items, renderItem, children, orientation = 'vertical', align = 'end', reverse, className, ...rest } = props;
  let list: ReactNode[];
  if (items) {
    const n = items.length;
    list = items.map((item, index) => (
      <TimelineItem key={item.key ?? index} opposite={item.opposite} marker={item.marker} tone={item.tone} disabled={item.disabled} className={item.className}>
        {renderItem ? renderItem(item, { index, first: index === 0, last: index === n - 1 }) : item.content}
      </TimelineItem>
    ));
  } else list = Children.toArray(children);
  if (reverse) list.reverse();
  return (
    <ol {...rest} className={cx('salmon-timeline', className)} data-orientation={orientation} data-align={align}>
      {list}
    </ol>
  );
}

Timeline.Item = TimelineItem;
