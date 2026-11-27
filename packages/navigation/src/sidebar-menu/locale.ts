/** Static texts of `SidebarMenu`. Plain JSON, safe to pass from a server component. */
export interface SidebarMenuLocaleText {
  /** Accessible name of the `<nav>` landmark (screen readers add "navigation"). */
  readonly label: string;
}

export const SIDEBAR_MENU_DEFAULT_LOCALE_TEXT: SidebarMenuLocaleText = Object.freeze({
  label: 'Main',
});
