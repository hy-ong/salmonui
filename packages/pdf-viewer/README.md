# @salmonui/pdf-viewer

`PdfViewer` for Salmon UI: view, search, thumbnails, bookmarks, print, text
markup annotations and AcroForm filling on pdf.js.

```sh
npm install @salmonui/pdf-viewer @salmonui/core react react-dom
```

Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

- Dependency-exception package: the only Salmon UI package that may use
  pdf.js (`pdfjs-dist`). Every other package stays free of third-party
  runtime dependencies.
- pdf.js loads with dynamic `import()` on the client after hydration. The
  server renders the toolbar and sized page placeholders from `pageSizes`;
  nothing reads the DOM during render.
- The worker: by default the package starts its own module worker with
  `new Worker(new URL('./engine/pdf-worker.js', import.meta.url), { type: 'module' })`,
  which bundlers (Vite, webpack 5, Rollup, Turbopack) emit as a worker chunk;
  it loads `pdfjs-dist/build/pdf.worker.min.mjs`. Pass `workerSrc` (a URL of a
  pdf.js worker module) to use another file, or set
  `GlobalWorkerOptions.workerSrc` / `workerPort` of `pdfjs-dist` yourself. With
  Vite, keep `@salmonui/pdf-viewer` out of `optimizeDeps` pre-bundling (the
  default for linked packages) or pass `workerSrc`.
- `react` and `react-dom` `>=19` are peers. ESM only.

```tsx
import { PdfViewer } from '@salmonui/pdf-viewer';

import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/buttons/button/styles.css';
import '@salmonui/pdf-viewer/styles.css';

<PdfViewer src="/files/report.pdf" pageSizes={{ width: 612, height: 792 }} pageCount={12} style={{ height: 720 }} />;
```

`@salmonui/pdf-viewer/styles.css` carries the menu, toolbar, tree view and
dialog rules the viewer renders. It does not carry the Button rules (that
would put it over its size budget), so import the Button stylesheet before
it.

## Third-party dependencies

Every direct runtime dependency is exact-pinned, on the allow-list in
`tooling/checks/packages.manifest.mjs` (`thirdParty`) and
listed with its license in the repository `THIRD_PARTY_LICENSES.md`.

| Package | License | Used by |
| --- | --- | --- |
| `pdfjs-dist` | Apache-2.0 | engine and worker (lazy chunks) |

Transitive: `@napi-rs/canvas` and its platform binaries (MIT), optional
dependencies of `pdfjs-dist` used only when pdf.js runs in Node.

## Documentation

- PdfViewer: <https://salmonui.dev/docs/editors/pdf-viewer>

## License

MIT. Third-party licenses: [THIRD_PARTY_LICENSES.md](../../THIRD_PARTY_LICENSES.md).
