// PdfViewer controller (initial chunk, no engine code). Owns the viewer
// state in an external store read through useSyncExternalStore: layout,
// visible pages, current page, zoom, search and the panels. Scroll, wheel
// and pinch transients stay here and reach React only when the rendered
// page set, the current page or the committed zoom changes. The pdf.js side
// (engine/controller.ts) loads with dynamic import() on the client.
import { computeRange, createVariableRowMetrics } from '@salmonui/core/virtual';
import type { DocumentInfo, Engine, PageLayers } from './engine/controller.js';
import { computeLayout, pageOffset, visiblePages, type ViewerLayout } from './layout.js';
import { annotationId, cssRectToPdf, DEFAULT_MARKUP_COLORS, mergeLineRects, type CssRect, type PageGeometry } from './markup.js';
import { countByPage, findMatches, matchPieces, type PageText, type SearchMatch } from './search.js';
import type {
  PdfFormValue,
  PdfFormValues,
  PdfPageSize,
  PdfTextMarkupAnnotation,
  PdfTextMarkupKind,
  PdfViewerActions,
  PdfViewerEventSource,
  PdfViewerOutlineItem,
  PdfViewerProps,
  PdfViewerSearchOptions,
  PdfViewerSearchResult,
  PdfViewerSidebar,
  PdfViewerSource,
  PdfViewerStateSnapshot,
  PdfViewerZoom,
} from './types.js';
import { PDF_TO_CSS, clampScale, pinchScale, resolveScale, stepScale, wheelFactor } from './zoom.js';

/** Layout assumed before the viewport is measured (server and first client render). */
export const INITIAL_VIEWPORT = Object.freeze({ width: 816, height: 1056 });
/** Thumbnail width in CSS px. */
export const THUMB_WIDTH = 120;
const THUMB_EXTRA = 36;
/** Widest viewer whose sidebar overlays the pages (`@container (max-width: 480px)` in pdf-viewer.css). */
const NARROW_WIDTH = 480;
const LETTER: PdfPageSize = { width: 612, height: 792 };

export interface FindState {
  readonly query: string;
  readonly matchCase: boolean;
  readonly wholeWord: boolean;
  readonly highlightAll: boolean;
}

export interface CoreSnapshot {
  readonly status: PdfViewerStateSnapshot['status'];
  readonly passwordReason: 'required' | 'incorrect' | null;
  readonly error: Error | null;
  readonly sizes: readonly PdfPageSize[];
  readonly geometry: readonly PageGeometry[] | null;
  readonly outline: readonly PdfViewerOutlineItem[];
  readonly zoom: PdfViewerZoom;
  readonly scale: number;
  readonly layout: ViewerLayout;
  readonly visible: readonly number[];
  /** Current page, 0-based. */
  readonly page: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly sidebar: PdfViewerSidebar | null;
  readonly findOpen: boolean;
  readonly find: FindState;
  readonly matchTotal: number;
  readonly matchIndex: number;
  readonly searching: boolean;
  readonly annotations: readonly PdfTextMarkupAnnotation[];
  readonly hasSelection: boolean;
  readonly thumbs: readonly number[];
  readonly pinching: boolean;
}

const sizesFrom = (props: PdfViewerProps): PdfPageSize[] => {
  const s = props.pageSizes;
  if (!s) return [];
  if (Array.isArray(s)) return s as PdfPageSize[];
  return Array.from({ length: Math.max(0, props.pageCount ?? 1) }, () => s as PdfPageSize);
};
const sameList = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const isMac = () => /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

/** Cancellable event object. */
export function cancelable<T extends object>(fields: T): T & { preventDefault(): void; readonly defaultPrevented: boolean } {
  let prevented = false;
  Object.defineProperty(fields, 'preventDefault', { value: () => void (prevented = true), enumerable: true });
  Object.defineProperty(fields, 'defaultPrevented', { get: () => prevented, enumerable: true });
  return fields as T & { preventDefault(): void; readonly defaultPrevented: boolean };
}

export class ViewerCore {
  private props: PdfViewerProps;
  private state: CoreSnapshot;
  private listeners = new Set<() => void>();
  private engine: Engine | null = null;
  private engineInfo: DocumentInfo | null = null;
  private loadId = 0;
  private passwordSubmit: ((password: string) => void) | null = null;
  private passwordCancel: (() => void) | null = null;
  private root: HTMLElement | null = null;
  private viewportEl: HTMLElement | null = null;
  private contentEl: HTMLElement | null = null;
  private thumbsEl: HTMLElement | null = null;
  private findInput: HTMLInputElement | null = null;
  private cleanup: Array<() => void> = [];
  private mounted = new Map<number, HTMLElement>();
  private thumbCanvases = new Map<number, HTMLCanvasElement>();
  private frame = 0;
  private renderTimer: ReturnType<typeof setTimeout> | undefined;
  private lock: { page: number; until: number } | null = null;
  private anchor: { page: number; fraction: number; cross: number } | null = null;
  private pageRow = 0;
  private matches: SearchMatch[] = [];
  private texts: PageText[] = [];
  private searchRun = 0;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private scrollToMatch = false;
  private lastRange: Range | null = null;
  private pinch: { factor: number; timer: ReturnType<typeof setTimeout> | undefined; pointers: Map<number, { x: number; y: number }>; startDist: number } = { factor: 1, timer: undefined, pointers: new Map(), startDist: 0 };
  private appliedForm: PdfFormValues | undefined;
  private printing = false;
  readonly actions: PdfViewerActions;

