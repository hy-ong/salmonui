// List: the display list, a
// `<ul>` / `<ol>` with classes, no JavaScript behavior. Selection lists are
// `Listbox` (`@salmonui/dropdowns/listbox`). Server-safe. Item layout (a leading
// `Avatar`, a trailing `Badge`) is CSS on `.salmon-list-item`: a flex row
// whose `.salmon-list-item-description` children wrap under the label.

import type { HTMLAttributes, LiHTMLAttributes, ReactElement } from 'react';

export interface ListProps extends HTMLAttributes<HTMLUListElement | HTMLOListElement> {
  /** `<ol>` instead of `<ul>`. */
  readonly ordered?: boolean | undefined;
}

const el = (Tag: 'ul' | 'ol' | 'li', base: string, { className, ...rest }: HTMLAttributes<HTMLElement>): ReactElement => <Tag {...rest} className={className ? `${base} ${className}` : base} />;

/** Display list (`.salmon-list`). */
export function List({ ordered, ...props }: ListProps): ReactElement {
  return el(ordered ? 'ol' : 'ul', 'salmon-list', props);
}

/** One item (`.salmon-list-item`), a flex row for `Avatar`, text and trailing content. */
export function ListItem(props: LiHTMLAttributes<HTMLLIElement>): ReactElement {
  return el('li', 'salmon-list-item', props);
}

export type ListItemProps = LiHTMLAttributes<HTMLLIElement>;

List.Item = ListItem;
