// The pdf.js side of PdfViewer (lazy chunk, client only). pdf.js loads with
// dynamic import() the first time a document opens; the default worker is
// this package's `pdf-worker.js` module worker (bundled through
// `new Worker(new URL(...))`). Everything here runs in effects and event
// handlers, never during render.
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, PDFWorker, PageViewport, RenderTask } from 'pdfjs-dist';
import { markBand, patchMarkupSubtypes, pdfRectToCss, toEngineRecord, type PageGeometry } from '../markup.js';
import { buildPageText, type PageText } from '../search.js';
import type { PdfFormValue, PdfFormValues, PdfPageSize, PdfTextMarkupAnnotation, PdfViewerOutlineItem, PdfViewerSource } from '../types.js';

type Pdfjs = typeof import('pdfjs-dist');

let pdfjsModule: Promise<Pdfjs> | null = null;
let defaultWorker: Worker | null = null;
const workers = new Map<string, Worker>();

/** Loads pdf.js once per page (module cache, not render state). */
export const loadPdfjs = (): Promise<Pdfjs> => (pdfjsModule ??= import('pdfjs-dist'));

function workerFor(pdfjs: Pdfjs, workerSrc: string | URL | undefined): PDFWorker | undefined {
  if (workerSrc) {
    const key = String(workerSrc);
    let port = workers.get(key);
    if (!port) workers.set(key, (port = new Worker(workerSrc, { type: 'module' })));
    return pdfjs.PDFWorker.create({ port: port as never, verbosity: 0 });
  }
  // An application-wide `GlobalWorkerOptions` setting wins over the bundled worker.
  if (pdfjs.GlobalWorkerOptions.workerPort || pdfjs.GlobalWorkerOptions.workerSrc) return undefined;
  defaultWorker ??= new Worker(new URL('./pdf-worker.js', import.meta.url), { type: 'module' });
  return pdfjs.PDFWorker.create({ port: defaultWorker as never, verbosity: 0 });
}

export interface EngineHooks {
  linkTarget(): string;
  /** An external link was activated; return false to cancel it. */
  externalLink(url: string): boolean;
  /** An internal link or named action targets a page (1-based). */
  internalLink(page: number | null): void;
  pageCount(): number;
  currentPage(): number;
  formInput(name: string, value: PdfFormValue): void;
}

export interface OpenOptions {
  readonly src: PdfViewerSource;
  readonly password?: string | undefined;
  readonly workerSrc?: string | URL | undefined;
  readonly documentOptions?: Readonly<Record<string, unknown>> | undefined;
  readonly onPassword: (reason: 'required' | 'incorrect', submit: (password: string) => void, cancel: () => void) => void;
  readonly hooks: EngineHooks;
}

export interface PageLayers {
  readonly page: HTMLElement;
  readonly canvas: HTMLElement;
  readonly text: HTMLElement;
  readonly annotations: HTMLElement;
}

export interface DocumentInfo {
  readonly pageCount: number;
  readonly sizes: readonly PdfPageSize[];
  readonly geometry: readonly PageGeometry[];
  readonly title: string | null;
  readonly outline: readonly PdfViewerOutlineItem[];
  readonly formFields: readonly string[];
}

interface FieldObject {
  readonly id: string;
  readonly type: string;
  readonly value?: unknown;
  readonly exportValues?: unknown;
}

interface PageState {
  task: RenderTask | null;
  scale: number;
  textDone: boolean;
  annotationsDone: boolean;
  generation: number;
}

const MAX_CANVAS_PIXELS = 16_777_216;
const TEXT_PROBE = 'Off';

export class PasswordCancelledError extends Error {
  constructor() {
    super('A password is required to open this document.');
    this.name = 'PasswordException';
  }
}

export interface Engine {
  readonly info: DocumentInfo;
  renderPage(index: number, layers: PageLayers, cssScale: number): Promise<void>;
  releasePage(index: number): void;
  renderThumbnail(index: number, canvas: HTMLCanvasElement, width: number): Promise<void>;
  pageText(index: number): Promise<PageText>;
  textSpans(index: number): readonly HTMLElement[];
  setFormValues(values: PdfFormValues): void;
  formValues(): PdfFormValues;
  print(dpi: number, annotations: readonly PdfTextMarkupAnnotation[]): Promise<HTMLElement>;
  save(annotations: readonly PdfTextMarkupAnnotation[]): Promise<Uint8Array>;
  destroy(): void;
}