  constructor(props: PdfViewerProps) {
    this.props = props;
    const sizes = sizesFrom(props);
    const zoom = props.zoom ?? props.defaultZoom ?? 'auto';
    const scale = this.scaleFor(zoom, sizes, INITIAL_VIEWPORT, props);
    const layout = this.layoutFor(sizes, scale, INITIAL_VIEWPORT, props);
    const page = Math.max(0, Math.min(sizes.length - 1, (props.page ?? props.defaultPage ?? 1) - 1));
    this.pageRow = layout.rowOf[page] ?? 0;
    this.state = {
      status: props.src ? 'loading' : 'empty',
      passwordReason: null,
      error: null,
      sizes,
      geometry: null,
      outline: [],
      zoom,
      scale,
      layout,
      visible: visiblePages(layout, pageOffset(layout, page), INITIAL_VIEWPORT.height, 0, this.pageRow).pages,
      page,
      viewport: INITIAL_VIEWPORT,
      sidebar: props.sidebar !== undefined ? props.sidebar : (props.defaultSidebar ?? null),
      findOpen: false,
      find: { query: '', matchCase: false, wholeWord: false, highlightAll: true },
      matchTotal: 0,
      matchIndex: -1,
      searching: false,
      annotations: props.defaultAnnotations ?? [],
      hasSelection: false,
      thumbs: [],
      pinching: false,
    };
    const self = this;
    this.actions = Object.freeze({
      goToPage: (page: number) => self.goToPage(page - 1, 'api'),
      search: (query: string, options?: PdfViewerSearchOptions) => self.search(query, options),
      findNext: () => self.stepMatch(1),
      findPrevious: () => self.stepMatch(-1),
      clearSearch: () => self.setQuery('', true),
      setZoom: (zoom: PdfViewerZoom) => self.setZoom(zoom, 'api'),
      print: () => self.print(),
      save: () => self.save(),
      download: (fileName?: string) => self.download(fileName),
      addTextMarkup: (kind: PdfTextMarkupKind, options?: { readonly color?: string; readonly opacity?: number; readonly comment?: string }) => self.addTextMarkup(kind, options),
      removeAnnotation: (id: string) => self.removeAnnotation(id),
      getState: () => self.publicState(),
      openFind: (open = true) => self.openFind(open),
    });
  }

