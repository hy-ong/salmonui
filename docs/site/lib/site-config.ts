// Build-time site flags. Server-only.

/**
 * True until the v1 npm publish: every place that mentions npm availability
 * reads this flag and shows "Pre-release: not yet published on npm". The v1
 * publish commit sets it to `false`.
 */
export const prerelease: boolean = false;

/**
 * Repository base URL without a trailing slash, or undefined (the default):
 * the repository is private, so no repository links are rendered unless
 * `SITE_REPO_URL` is set at build time. This is the only reader of it.
 */
export const siteRepoUrl: string | undefined = process.env.SITE_REPO_URL?.trim().replace(/\/+$/, '') || undefined;

/**
 * False for preview builds (`SITE_INDEXABLE=0`): robots.txt disallows everything and every page carries a
 * `noindex` robots meta tag. Any other value, or unset, is indexable.
 */
export const siteIndexable: boolean = process.env.SITE_INDEXABLE?.trim() !== '0';
