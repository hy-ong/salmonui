// PdfViewer browser page (tests/browser/pdf-viewer*.spec.ts):
//
//   ?src=url|bytes|buffer|blob|protected|none   document source (default: the committed fixture URL)
//   ?extra=<n>            n filler pages (bytes source, virtualization)
//   ?hydrate              server-renders the page with react-dom/server, then hydrates it
//   ?pageSizes            passes the fixture page sizes (SSR placeholders)
//   ?controlled           controlled page, zoom, annotations and formValues mirrored into state
//   ?zoom=<value> ?page=<n> ?scroll=vertical|horizontal|wrapped|page ?spread=odd|even
//   ?password=<pw>        password prop    ?customPassword  onPasswordRequired submits "salmon"
//   ?toolbar=custom|none|render   ?sidebar=thumbnails|outline   ?noSelect  textSelection={false}
//   ?preventLinks         onLinkClick cancels    ?vetoPrint  onBeforePrint cancels
//   ?dir=rtl ?scheme=dark ?narrow (360 px wide) ?locale  ?worker  explicit workerSrc
//
// window.__pdfv records events; window.__pdfvActions is actionsRef.current; window.print is
// stubbed and records the print container.
import { StrictMode, useRef, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/pdf-viewer/styles.css';
import { ThemeProvider } from '@salmonui/core/theme';
import { PdfViewer, type PdfFormValues, type PdfTextMarkupAnnotation, type PdfViewerActions, type PdfViewerProps, type PdfViewerSource, type PdfViewerToolbarItem, type PdfViewerZoom } from '@salmonui/pdf-viewer';
import { buildSamplePdf } from '../../../tests/browser/fixtures/pdf-sample.ts';
import sampleUrl from '../../../tests/browser/fixtures/sample.pdf?url';
import protectedUrl from '../../../tests/browser/fixtures/sample-protected.pdf?url';

const params = new URLSearchParams(location.search);
const has = (key: string) => params.has(key);
const get = (key: string) => params.get(key);

const log = {
  loads: [] as { pageCount: number; title: string | null; outline: string[]; formFields: readonly string[] }[],
  errors: [] as string[],
  pages: [] as { page: number; source: string }[],
  zooms: [] as { zoom: PdfViewerZoom; scale: number; source: string }[],
  links: [] as { url: string | null; page: number | null }[],
  prints: [] as { images: number; sizes: string[] }[],
  beforePrint: 0,
  searches: [] as { query: string; total: number; current: number; page: number }[],
  annotations: [] as { reason: string; kind: string; page: number; count: number }[],
  forms: [] as { name: string; values: PdfFormValues }[],
  passwords: [] as string[],
  sidebars: [] as (string | null)[],
  custom: 0,
};
(window as unknown as { __pdfv: typeof log }).__pdfv = log;
window.print = () => {
  const imgs = [...document.querySelectorAll<HTMLImageElement>('.salmon-pdf-viewer-print img')];
  log.prints.push({ images: imgs.length, sizes: imgs.map((i) => `${i.style.width}x${i.style.height}`) });
};

function source(): PdfViewerSource | null {
  const kind = get('src') ?? 'url';
  const extra = Number(get('extra') ?? 0);
  if (kind === 'none') return null;
  if (kind === 'protected') return protectedUrl;
  if (kind === 'url' && !extra) return sampleUrl;
  const bytes = buildSamplePdf({ extraPages: extra });
  if (kind === 'buffer') return bytes.buffer as ArrayBuffer;
  if (kind === 'blob') return new Blob([bytes as BlobPart], { type: 'application/pdf' });
  return bytes;
}
const SRC = source();
const SIZES = [
  { width: 612, height: 792 },
  { width: 612, height: 792 },
  { width: 420, height: 595 },
  ...Array.from({ length: Number(get('extra') ?? 0) }, () => ({ width: 612, height: 792 })),
];

const customToolbar: readonly PdfViewerToolbarItem[] = ['previous', 'next', 'pageNumber', '|', 'zoomOut', 'zoomIn', '-', { id: 'stamp', label: 'Stamp', onSelect: () => log.custom++ }, 'download'];

function Viewer({ actions }: { readonly actions: { current: PdfViewerActions | null } }) {
  const controlled = has('controlled');
  const [page, setPage] = useState(Number(get('page') ?? 1));
  const [zoom, setZoom] = useState<PdfViewerZoom>(get('zoom') ? (Number.isFinite(Number(get('zoom'))) ? Number(get('zoom')) : (get('zoom') as PdfViewerZoom)) : 'auto');
  const [annotations, setAnnotations] = useState<readonly PdfTextMarkupAnnotation[]>([]);
  const [formValues, setFormValues] = useState<PdfFormValues>({});
  const toolbar = get('toolbar');
  const props: PdfViewerProps = {
    src: SRC,
    actionsRef: actions,
    'aria-label': 'Sample document',
    ...(has('pageSizes') ? { pageSizes: SIZES } : {}),
    ...(get('scroll') ? { scrollMode: get('scroll') as PdfViewerProps['scrollMode'] } : {}),
    ...(get('spread') ? { spreadMode: get('spread') as PdfViewerProps['spreadMode'] } : {}),
    ...(get('sidebar') ? { defaultSidebar: get('sidebar') as 'thumbnails' | 'outline' } : {}),
    ...(get('password') ? { password: get('password') as string } : {}),
    ...(has('noSelect') ? { textSelection: false } : {}),
    ...(has('worker') ? { workerSrc: new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url) } : {}),
    ...(toolbar === 'none' ? { toolbar: false } : toolbar === 'custom' ? { toolbar: customToolbar } : {}),
    ...(toolbar === 'render'
      ? { renderToolbar: ({ items, state }) => <div className="app-toolbar" role="toolbar" aria-label="App tools"><span data-testid="render-state">{`${state.page}/${state.pageCount}`}</span>{items}</div> }
      : {}),
    ...(has('locale') ? { localeText: { pageLabel: 'Seite {page} von {count}', next: 'Nächste Seite' } } : {}),
    ...(has('customPassword')
      ? {
          onPasswordRequired: (request) => {
            log.passwords.push(request.reason);
            setTimeout(() => request.submit(request.reason === 'required' && has('wrongFirst') ? 'nope' : 'salmon'), 50);
          },
        }
      : {}),
    onLoad: (info) => log.loads.push({ pageCount: info.pageCount, title: info.title, outline: info.outline.map((o) => o.title), formFields: info.formFields }),
    onLoadError: (error) => log.errors.push(`${error.name}: ${error.message}`),
    onPageChange: (p, e) => {
      log.pages.push({ page: p, source: e.source });
      if (controlled) setPage(p);
    },
    onZoomChange: (z, e) => {
      log.zooms.push({ zoom: z, scale: e.scale, source: e.source });
      if (controlled) setZoom(z);
    },
    onLinkClick: (event) => {
      log.links.push({ url: event.url, page: event.page });
      if (has('preventLinks')) event.preventDefault();
    },
    onBeforePrint: (event) => {
      log.beforePrint++;
      if (has('vetoPrint')) event.preventDefault();
    },
    onSearchResult: (r) => log.searches.push({ query: r.query, total: r.total, current: r.current, page: r.page }),
    onAnnotationsChange: (list, e) => {
      log.annotations.push({ reason: e.reason, kind: e.annotation.kind, page: e.annotation.page, count: list.length });
      if (controlled) setAnnotations(list);
    },
    onFormValuesChange: (values, e) => {
      log.forms.push({ name: e.name, values });
      if (controlled) setFormValues(values);
    },
    onSidebarChange: (s) => log.sidebars.push(s),
    annotationAuthor: 'Tester',
    fileName: 'sample-out.pdf',
    style: { width: has('narrow') ? 360 : 900, height: 640 },
    ...(controlled ? { page, zoom, annotations, formValues } : { defaultZoom: zoom, defaultPage: page }),
  };
  return (
    <>
      <PdfViewer {...props} />
      {controlled ? (
        <p>
          <button type="button" id="set-page-3" onClick={() => setPage(3)}>
            Page 3
          </button>
          <button type="button" id="set-zoom-2" onClick={() => setZoom(2)}>
            Zoom 200%
          </button>
          <button type="button" id="set-name" onClick={() => setFormValues({ fullName: 'Grace Hopper', subscribe: true })}>
            Set form
          </button>
          <button type="button" id="clear-annotations" onClick={() => setAnnotations([])}>
            Clear annotations
          </button>
        </p>
      ) : null}
    </>
  );
}

const actionsRef: { current: PdfViewerActions | null } = { current: null };
Object.defineProperty(window, '__pdfvActions', { get: () => actionsRef.current });

function Page() {
  return (
    <ThemeProvider theme={{ colorScheme: get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={get('dir') === 'rtl' ? 'rtl' : undefined} data-salmon-a11y-root="" style={{ padding: 16 }}>
        <h1 style={{ fontSize: 18 }}>PDF Viewer</h1>
        <Viewer actions={actionsRef} />
        <p>
          <button type="button" id="outside">
            Outside
          </button>
        </p>
      </main>
    </ThemeProvider>
  );
}

const root = document.getElementById('root')!;
if (has('hydrate')) {
  root.innerHTML = renderToString(<Page />);
  (window as unknown as { __serverHtml: string }).__serverHtml = root.innerHTML;
  hydrateRoot(root, <Page />, { onRecoverableError: (error) => console.error('recoverable', error) });
  (window as unknown as { __hydrated: boolean }).__hydrated = true;
} else {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
