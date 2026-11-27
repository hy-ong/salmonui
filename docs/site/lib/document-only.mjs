// Document-only routes: pages the
// static export ships as HTML (and `.md`) only, without the RSC payload
// (`<page>.txt`) and the `__next.*` segment prefetch files Next.js writes
// for client-side navigation. Every link to them is a plain `<a>` (or
// `location.assign`), never `next/link` or `router.push`, so the browser
// never asks for the missing payload. Today: every API reference page
// below the package level (`/docs/reference/<pkg>/<entry>`,
// `/docs/reference/<pkg>/<symbol>` and
// `/docs/reference/<pkg>/<entry>/<symbol>`); `/docs/reference` and the
// `/docs/reference/<pkg>` pages the sidebar links keep their payloads.
//
// Zero dependencies and no DOM: imported by the site's components,
// tooling/site/build-export.mjs and tooling/site/check-out.mjs.

const DOCUMENT_ONLY = /^\/docs\/reference\/[^/]+\/[^/]/;

/**
 * Whether the page at `href` (a root-relative URL; query and hash are
 * ignored) is exported without its client navigation payload.
 */
export function isDocumentOnlyPath(href) {
  const path = String(href).replace(/[?#].*$/, '');
  return DOCUMENT_ONLY.test(path);
}
