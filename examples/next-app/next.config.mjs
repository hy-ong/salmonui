// Next.js 16 App Router example.
// The workspace packages are prebuilt ESM in dist/, so no transpilePackages.
const root = new URL('../../', import.meta.url).pathname;

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // npm workspaces hoist dependencies to the repository root.
  turbopack: { root },
  outputFileTracingRoot: root,
  // The workspace TypeScript is the native compiler (typescript@7), which has
  // no JS API for Next's build-time check; `npm run typecheck` covers sources.
  typescript: { ignoreBuildErrors: true },
};

export default config;