  // Store -------------------------------------------------------------------
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): CoreSnapshot => this.state;
  private set(patch: Partial<CoreSnapshot>): void {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof CoreSnapshot)[]) if (this.state[key] !== patch[key]) changed = true;
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  publicState(): PdfViewerStateSnapshot {
    const s = this.state;
    return { status: s.status, page: this.currentPage(), pageCount: s.sizes.length, scale: s.scale, zoom: this.zoom() };
  }

  // Derived values ------------------------------------------------------------
  private zoom(): PdfViewerZoom {
    return this.props.zoom ?? this.state.zoom;
  }
  private annotations(): readonly PdfTextMarkupAnnotation[] {
    return this.props.annotations ?? this.state.annotations;
  }
  annotationsFor(snapshotAnnotations: readonly PdfTextMarkupAnnotation[]): readonly PdfTextMarkupAnnotation[] {
    return this.props.annotations ?? snapshotAnnotations;
  }
  currentPage(): number {
    return this.state.page + 1;
  }
  private scaleFor(zoom: PdfViewerZoom, sizes: readonly PdfPageSize[], viewport: { width: number; height: number }, props: PdfViewerProps): number {
    const ref = sizes[Math.max(0, Math.min(sizes.length - 1, this.state?.page ?? 0))] ?? sizes[0] ?? LETTER;
    return resolveScale(zoom, { page: ref, viewport, scrollMode: props.scrollMode, spreadMode: props.spreadMode });
  }
  private layoutFor(sizes: readonly PdfPageSize[], scale: number, viewport: { width: number }, props: PdfViewerProps): ViewerLayout {
    return computeLayout({ sizes, scale, scrollMode: props.scrollMode ?? 'vertical', spreadMode: props.spreadMode ?? 'none', viewportWidth: viewport.width });
  }

  /** Recomputes scale and layout; keeps the reading position. */
  private relayout(patch: Partial<CoreSnapshot> = {}): void {
    const next = { ...this.state, ...patch };
    const scale = this.scaleFor(this.props.zoom ?? next.zoom, next.sizes, next.viewport, this.props);
    const layout = this.layoutFor(next.sizes, scale, next.viewport, this.props);
    const old = this.state.layout;
    if (this.viewportEl && old.boxes.length && !this.anchor) {
      const box = old.boxes[this.state.page];
      const offset = old.axis === 'x' ? Math.abs(this.viewportEl.scrollLeft) : this.viewportEl.scrollTop;
      if (box) this.anchor = { page: this.state.page, fraction: ((old.axis === 'x' ? offset - box.x : offset - box.y) + 0) / (old.axis === 'x' ? box.width : box.height), cross: 0 };
    }
    this.pageRow = layout.rowOf[Math.min(next.page, next.sizes.length - 1)] ?? 0;
    this.set({ ...patch, scale, layout });
    this.updateVisible();
    this.updateThumbs();
    if (scale !== this.renderedScale) this.scheduleRender(120);
  }
  private renderedScale = 0;

  /** Called by the component after React committed a new layout. */
  afterCommit(): void {
    const el = this.viewportEl;
    const a = this.anchor;
    this.anchor = null;
    if (!el || !a) return;
    const layout = this.state.layout;
    const box = layout.boxes[a.page];
    if (!box) return;
    if (layout.mode === 'page') return;
    const start = layout.axis === 'x' ? box.x : box.y;
    const extent = layout.axis === 'x' ? box.width : box.height;
    const target = Math.max(0, start + a.fraction * extent);
    this.lock = { page: a.page, until: performance.now() + 200 };
    if (layout.axis === 'x') el.scrollLeft = this.rtl() ? -target : target;
    else el.scrollTop = target;
    this.updateVisible();
  }

  // Props -----------------------------------------------------------------------
  setProps(props: PdfViewerProps): void {
    const prev = this.props;
    this.props = props;
    if (prev.pageSizes !== props.pageSizes && !this.engineInfo) this.relayout({ sizes: sizesFrom(props) });
    else if (prev.zoom !== props.zoom || prev.scrollMode !== props.scrollMode || prev.spreadMode !== props.spreadMode) this.relayout();
    if (props.page !== undefined && props.page !== prev.page && props.page - 1 !== this.state.page) this.goToPage(props.page - 1, 'prop', false);
    if (props.sidebar !== undefined && props.sidebar !== this.state.sidebar) this.set({ sidebar: props.sidebar });
    if (props.formValues !== undefined && props.formValues !== this.appliedForm && this.engine) {
      this.appliedForm = props.formValues;
      this.engine.setFormValues(props.formValues);
    }
    if (prev.annotations !== props.annotations) this.set({ annotations: props.annotations ?? this.state.annotations });
  }

  // Loading -----------------------------------------------------------------------
  async load(src: PdfViewerSource | null | undefined): Promise<void> {
    const id = ++this.loadId;
    this.engine?.destroy();
    this.engine = null;
    this.engineInfo = null;
    this.matches = [];
    this.texts = [];
    if (!src) {
      this.set({ status: 'empty', error: null });
      return;
    }
    this.set({ status: 'loading', error: null, passwordReason: null });
    try {
      const { openDocument } = await import('./engine/controller.js');
      const engine = await openDocument({
        src,
        password: this.props.password,
        workerSrc: this.props.workerSrc,
        documentOptions: this.props.documentOptions,
        onPassword: (reason, submit, cancel) => {
          if (id !== this.loadId) return cancel();
          this.passwordSubmit = submit;
          this.passwordCancel = cancel;
          const request = { reason, submit: (pw: string) => this.submitPassword(pw), cancel: () => this.cancelPassword() };
          this.set({ status: 'password', passwordReason: reason });
          this.props.onPasswordRequired?.(request);
        },
        hooks: {
          linkTarget: () => this.props.linkTarget ?? '_blank',
          externalLink: (url) => {
            const event = cancelable({ url, page: null as number | null });
            this.props.onLinkClick?.(event);
            return !event.defaultPrevented;
          },
          internalLink: (page) => {
            const event = cancelable({ url: null as string | null, page });
            this.props.onLinkClick?.(event);
            if (!event.defaultPrevented && page) this.goToPage(page - 1, 'link');
          },
          pageCount: () => this.state.sizes.length,
          currentPage: () => this.currentPage(),
          formInput: (name, value) => this.formInput(name, value),
        },
      });
      if (id !== this.loadId) return engine.destroy();
      this.engine = engine;
      this.engineInfo = engine.info;
      const info = engine.info;
      const form = this.props.formValues ?? this.props.defaultFormValues;
      if (form) {
        this.appliedForm = this.props.formValues;
        engine.setFormValues(form);
      }
      const page = Math.max(0, Math.min(info.pageCount - 1, this.state.page));
      this.renderedScale = 0;
      this.relayout({ status: 'ready', sizes: info.sizes, geometry: info.geometry, outline: info.outline, page, passwordReason: null });
      this.scheduleRender(0);
      this.props.onLoad?.({ pageCount: info.pageCount, pageSizes: info.sizes, title: info.title, outline: info.outline, formFields: info.formFields });
      if (this.state.find.query) this.runSearch(false);
    } catch (error) {
      if (id !== this.loadId) return;
      const err = error instanceof Error ? error : new Error(String(error));
      this.set({ status: 'error', error: err, passwordReason: null });
      this.props.onLoadError?.(err);
    }
  }
  submitPassword(password: string): void {
    const submit = this.passwordSubmit;
    this.passwordSubmit = null;
    if (submit) {
      this.set({ status: 'loading' });
      submit(password);
    }
  }
  cancelPassword(): void {
    const cancel = this.passwordCancel;
    this.passwordCancel = null;
    this.passwordSubmit = null;
    cancel?.();
  }
  destroy(): void {
    this.loadId++;
    this.engine?.destroy();
    this.engine = null;
  }

  // DOM -------------------------------------------------------------------------------
  attach(root: HTMLElement, viewport: HTMLElement, content: HTMLElement): void {
    this.root = root;
    this.viewportEl = viewport;
    this.contentEl = content;
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    const ro = new ResizeObserver(() => this.measure());
    ro.observe(viewport);
    this.cleanup.push(() => ro.disconnect());
    on(viewport, 'scroll', () => this.onScroll(), { passive: true });
    on(viewport, 'wheel', (e: WheelEvent) => this.onWheel(e), { passive: false });
    on(viewport, 'pointerdown', (e: PointerEvent) => this.onPointer(e));
    on(viewport, 'pointermove', (e: PointerEvent) => this.onPointer(e));
    on(viewport, 'pointerup', (e: PointerEvent) => this.onPointerEnd(e));
    on(viewport, 'pointercancel', (e: PointerEvent) => this.onPointerEnd(e));
    on(root, 'keydown', (e: KeyboardEvent) => this.onKeyDown(e));
    on(root, 'salmon-pdf-text', (e: CustomEvent<number>) => this.drawMatches(e.detail));
    on(root.ownerDocument, 'selectionchange', () => this.onSelection());
    this.measure();
  }
  detach(): void {
    for (const c of this.cleanup.splice(0)) c();
    cancelAnimationFrame(this.frame);
    clearTimeout(this.renderTimer);
    clearTimeout(this.searchTimer);
    clearTimeout(this.pinch.timer);
    this.root = this.viewportEl = this.contentEl = null;
  }
  setThumbsElement(el: HTMLElement | null): (() => void) | undefined {
    this.thumbsEl = el;
    if (!el) return undefined;
    const onScroll = () => this.updateThumbs();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    this.updateThumbs();
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      this.thumbsEl = null;
    };
  }
  setFindInput(el: HTMLInputElement | null): void {
    this.findInput = el;
  }

  private rtl(): boolean {
    return !!this.root && this.root.ownerDocument.defaultView?.getComputedStyle(this.root).direction === 'rtl';
  }

  private measure(): void {
    const el = this.viewportEl;
    if (!el) return;
    const viewport = { width: el.clientWidth, height: el.clientHeight };
    if (viewport.width === this.state.viewport.width && viewport.height === this.state.viewport.height) return this.updateVisible();
    if (!(viewport.width > 0)) return;
    this.relayout({ viewport });
  }

  private onScroll(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.updateVisible());
  }

  private updateVisible(): void {
    const el = this.viewportEl;
    const layout = this.state.layout;
    const offset = el ? (layout.axis === 'x' ? Math.abs(el.scrollLeft) : el.scrollTop) : pageOffset(layout, this.state.page);
    const extent = el ? (layout.axis === 'x' ? el.clientWidth : el.clientHeight) : this.state.viewport.height;
    const v = visiblePages(layout, offset, extent || this.state.viewport.height, 1, this.pageRow);
    let page = layout.mode === 'page' ? this.state.page : v.current;
    if (this.lock && performance.now() < this.lock.until) page = this.lock.page;
    else this.lock = null;
    const visible = sameList(v.pages, this.state.visible) ? this.state.visible : v.pages;
    const pageChanged = page !== this.state.page && page < this.state.sizes.length;
    this.set({ visible, ...(pageChanged ? { page } : {}) });
    if (pageChanged) this.props.onPageChange?.(page + 1, { source: 'scroll' });
  }

  // Pages ---------------------------------------------------------------------------------
  mountPage(index: number, el: HTMLElement): void {
    this.mounted.set(index, el);
    this.scheduleRender(0);
  }
  unmountPage(index: number, el: HTMLElement): void {
    if (this.mounted.get(index) !== el) return;
    this.mounted.delete(index);
    this.engine?.releasePage(index);
  }
  private scheduleRender(delay: number): void {
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.renderMounted(), delay);
  }
  private renderMounted(): void {
    const engine = this.engine;
    if (!engine) return;
    const css = this.state.scale * PDF_TO_CSS;
    this.renderedScale = this.state.scale;
    const order = [...this.mounted.keys()].sort((a, b) => Math.abs(a - this.state.page) - Math.abs(b - this.state.page));
    for (const index of order) {
      const page = this.mounted.get(index) as HTMLElement;
      const layer = (name: string) => page.querySelector<HTMLElement>(`:scope > .salmon-pdf-viewer__${name}`) as HTMLElement;
      const layers: PageLayers = { page, canvas: layer('canvas-layer'), text: layer('text-layer'), annotations: layer('annotation-layer') };
      if (!layers.canvas) continue;
      void engine.renderPage(index, layers, css).then(() => this.drawMatches(index));
    }
    for (const [index, canvas] of this.thumbCanvases) if (!canvas.width || canvas.dataset['rendered'] !== '1') this.renderThumb(index, canvas);
  }

  // Thumbnails ----------------------------------------------------------------------------
  thumbHeight(index: number): number {
    const size = this.state.sizes[index] ?? LETTER;
    return Math.round((THUMB_WIDTH * size.height) / size.width) + THUMB_EXTRA;
  }
  thumbOffset(index: number): number {
    let y = 0;
    for (let i = 0; i < index; i++) y += this.thumbHeight(i);
    return y;
  }
  private updateThumbs(): void {
    const el = this.thumbsEl;
    if (!el) return;
    const n = this.state.sizes.length;
    const metrics = createVariableRowMetrics(n, (i) => this.thumbHeight(i));
    const range = computeRange(metrics, el.scrollTop, el.clientHeight || 600, 2);
    const thumbs: number[] = [];
    for (let i = range.overscanStart; i < range.overscanEnd; i++) thumbs.push(i);
    if (!sameList(thumbs, this.state.thumbs)) this.set({ thumbs });
  }
  mountThumb(index: number, canvas: HTMLCanvasElement | null): void {
    if (!canvas) {
      this.thumbCanvases.delete(index);
      return;
    }
    this.thumbCanvases.set(index, canvas);
    this.renderThumb(index, canvas);
  }
  private renderThumb(index: number, canvas: HTMLCanvasElement): void {
    if (!this.engine) return;
    canvas.dataset['rendered'] = '1';
    void this.engine.renderThumbnail(index, canvas, THUMB_WIDTH);
  }

  // Navigation and zoom ------------------------------------------------------------------
  goToPage(index: number, source: PdfViewerEventSource, notify = true): void {
    const n = this.state.sizes.length;
    if (!n) return;
    const page = Math.max(0, Math.min(n - 1, Math.round(index)));
    const layout = this.state.layout;
    this.lock = { page, until: performance.now() + 400 };
    this.pageRow = layout.rowOf[page] ?? 0;
    const changed = page !== this.state.page;
    this.set({ page });
    const el = this.viewportEl;
    if (el) {
      if (layout.mode === 'page') el.scrollTop = 0;
      else if (layout.axis === 'x') el.scrollLeft = (this.rtl() ? -1 : 1) * pageOffset(layout, page);
      else el.scrollTop = pageOffset(layout, page);
    }
    this.updateVisible();
    if (changed && notify) this.props.onPageChange?.(page + 1, { source });
  }

  setZoom(zoom: PdfViewerZoom, source: PdfViewerEventSource): void {
    const value = typeof zoom === 'number' ? clampScale(zoom) : zoom;
    const scale = this.scaleFor(value, this.state.sizes, this.state.viewport, this.props);
    if (this.props.zoom === undefined) this.relayout({ zoom: value });
    this.props.onZoomChange?.(value, { scale, source });
  }
  zoomBy(direction: 1 | -1, source: PdfViewerEventSource): void {
    this.setZoom(stepScale(this.state.scale, direction), source);
  }

  private onWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.transientZoom(this.pinch.factor * wheelFactor(event.deltaY), event.clientX, event.clientY, 'wheel');
      return;
    }
    // 'page' mode: the wheel turns pages at the scroll ends.
    const el = this.viewportEl;
    if (this.state.layout.mode === 'page' && el && Math.abs(event.deltaY) > 20) {
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      const atStart = el.scrollTop <= 0;
      if (event.deltaY > 0 && atEnd) this.stepPage(1, 'wheel');
      else if (event.deltaY < 0 && atStart) this.stepPage(-1, 'wheel');
    }
  }

  /** Pinch and Ctrl+wheel: a CSS transform while the gesture runs; the zoom commits when it settles. */
  private transientZoom(factor: number, x: number, y: number, source: 'wheel' | 'pinch', commitAfter = 150): void {
    const content = this.contentEl;
    if (!content) return;
    const min = 0.1 / this.state.scale;
    const max = 10 / this.state.scale;
    this.pinch.factor = Math.min(max, Math.max(min, factor));
    const rect = content.getBoundingClientRect();
    content.style.transformOrigin = `${x - rect.left}px ${y - rect.top}px`;
    content.style.transform = `scale(${this.pinch.factor})`;
    if (!this.state.pinching) this.set({ pinching: true });
    clearTimeout(this.pinch.timer);
    if (commitAfter >= 0) this.pinch.timer = setTimeout(() => this.commitPinch(source), commitAfter);
  }
  private commitPinch(source: 'wheel' | 'pinch'): void {
    const content = this.contentEl;
    const factor = this.pinch.factor;
    this.pinch.factor = 1;
    if (content) {
      content.style.transform = '';
      content.style.transformOrigin = '';
    }
    this.set({ pinching: false });
    if (Math.abs(factor - 1) > 0.01) this.setZoom(pinchScale(this.state.scale, factor), source);
  }
  private onPointer(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    const p = this.pinch;
    if (event.type === 'pointerdown') p.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    else if (p.pointers.has(event.pointerId)) p.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (p.pointers.size !== 2) return;
    const [a, b] = [...p.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (event.type === 'pointerdown' || !p.startDist) {
      p.startDist = dist;
      return;
    }
    event.preventDefault();
    this.transientZoom(dist / p.startDist, (a.x + b.x) / 2, (a.y + b.y) / 2, 'pinch', -1);
  }
  private onPointerEnd(event: PointerEvent): void {
    const p = this.pinch;
    if (!p.pointers.delete(event.pointerId)) return;
    if (p.startDist && p.pointers.size < 2) {
      p.startDist = 0;
      this.commitPinch('pinch');
    }
  }

  stepPage(delta: number, source: PdfViewerEventSource): void {
    const layout = this.state.layout;
    // Spreads step by row.
    const row = (layout.rowOf[this.state.page] ?? 0) + delta;
    const target = layout.rows[Math.max(0, Math.min(layout.rows.length - 1, row))]?.pages[0];
    if (target !== undefined) this.goToPage(target, source);
  }

  private onKeyDown(event: KeyboardEvent): void {
    const mod = isMac() ? event.metaKey : event.ctrlKey;
    const key = event.key;
    if (mod && !event.altKey) {
      if (key === 'f' || key === 'F') {
        event.preventDefault();
        this.openFind(true);
        return;
      }
      if (key === '=' || key === '+') {
        event.preventDefault();
        return this.zoomBy(1, 'keyboard');
      }
      if (key === '-' || key === '_') {
        event.preventDefault();
        return this.zoomBy(-1, 'keyboard');
      }
      if (key === '0') {
        event.preventDefault();
        return this.setZoom('auto', 'keyboard');
      }
      if (key === 'p' || key === 'P') {
        event.preventDefault();
        void this.print();
        return;
      }
    }
    if (event.target !== this.viewportEl || mod || event.altKey) return;
    const mode = this.state.layout.mode;
    const paged = mode === 'page' || mode === 'horizontal';
    const next = paged ? ['PageDown', 'ArrowRight', 'ArrowDown', 'n', 'j'] : ['n', 'j'];
    const prev = paged ? ['PageUp', 'ArrowLeft', 'ArrowUp', 'p', 'k'] : ['p', 'k'];
    const rtl = this.rtl() && (key === 'ArrowRight' || key === 'ArrowLeft');
    if (next.includes(key) && !(event.shiftKey && key === ' ')) {
      event.preventDefault();
      this.stepPage(rtl ? -1 : 1, 'keyboard');
    } else if (prev.includes(key)) {
      event.preventDefault();
      this.stepPage(rtl ? 1 : -1, 'keyboard');
    } else if (key === 'Home') {
      event.preventDefault();
      this.goToPage(0, 'keyboard');
    } else if (key === 'End') {
      event.preventDefault();
      this.goToPage(this.state.sizes.length - 1, 'keyboard');
    }
  }

  followOutline(item: PdfViewerOutlineItem): void {
    if (item.page) this.goToPage(item.page - 1, 'outline');
    else if (item.url) {
      const event = cancelable({ url: item.url as string | null, page: null as number | null });
      this.props.onLinkClick?.(event);
      if (!event.defaultPrevented) this.root?.ownerDocument.defaultView?.open(item.url, this.props.linkTarget ?? '_blank', 'noopener,noreferrer');
    }
  }

  // Panels ------------------------------------------------------------------------------
  /**
   * Mount, before paint: a `defaultSidebar` stays closed when the viewer is
   * at most 480px wide, where the sidebar overlays the pages (pdf-viewer.css)
   * and would cover the document. A controlled `sidebar` is left alone; no
   * `onSidebarChange` (nothing changed from the user's side).
   */
  applyNarrowDefault(width: number): void {
    if (this.props.sidebar === undefined && this.state.sidebar !== null && width > 0 && width <= NARROW_WIDTH) this.set({ sidebar: null });
  }
  setSidebar(sidebar: PdfViewerSidebar | null): void {
    if (this.props.sidebar === undefined) this.set({ sidebar });
    this.props.onSidebarChange?.(sidebar);
  }
  openFind(open: boolean): void {
    this.set({ findOpen: open });
    if (open) queueMicrotask(() => requestAnimationFrame(() => this.findInput?.select()));
    else {
      this.setQuery('', true);
      this.viewportEl?.focus({ preventScroll: true });
    }
  }

  // Search ------------------------------------------------------------------------------
  setFindOption(patch: Partial<FindState>): void {
    this.set({ find: { ...this.state.find, ...patch } });
    if ('highlightAll' in patch && Object.keys(patch).length === 1) return this.redrawMatches();
    this.runSearch(false);
  }
  setQuery(query: string, immediate = false): void {
    this.set({ find: { ...this.state.find, query } });
    clearTimeout(this.searchTimer);
    if (immediate) this.runSearch(true);
    else this.searchTimer = setTimeout(() => this.runSearch(true), 150);
  }
  async search(query: string, options: PdfViewerSearchOptions = {}): Promise<PdfViewerSearchResult> {
    clearTimeout(this.searchTimer);
    this.set({
      find: {
        query,
        matchCase: options.matchCase ?? this.state.find.matchCase,
        wholeWord: options.wholeWord ?? this.state.find.wholeWord,
        highlightAll: options.highlightAll ?? this.state.find.highlightAll,
      },
    });
    return this.runSearch(true);
  }
  private async runSearch(jump: boolean): Promise<PdfViewerSearchResult> {
    const run = ++this.searchRun;
    const { query, matchCase, wholeWord } = this.state.find;
    const engine = this.engine;
    if (!query.trim() || !engine) {
      this.matches = [];
      this.set({ matchTotal: 0, matchIndex: -1, searching: false });
      this.redrawMatches();
      return this.result(true);
    }
    this.set({ searching: true });
    if (this.texts.length !== engine.info.pageCount) {
      const texts: PageText[] = [];
      for (let i = 0; i < engine.info.pageCount; i++) texts.push(await engine.pageText(i));
      if (run !== this.searchRun) return this.result(false);
      this.texts = texts;
    }
    this.matches = findMatches(this.texts, query, { matchCase, wholeWord });
    // The current match: the first one at or after the current page.
    const start = this.matches.findIndex((m) => m.page >= this.state.page);
    const matchIndex = this.matches.length ? (start < 0 ? 0 : start) : -1;
    this.set({ matchTotal: this.matches.length, matchIndex, searching: false });
    this.scrollToMatch = jump;
    if (jump && matchIndex >= 0) this.showMatch();
    this.redrawMatches();
    return this.result(true);
  }
  private result(notify: boolean): PdfViewerSearchResult {
    const m = this.matches[this.state.matchIndex];
    const result: PdfViewerSearchResult = { query: this.state.find.query, total: this.matches.length, current: m ? this.state.matchIndex + 1 : 0, page: m ? m.page + 1 : 0, pages: countByPage(this.matches) };
    if (notify) this.props.onSearchResult?.(result);
    return result;
  }
  stepMatch(delta: 1 | -1): void {
    const n = this.matches.length;
    if (!n) return;
    const matchIndex = (((this.state.matchIndex + delta) % n) + n) % n;
    this.set({ matchIndex });
    this.scrollToMatch = true;
    this.showMatch();
    this.redrawMatches();
    this.result(true);
  }
  private showMatch(): void {
    const m = this.matches[this.state.matchIndex];
    if (!m) return;
    if (!this.state.visible.includes(m.page) || m.page !== this.state.page) this.goToPage(m.page, 'search');
  }
  private redrawMatches(): void {
    for (const index of this.mounted.keys()) this.drawMatches(index);
  }
  /** Find highlights of one rendered page, as percentages of the page box (zoom independent). */
  drawMatches(index: number): void {
    const page = this.mounted.get(index);
    const layer = page?.querySelector<HTMLElement>(':scope > .salmon-pdf-viewer__find-layer');
    if (!page || !layer || !this.engine) return;
    layer.replaceChildren();
    const text = this.texts[index];
    const spans = this.engine.textSpans(index);
    if (!text || !spans.length) return;
    const { highlightAll } = this.state.find;
    const pageRect = page.getBoundingClientRect();
    if (!pageRect.width) return;
    const doc = page.ownerDocument;
    let current: HTMLElement | null = null;
    this.matches.forEach((m, i) => {
      if (m.page !== index) return;
      const isCurrent = i === this.state.matchIndex;
      if (!isCurrent && !highlightAll) return;
      for (const [item, from, to] of matchPieces(text, m.start, m.end)) {
        const node = spans[item]?.firstChild;
        if (!node) continue;
        const range = doc.createRange();
        try {
          range.setStart(node, Math.min(from, node.textContent?.length ?? 0));
          range.setEnd(node, Math.min(to, node.textContent?.length ?? 0));
        } catch {
          continue;
        }
        for (const r of range.getClientRects()) {
          const mark = doc.createElement('div');
          mark.className = 'salmon-pdf-viewer__find-match';
          if (isCurrent) mark.setAttribute('data-current', '');
          mark.style.left = `${((r.left - pageRect.left) / pageRect.width) * 100}%`;
          mark.style.top = `${((r.top - pageRect.top) / pageRect.height) * 100}%`;
          mark.style.width = `${(r.width / pageRect.width) * 100}%`;
          mark.style.height = `${(r.height / pageRect.height) * 100}%`;
          layer.append(mark);
          current ??= isCurrent ? mark : null;
        }
      }
    });
    if (current && this.scrollToMatch) {
      this.scrollToMatch = false;
      this.lock = { page: index, until: performance.now() + 300 };
      (current as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' });
    }
  }

  // Selection and text markup -------------------------------------------------------------
  private onSelection(): void {
    const sel = this.root?.ownerDocument.getSelection();
    const range = sel && sel.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0) : null;
    const inside = !!range && !!this.contentEl?.contains(range.commonAncestorContainer);
    if (inside) this.lastRange = range.cloneRange();
    this.set({ hasSelection: inside || (!!this.lastRange && !!sel && !sel.isCollapsed && !!this.root?.contains(sel.anchorNode)) });
  }
  addTextMarkup(kind: PdfTextMarkupKind, options: { readonly color?: string; readonly opacity?: number; readonly comment?: string } = {}): readonly PdfTextMarkupAnnotation[] {
    const geometry = this.state.geometry;
    const sel = this.root?.ownerDocument.getSelection();
    const live = sel && sel.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0) : null;
    const range = live && this.contentEl?.contains(live.commonAncestorContainer) ? live : this.lastRange;
    if (!range || !geometry) return [];
    const text = range.toString().replace(/\s+/g, ' ').trim();
    const rects = [...range.getClientRects()];
    const created: PdfTextMarkupAnnotation[] = [];
    const css = this.state.scale * PDF_TO_CSS;
    for (const [index, el] of this.mounted) {
      const box = el.getBoundingClientRect();
      const local: CssRect[] = rects
        .filter((r) => {
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          return cx >= box.left && cx <= box.right && cy >= box.top && cy <= box.bottom;
        })
        .map((r) => ({ left: r.left - box.left, top: r.top - box.top, width: r.width, height: r.height }));
      const lines = mergeLineRects(local);
      if (!lines.length || !geometry[index]) continue;
      created.push({
        id: annotationId(),
        kind,
        page: index + 1,
        rects: lines.map((r) => cssRectToPdf(geometry[index] as PageGeometry, css, r)),
        color: options.color ?? this.props.annotationColors?.[kind] ?? DEFAULT_MARKUP_COLORS[kind],
        ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
        ...(this.props.annotationAuthor ? { author: this.props.annotationAuthor } : {}),
        ...(options.comment ? { comment: options.comment } : {}),
        ...(text ? { text } : {}),
        createdAt: new Date().toISOString(),
      });
    }
    created.sort((a, b) => a.page - b.page);
    let list = this.annotations();
    for (const annotation of created) {
      list = [...list, annotation];
      if (this.props.annotations === undefined) this.set({ annotations: list });
      this.props.onAnnotationsChange?.(list, { reason: 'create', annotation });
    }
    if (created.length) {
      sel?.removeAllRanges();
      this.lastRange = null;
      this.set({ hasSelection: false });
    }
    return created;
  }
  removeAnnotation(id: string): void {
    const list = this.annotations();
    const annotation = list.find((a) => a.id === id);
    if (!annotation) return;
    const next = list.filter((a) => a.id !== id);
    if (this.props.annotations === undefined) this.set({ annotations: next });
    this.props.onAnnotationsChange?.(next, { reason: 'remove', annotation });
  }

  // Forms --------------------------------------------------------------------------------
  private formInput(name: string, value: PdfFormValue): void {
    const engine = this.engine;
    if (!engine) return;
    const values = { ...engine.formValues(), ...this.props.formValues, [name]: value };
    this.props.onFormValuesChange?.(values, { name });
  }

  // Print and save ------------------------------------------------------------------------
  async print(): Promise<boolean> {
    const event = cancelable({});
    this.props.onBeforePrint?.(event);
    if (event.defaultPrevented || !this.engine || this.printing) return false;
    this.printing = true;
    const doc = this.root?.ownerDocument ?? document;
    try {
      const container = await this.engine.print(this.props.printResolution ?? 150, this.annotations());
      doc.body.append(container);
      await Promise.all([...container.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
      const win = doc.defaultView ?? window;
      const done = () => {
        win.removeEventListener('afterprint', done);
        for (const img of container.querySelectorAll('img')) if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
        container.remove();
      };
      win.addEventListener('afterprint', done);
      win.print();
      setTimeout(done, 1000);
      return true;
    } finally {
      this.printing = false;
    }
  }
  async save(): Promise<Blob> {
    if (!this.engine) throw new Error('PdfViewer: no document is loaded.');
    const bytes = await this.engine.save(this.annotations());
    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
  }
  async download(fileName?: string): Promise<void> {
    const blob = await this.save();
    const doc = this.root?.ownerDocument ?? document;
    const a = doc.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName ?? this.props.fileName ?? 'document.pdf';
    a.style.display = 'none';
    doc.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  }
}