async function toInit(src: PdfViewerSource): Promise<Record<string, unknown>> {
  if (typeof src === 'string' || src instanceof URL) return { url: src };
  // pdf.js transfers the bytes to the worker; copy so the caller's buffer is never detached.
  if (src instanceof Uint8Array) return { data: src.slice() };
  if (src instanceof ArrayBuffer) return { data: new Uint8Array(src.slice(0)) };
  return { data: new Uint8Array(await src.arrayBuffer()) };
}

export async function openDocument(options: OpenOptions): Promise<Engine> {
  const pdfjs = await loadPdfjs();
  const init = await toInit(options.src);
  const worker = workerFor(pdfjs, options.workerSrc);
  const task: PDFDocumentLoadingTask = pdfjs.getDocument({
    verbosity: 0,
    enableXfa: false,
    disableWorkerRendering: true,
    ...(options.documentOptions ?? {}),
    ...init,
    ...(options.password !== undefined ? { password: options.password } : {}),
    ...(worker ? { worker } : {}),
  });
  let cancelled = false;
  task.onPassword = (update: (password: string) => void, reason: number) => {
    options.onPassword(
      reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD ? 'incorrect' : 'required',
      (password) => update(password),
      () => {
        cancelled = true;
        void task.destroy();
      },
    );
  };
  let doc: PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (error) {
    if (cancelled) throw new PasswordCancelledError();
    throw error instanceof Error ? error : new Error(String(error));
  }
  return createEngine(pdfjs, task, doc, options.hooks);
}

