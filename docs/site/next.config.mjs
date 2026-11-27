import { fileURLToPath } from 'node:url';

// Workspace root: node_modules and the @salmonui/* symlinks live there.
const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

// `SITE_EXPORT=1 next build` is the static export; run it through `npm run site:build` (tooling/site/build-export.mjs).
// With `output: 'export'`, Next.js 16 uses a custom `distDir` as the export
// destination (`out/`, the deployable artifact) and keeps the build
// artifacts in `.next/`; the script parks the server build's `.next/` for
// the export build and moves the export's artifacts to `.next-export/build/`.
// The demo endpoints then run in the browser (lib/demo-api.ts through
// demoFetch), and the `route.api.ts` route handlers are left out by
// `pageExtensions`, so the export contains no `/api/*`.
const staticExport = process.env.SITE_EXPORT === '1';

// One build time per `next dev` / `next build` run (lib/lastmod.ts): a page
// and the sitemap render in different modules or workers, and outside a git
// checkout both fall back to this instant, so their dates must agree.
process.env.SALMON_SITE_BUILD_TIME ??= new Date().toISOString();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Type checking runs through `npm run typecheck --workspace @salmonui/docs-site`
  // (the workspace uses the TypeScript 7 native compiler).
  typescript: { ignoreBuildErrors: true },
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  devIndicators: false,
  poweredByHeader: false,
  // `next dev` would otherwise write an AGENTS.md into docs/site; repo
  // instructions live in the root CLAUDE.md and docs/.
  agentRules: false,
  pageExtensions: staticExport ? ['tsx', 'ts'] : ['api.ts', 'tsx', 'ts'],
  // Markdown versions of the docs pages:
  // `/<page>.md` is served by app/markdown/[...path]/route.ts. Server modes
  // only; the export moves `out/markdown/` up instead (build-export.mjs).
  ...(staticExport
    ? {}
    : {
        async rewrites() {
          return { beforeFiles: [{ source: '/:path((?!markdown/).+\\.md)', destination: '/markdown/:path' }], afterFiles: [], fallback: [] };
        },
      }),
  ...(staticExport
    ? {
        output: 'export',
        distDir: 'out',
        trailingSlash: false,
        images: { unoptimized: true },
        env: { NEXT_PUBLIC_SITE_STATIC: '1' },
      }
    : {}),
};

export default config;
