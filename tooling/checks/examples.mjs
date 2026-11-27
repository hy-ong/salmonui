// test:examples: builds the three
// examples and smoke-checks their production artifacts:
// - CSS present: the Salmon UI grid and theme CSS is in the emitted CSS;
// - no forbidden code in the output (banned UI library packages,
//   Tailwind, XLSX/PDF writers; the FORBIDDEN deny-list);
// - chunk budget (Vite examples): each measured page's initial JS + CSS gzip
//   <= the "Full Data Grid app" budget (165 KB, React
//   excluded) plus the gzip size of react + react-dom/client measured with the
//   same bundler. A page's
//   initial assets are what its HTML references plus everything those reach
//   through static imports, transitively. The Vite SSR example has one HTML
//   entry per page and measures all of them; the Vite SPA measures its
//   default page (index.html). The Next.js
//   example is not budgeted (its framework runtime dominates) but must
//   build and prerender `/`.
// Pass `--no-build` to check existing build output. Requires `npm run build`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { measureBundle } from './bundle-size.mjs';
import { listFiles, reporter, requireBuild, root } from './lib.mjs';

const r = reporter('test:examples');
requireBuild('test:examples');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const KB = 1024;
const FULL_APP_BUDGET = 165 * KB;

/**
 * Gzip size of the initial assets of one HTML page: the scripts, stylesheets
 * and modulepreload links it references, plus every chunk those reach through
 * static imports, transitively (lazy `import()` chunks are not initial).
 */
function initialGzip(out, html) {
  const pending = [...readFileSync(join(out, html), 'utf8').matchAll(/(?:src|href)="\/?([^"]+\.(?:js|css))"/g)].map((m) => join(html, '..', m[1]));
  const initial = new Set();
  while (pending.length) {
    const f = pending.pop();
    if (initial.has(f) || !existsSync(join(out, f))) continue;
    initial.add(f);
    if (!f.endsWith('.js')) continue;
    for (const m of readFileSync(join(out, f), 'utf8').matchAll(/(?:^|[;}\s])import\s*(?:[\w${},*\s]+from\s*)?["']\.\/([^"']+\.js)["']/g)) pending.push(join(f, '..', m[1]));
  }
  let gzip = 0;
  for (const f of initial) gzip += gzipSync(readFileSync(join(out, f)), { level: 9 }).length;
  return gzip;
}

const FORBIDDEN = [
  // Package names and license banners.
  [/@syncfusion\/|ej2-(?:base|grids|data|react)|Syncfusion Inc|syncfusion\.com\/license/i, 'Syncfusion'],
  [/ant-design|\bantd\b|\.ant-table/, 'Ant Design'],
  [/tailwindcss|--tw-[a-z]/, 'Tailwind'],
  [/@tanstack|tanstack/i, 'TanStack'],
  [/ag-grid|ag-theme-/i, 'AG Grid'],
  [/\bjspdf\b|pdfkit|exceljs|SheetJS|xlsx\.full/i, 'XLSX/PDF writer'],
];

const EXAMPLES = [
  { name: '@salmonui/example-vite-spa', dir: 'examples/vite-spa', out: 'dist', budget: true, pages: ['index.html'] },
  // Every HTML entry (examples/vite-ssr/src/pages.ts): index.html is the Data Grid page.
  { name: '@salmonui/example-vite-ssr', dir: 'examples/vite-ssr', out: 'dist/client', budget: true, pages: 'all' },
  { name: '@salmonui/example-next-app', dir: 'examples/next-app', out: '.next/static', budget: false, prerendered: '.next/server/app/index.html' },
];

if (!process.argv.includes('--no-build')) {
  for (const ex of EXAMPLES) {
    try {
      execFileSync(npm, ['run', 'build', '--workspace', ex.name], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
    } catch (error) {
      r.fail(`${ex.name}: build failed\n${String(error.stdout ?? '')}${String(error.stderr ?? '')}`);
    }
  }
}

const react = await measureBundle({ name: 'examples-react-allowance', source: "export * as a from 'react';\nexport * as b from 'react-dom/client';\n", external: [] });
r.note(`React allowance (react + react-dom/client, gzip): ${(react.gzip / KB).toFixed(2)} KB`);

for (const ex of EXAMPLES) {
  const out = join(root, ex.dir, ex.out);
  const files = listFiles(out);
  if (!files.length) {
    r.fail(`${ex.name}: no build output in ${ex.dir}/${ex.out}`);
    continue;
  }
  const js = files.filter((f) => f.endsWith('.js'));
  const css = files.filter((f) => f.endsWith('.css'));
  const cssText = css.map((f) => readFileSync(join(out, f), 'utf8')).join('\n');
  r.check(css.length > 0, `${ex.name}: no CSS emitted`);
  r.check(/\.salmon-data-grid/.test(cssText), `${ex.name}: Salmon UI grid CSS (.salmon-data-grid*) missing from the emitted CSS`);
  r.check(/--salmon-/.test(cssText), `${ex.name}: Salmon UI theme variables (--salmon-*) missing from the emitted CSS`);

  for (const f of [...js, ...css]) {
    const text = readFileSync(join(out, f), 'utf8');
    for (const [re, why] of FORBIDDEN) if (re.test(text)) r.fail(`${ex.name}: ${ex.out}/${f} contains ${why} code (${re})`);
  }

  if (ex.prerendered) {
    const html = join(root, ex.dir, ex.prerendered);
    r.check(existsSync(html) && /role="grid"/.test(readFileSync(html, 'utf8')), `${ex.name}: ${ex.prerendered} does not contain the server-rendered grid`);
  }

  if (ex.budget) {
    const budget = FULL_APP_BUDGET + react.gzip;
    const pages = ex.pages === 'all' ? files.filter((f) => f.endsWith('.html')) : ex.pages;
    r.check(pages.length > 0, `${ex.name}: no HTML page to measure`);
    for (const html of pages) {
      if (!existsSync(join(out, html))) {
        r.fail(`${ex.name}: ${ex.out}/${html} missing`);
        continue;
      }
      const gzip = initialGzip(out, html);
      r.note(`${ex.name}: ${html} initial JS + CSS ${(gzip / KB).toFixed(2)} KB gzip (budget ${(budget / KB).toFixed(2)} KB = 165 KB + React)`);
      r.check(gzip <= budget, `${ex.name}: ${html} initial JS + CSS ${(gzip / KB).toFixed(2)} KB gzip exceeds ${(budget / KB).toFixed(2)} KB`);
    }
  } else {
    r.note(`${ex.name}: built, ${js.length} JS and ${css.length} CSS files; chunk budget not applied (framework runtime)`);
  }
}
r.done();
