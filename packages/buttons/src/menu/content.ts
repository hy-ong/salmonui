import { isValidElement, type ReactNode } from 'react';
import { Menu, useMenuContent, type MenuProps } from './Menu.js';
import type { MenuItemData } from './types.js';

/**
 * Menu content of a popup that takes a `<Menu>` element (`ContextMenu menu`,
 * `MenubarMenu` children): the element's props are read and its entries are
 * rendered in the popup's own list; any other node is the entries themselves.
 */
export function usePopupMenuContent(
  node: ReactNode,
  items: readonly MenuItemData[] | undefined,
  renderItem: ((item: MenuItemData) => ReactNode) | undefined,
  component: string,
): { readonly content: ReactNode; readonly menu: MenuProps | null } {
  const menu = isValidElement(node) && node.type === Menu ? (node.props as MenuProps) : null;
  const content = useMenuContent(menu ? (menu.children ?? null) : node, menu?.items ?? items, menu?.renderItem ?? renderItem, component);
  return { content, menu };
}
