/** Static texts of `TreeView`; `{param}` templates. Plain JSON, safe to pass from a server component. */
export interface TreeViewLocaleText {
  readonly loading: string;
  readonly loadError: string;
  readonly retry: string;
  /** `{label}`: the inline editor's accessible name. */
  readonly rename: string;
  /** `{label}`, `{target}`: announced after a move. */
  readonly moved: string;
}

export const TREE_VIEW_DEFAULT_LOCALE_TEXT: TreeViewLocaleText = Object.freeze({
  loading: 'Loading…',
  loadError: 'Failed to load',
  retry: 'Retry',
  rename: 'Rename {label}',
  moved: '{label} moved',
});

/** `{param}` substitution. */
export function formatTreeViewText(template: string, params: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => (key in params ? String(params[key]) : all));
}