async function createEngine(pdfjs: Pdfjs, task: PDFDocumentLoadingTask, doc: PDFDocumentProxy, hooks: EngineHooks): Promise<Engine> {
  const count = doc.numPages;
  const pages = await Promise.all(Array.from({ length: count }, (_, i) => doc.getPage(i + 1)));
  const geometry: PageGeometry[] = pages.map((p) => ({ view: p.view as unknown as [number, number, number, number], rotate: p.rotate }));
  const sizes: PdfPageSize[] = geometry.map(({ view, rotate }) => {
    const w = Math.abs(view[2] - view[0]);
    const h = Math.abs(view[3] - view[1]);
    return rotate % 180 === 0 ? { width: w, height: h } : { width: h, height: w };
  });
  const { length: originalLength } = await doc.getDownloadInfo();

  const resolveDest = async (dest: unknown): Promise<number | null> => {
    try {
      const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(explicit)) return null;
      const target: unknown = explicit[0];
      if (Number.isInteger(target)) return (target as number) + 1;
      if (target && typeof target === 'object') return (await doc.getPageIndex(target as never)) + 1;
    } catch {}
    return null;
  };

  let seq = 0;
  type RawOutline = { title: string; dest: unknown; url: string | null; items: RawOutline[] };
  const mapOutline = async (items: readonly RawOutline[] | null): Promise<PdfViewerOutlineItem[]> =>
    Promise.all(
      (items ?? []).map(async (item) => ({
        id: `o${seq++}`,
        title: item.title,
        page: item.dest ? await resolveDest(item.dest) : null,
        url: item.url ?? null,
        items: await mapOutline(item.items),
      })),
    );
  const [outline, metadata, rawFields] = await Promise.all([
    doc.getOutline().then((o) => mapOutline(o as unknown as RawOutline[] | null)),
    doc.getMetadata().catch(() => null),
    doc.getFieldObjects().catch(() => null),
  ]);
  const title = ((metadata?.info as { Title?: unknown } | undefined)?.Title as string | undefined) || null;

  // AcroForm fields: name -> widgets, widget id -> name.
  const fields = new Map<string, FieldObject[]>();
  const fieldEntries: Iterable<[string, unknown]> = rawFields instanceof Map ? rawFields : Object.entries((rawFields as Record<string, unknown> | null) ?? {});
  for (const [name, list] of fieldEntries) {
    const widgets = (list as FieldObject[]).filter((w) => w && typeof w.id === 'string' && w.type !== 'button' && w.type !== 'signature');
    if (widgets.length) fields.set(name, widgets);
  }
  const nameOf = new Map<string, string>();
  for (const [name, widgets] of fields) for (const w of widgets) nameOf.set(w.id, name);
  const storage = doc.annotationStorage;

  const readField = (name: string): PdfFormValue => {
    const widgets = fields.get(name) as FieldObject[];
    const value = (w: FieldObject): unknown => (storage.getValue(w.id, { value: w.value }) as { value?: unknown }).value;
    const type = (widgets[0] as FieldObject).type;
    if (type === 'checkbox') return widgets.some((w) => { const v = value(w); return v === true || (typeof v === 'string' && v !== TEXT_PROBE && v === w.exportValues); });
    if (type === 'radiobutton') {
      const on = widgets.find((w) => { const v = value(w); return v === true || (typeof v === 'string' && v === w.exportValues); });
      return on ? String(on.exportValues ?? '') : '';
    }
    const v = value(widgets[0] as FieldObject);
    if (type === 'listbox') return Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)];
    return v == null ? '' : String(v);
  };

  // Form input from the annotation layer: pdf.js writes the storage in its own listener first.
  const onFormEvent = (event: Event) => {
    const el = (event.target as HTMLElement | null)?.closest?.('[data-element-id]');
    const id = el?.getAttribute('data-element-id');
    const name = id ? nameOf.get(id) : undefined;
    if (name) queueMicrotask(() => hooks.formInput(name, readField(name)));
  };

  const goToNamed = (action: string) => {
    const current = hooks.currentPage();
    const map: Record<string, number> = { NextPage: current + 1, PrevPage: current - 1, FirstPage: 1, LastPage: hooks.pageCount() };
    if (action in map) hooks.internalLink(map[action] as number);
  };
  const linkService = {
    externalLinkEnabled: true,
    eventBus: null,
    isInPresentationMode: false,
    get pagesCount() {
      return count;
    },
    addLinkAttributes(link: HTMLAnchorElement, url: string) {
      link.href = url;
      link.target = hooks.linkTarget();
      link.rel = 'noopener noreferrer nofollow';
      // pdf.js names a link by the text under it when it finds some; the URL otherwise.
      if (!link.title) link.title = url;
      link.onclick = () => (hooks.externalLink(url) ? undefined : false) as never;
    },
    getDestinationHash: (dest: unknown) => `#${typeof dest === 'string' ? encodeURIComponent(dest) : 'page'}`,
    getAnchorUrl: (hash: string) => `#${hash}`,
    goToDestination: async (dest: unknown) => hooks.internalLink(await resolveDest(dest)),
    goToPage: (page: number) => hooks.internalLink(page),
    executeNamedAction: goToNamed,
    executeSetOCGState: () => {},
    navigateTo: () => {},
    setHash: () => {},
  };

  const state = new Map<number, PageState>();
  const texts = new Map<number, Promise<{ items: Array<{ str: string; hasEOL: boolean }> }>>();
  const pageTexts = new Map<number, Promise<PageText>>();
  const spans = new Map<number, HTMLElement[]>();
  const listening = new WeakSet<HTMLElement>();
  const textContent = (index: number) => {
    let p = texts.get(index);
    if (!p) texts.set(index, (p = (pages[index] as PDFPageProxy).getTextContent() as unknown as Promise<{ items: Array<{ str: string; hasEOL: boolean }> }>));
    return p;
  };

  const viewportOf = (index: number, cssScale: number): PageViewport => (pages[index] as PDFPageProxy).getViewport({ scale: cssScale });

  const draw = async (page: PDFPageProxy, viewport: PageViewport, intent: 'display' | 'print', dpr: number): Promise<{ canvas: HTMLCanvasElement; task: RenderTask }> => {
    const canvas = document.createElement('canvas');
    let ratio = dpr;
    if (viewport.width * viewport.height * ratio * ratio > MAX_CANVAS_PIXELS) ratio = Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height));
    canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
    canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
    const renderTask = page.render({
      canvas,
      viewport,
      intent,
      annotationMode: intent === 'print' ? pdfjs.AnnotationMode.ENABLE_STORAGE : pdfjs.AnnotationMode.ENABLE_FORMS,
      ...(ratio !== 1 ? { transform: [ratio, 0, 0, ratio, 0, 0] } : {}),
      ...(intent === 'print' ? { printAnnotationStorage: storage.print } : {}),
    });
    return { canvas, task: renderTask };
  };

  const engine: Engine = {
    info: { pageCount: count, sizes, geometry, title, outline, formFields: [...fields.keys()] },

    async renderPage(index, layers, cssScale) {
      const page = pages[index];
      if (!page) return;
      let s = state.get(index);
      if (!s) state.set(index, (s = { task: null, scale: 0, textDone: false, annotationsDone: false, generation: 0 }));
      const generation = ++s.generation;
      const viewport = viewportOf(index, cssScale);
      if (s.scale !== cssScale || !layers.canvas.firstChild) {
        s.task?.cancel();
        const { canvas, task: renderTask } = await draw(page, viewport, 'display', globalThis.devicePixelRatio || 1);
        s.task = renderTask;
        try {
          await renderTask.promise;
        } catch {
          return; // cancelled by a newer render or a release
        }
        if (s.generation !== generation) return;
        s.task = null;
        s.scale = cssScale;
        canvas.setAttribute('aria-hidden', 'true');
        layers.canvas.replaceChildren(canvas);
      }
      if (!s.textDone) {
        s.textDone = true;
        const content = await textContent(index);
        if (s.generation !== generation && !layers.page.isConnected) return;
        const layer = new pdfjs.TextLayer({ textContentSource: content as never, container: layers.text, viewport });
        await layer.render();
        spans.set(index, layer.textDivs as HTMLElement[]);
        layers.text.dispatchEvent(new CustomEvent('salmon-pdf-text', { bubbles: true, detail: index }));
      }
      if (!s.annotationsDone) {
        s.annotationsDone = true;
        const annotations = await page.getAnnotations({ intent: 'display' });
        const flipped = viewport.clone({ dontFlip: true });
        const layer = new pdfjs.AnnotationLayer({
          div: layers.annotations as HTMLDivElement,
          page,
          viewport: flipped,
          annotationStorage: storage,
          linkService: linkService as never,
          accessibilityManager: null,
          annotationCanvasMap: null,
          annotationEditorUIManager: null,
          structTreeLayer: null,
          commentManager: null,
        } as never);
        await layer.render({
          annotations,
          viewport: flipped,
          div: layers.annotations as HTMLDivElement,
          page,
          linkService: linkService as never,
          renderForms: true,
          annotationStorage: storage,
          imageResourcesPath: '',
          enableScripting: false,
          hasJSActions: false,
          fieldObjects: null,
        } as never);
        if (!listening.has(layers.annotations)) {
          listening.add(layers.annotations);
          layers.annotations.addEventListener('input', onFormEvent);
          layers.annotations.addEventListener('change', onFormEvent);
        }
      }
    },

    releasePage(index) {
      const s = state.get(index);
      if (!s) return;
      s.task?.cancel();
      s.generation++;
      state.delete(index);
      spans.delete(index);
      if (state.size === 0 || index % 8 === 0) void (pages[index] as PDFPageProxy).cleanup();
    },

    async renderThumbnail(index, canvas, width) {
      const page = pages[index];
      const size = sizes[index];
      if (!page || !size) return;
      const viewport = page.getViewport({ scale: width / size.width });
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      await page.render({ canvas, viewport, annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS, ...(dpr !== 1 ? { transform: [dpr, 0, 0, dpr, 0, 0] } : {}) }).promise.catch(() => {});
    },

    pageText(index) {
      let p = pageTexts.get(index);
      if (!p) pageTexts.set(index, (p = textContent(index).then((c) => buildPageText(c.items.filter((i) => typeof i.str === 'string')))));
      return p;
    },

    textSpans: (index) => spans.get(index) ?? [],

    setFormValues(values) {
      for (const [name, v] of Object.entries(values)) {
        const widgets = fields.get(name);
        if (!widgets || readFieldEquals(readField(name), v)) continue;
        const type = (widgets[0] as FieldObject).type;
        for (const w of widgets) {
          let value: unknown = v;
          if (type === 'checkbox') value = v === true || v === w.exportValues;
          else if (type === 'radiobutton') value = v === w.exportValues;
          else if (type === 'listbox') value = Array.isArray(v) ? [...v] : [String(v)];
          else value = Array.isArray(v) ? v.join(',') : String(v);
          storage.setValue(w.id, { value });
          // Rendered widgets show the new value at once.
          for (const el of document.querySelectorAll<HTMLInputElement>(`[data-element-id="${CSS.escape(w.id)}"]`)) {
            if (el.type === 'checkbox' || el.type === 'radio') el.checked = value === true;
            else if (el instanceof HTMLSelectElement && Array.isArray(value)) for (const o of el.options) o.selected = value.includes(o.value);
            else if ('value' in el) el.value = String(value);
          }
        }
      }
    },

    formValues() {
      const out: Record<string, PdfFormValue> = {};
      for (const name of fields.keys()) out[name] = readField(name);
      return out;
    },

    async print(dpi, annotations) {
      const container = document.createElement('div');
      container.className = 'salmon-pdf-viewer-print';
      const first = sizes[0] ?? { width: 612, height: 792 };
      const style = document.createElement('style');
      style.textContent = `@page { size: ${first.width}pt ${first.height}pt; margin: 0; }`;
      container.append(style);
      const scale = dpi / 72;
      for (let i = 0; i < count; i++) {
        const page = pages[i] as PDFPageProxy;
        const { canvas, task: renderTask } = await draw(page, page.getViewport({ scale }), 'print', 1);
        await renderTask.promise;
        const ctx = canvas.getContext('2d');
        if (ctx) paintMarkup(ctx, geometry[i] as PageGeometry, scale, annotations.filter((a) => a.page === i + 1));
        const img = document.createElement('img');
        img.alt = '';
        img.src = await new Promise<string>((resolve) => canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : canvas.toDataURL()), 'image/png'));
        const size = sizes[i] as PdfPageSize;
        img.style.width = `${size.width}pt`;
        img.style.height = `${size.height}pt`;
        const sheet = document.createElement('div');
        sheet.className = 'salmon-pdf-viewer-print__page';
        sheet.append(img);
        container.append(sheet);
      }
      return container;
    },

    async save(annotations) {
      const keys = annotations.map((_, i) => `pdfjs_internal_editor_salmon-${i}`);
      annotations.forEach((a, i) => {
        if (a.page >= 1 && a.page <= count && a.rects.length) storage.setValue(keys[i] as string, toEngineRecord(a));
      });
      try {
        const bytes = storage.size > 0 ? await doc.saveDocument() : await doc.getData();
        const out = new Uint8Array(bytes);
        patchMarkupSubtypes(out, originalLength, annotations);
        return out;
      } finally {
        for (const key of keys) storage.remove(key);
      }
    },

    destroy() {
      for (const s of state.values()) s.task?.cancel();
      state.clear();
      void task.destroy();
    },
  };
  return engine;
}

function readFieldEquals(a: PdfFormValue, b: PdfFormValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

/** Paints markup annotations onto a printed page canvas (the print path has no DOM overlay). */
function paintMarkup(ctx: CanvasRenderingContext2D, geometry: PageGeometry, scale: number, annotations: readonly PdfTextMarkupAnnotation[]): void {
  for (const a of annotations) {
    ctx.save();
    ctx.fillStyle = a.color;
    ctx.globalAlpha = a.opacity ?? 1;
    if (a.kind === 'highlight') ctx.globalCompositeOperation = 'multiply';
    for (const rect of a.rects) {
      const r = pdfRectToCss(geometry, scale, markBand(a.kind, rect));
      ctx.fillRect(r.left, r.top, r.width, r.height);
    }
    ctx.restore();
  }
}
