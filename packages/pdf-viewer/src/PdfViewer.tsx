'use client';
// PdfViewer.
// Render-safe: the server and the first client render show the shell and
// sized page placeholders from `pageSizes`; pdf.js loads with dynamic
// import() in an effect. React renders the page boxes in view and the text
// markup overlay; the canvas, text and annotation layers are filled
// imperatively by the engine inside elements React leaves empty.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type Ref } from 'react';
import { Button } from '@salmonui/buttons/button';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { Dialog, DialogBody, DialogFooter } from '@salmonui/overlays/dialog';
import { TreeView } from '@salmonui/navigation/tree-view';
import { INITIAL_VIEWPORT, THUMB_WIDTH, ViewerCore, type CoreSnapshot } from './core.js';
import type { PageBox } from './layout.js';
import { fill, PDF_VIEWER_DEFAULT_LOCALE_TEXT, type PdfViewerLocaleText } from './locale.js';
import { markBand, pdfRectToCss, type PageGeometry } from './markup.js';
import { ViewerToolbar, FindBar } from './toolbar.js';
import type { PdfTextMarkupAnnotation, PdfViewerOutlineItem, PdfViewerProps } from './types.js';
import { PDF_TO_CSS } from './zoom.js';

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref && typeof ref === 'object') (ref as { current: T | null }).current = value;
}

const useIsoLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/** Props that configure the viewer and never reach the root element. */
const OWN_PROPS = new Set([
  'src', 'workerSrc', 'documentOptions', 'password', 'onPasswordRequired', 'onLoad', 'onLoadError', 'pageSizes', 'pageCount', 'page', 'defaultPage', 'onPageChange',
  'zoom', 'defaultZoom', 'onZoomChange', 'scrollMode', 'spreadMode', 'sidebar', 'defaultSidebar', 'onSidebarChange', 'toolbar', 'renderToolbar', 'textSelection',
  'linkTarget', 'onLinkClick', 'onBeforePrint', 'printResolution', 'fileName', 'onSearchResult', 'annotations', 'defaultAnnotations', 'onAnnotationsChange',
  'annotationAuthor', 'annotationColors', 'formValues', 'defaultFormValues', 'onFormValuesChange', 'actionsRef', 'localeText', 'classNames', 'styles', 'ref', 'className', 'style',
]);

export function PdfViewer(props: PdfViewerProps): ReactNode {
  const [core] = useState(() => new ViewerCore(props));
  const snap = useSyncExternalStore(core.subscribe, core.getSnapshot, core.getSnapshot);
  const localeText = useLocaleText('pdfViewer', props.localeText);
  const t: PdfViewerLocaleText = useMemo(() => ({ ...PDF_VIEWER_DEFAULT_LOCALE_TEXT, ...localeText }), [localeText]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const { actionsRef, ref, classNames, styles, className, style, src, password, textSelection = true } = props;

  useIsoLayoutEffect(() => core.setProps(props));
  useIsoLayoutEffect(() => core.afterCommit(), [core, snap.layout]);
  // A default sidebar would cover the pages of a narrow viewer: close it before the first paint.
  useIsoLayoutEffect(() => {
    if (rootRef.current) core.applyNarrowDefault(rootRef.current.clientWidth);
  }, [core]);
  useEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!root || !viewport || !content) return undefined;
    core.attach(root, viewport, content);
    return () => core.detach();
  }, [core]);
  useEffect(() => {
    void core.load(src);
  }, [core, src, password]);
  useEffect(() => () => core.destroy(), [core]);
  useIsoLayoutEffect(() => {
    if (typeof actionsRef === 'function') actionsRef(core.actions);
    else if (actionsRef) (actionsRef as { current: unknown }).current = core.actions;
    return () => {
      if (typeof actionsRef === 'function') actionsRef(null);
      else if (actionsRef) (actionsRef as { current: unknown }).current = null;
    };
  }, [core, actionsRef]);

  const setRoot = useCallback(
    (el: HTMLDivElement | null) => {
      rootRef.current = el;
      assignRef(ref, el);
    },
    [ref],
  );

  const domProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) if (!OWN_PROPS.has(key)) domProps[key] = value;
  const count = snap.sizes.length;
  const annotations = core.annotationsFor(snap.annotations);
  const cssScale = snap.scale * PDF_TO_CSS;
  const toolbarOn = props.toolbar !== false;

  return (
    <div
      role="region"
      aria-label={t.label}
      {...domProps}
      ref={setRoot}
      className={cx('salmon-pdf-viewer', className)}
      style={style}
      data-status={snap.status}
      data-scroll-mode={snap.layout.mode}
      data-sidebar={snap.sidebar ?? undefined}
      data-text-selection={textSelection ? undefined : 'false'}
    >
      {toolbarOn ? <ViewerToolbar core={core} snap={snap} t={t} props={props} /> : null}
      {snap.findOpen ? <FindBar core={core} snap={snap} t={t} className={classNames?.findBar} style={styles?.findBar} /> : null}
      <div className="salmon-pdf-viewer__body">
        {snap.sidebar ? <Sidebar core={core} snap={snap} t={t} className={classNames?.sidebar} style={styles?.sidebar} /> : null}
        <div
          ref={viewportRef}
          className={cx('salmon-pdf-viewer__viewport', classNames?.viewport)}
          style={styles?.viewport}
          tabIndex={0}
          role="document"
          aria-label={t.label}
          aria-busy={snap.status === 'loading' ? true : undefined}
          data-pinching={snap.pinching ? '' : undefined}
        >
          <div ref={contentRef} className="salmon-pdf-viewer__pages" style={{ width: snap.layout.width, height: snap.layout.height }}>
            {snap.visible.map((index) => {
              const box = snap.layout.boxes[index];
              if (!box) return null;
              const size = snap.sizes[index] ?? { width: 612, height: 792 };
              const geometry: PageGeometry = snap.geometry?.[index] ?? { view: [0, 0, size.width, size.height], rotate: 0 };
              return (
                <PageView
                  key={index}
                  core={core}
                  index={index}
                  box={box}
                  cssScale={cssScale}
                  geometry={geometry}
                  label={fill(t.pageLabel, { page: index + 1, count })}
                  annotations={annotations}
                />
              );
            })}
          </div>
          {snap.status !== 'ready' ? (
            <div className="salmon-pdf-viewer__status" role="status">
              {snap.status === 'loading' ? t.loading : snap.status === 'error' ? t.loadError : snap.status === 'empty' ? t.empty : null}
            </div>
          ) : null}
        </div>
      </div>
      {snap.status === 'password' && !props.onPasswordRequired ? <PasswordDialog core={core} reason={snap.passwordReason} t={t} /> : null}
    </div>
  );
}

interface PageViewProps {
  readonly core: ViewerCore;
  readonly index: number;
  readonly box: PageBox;
  readonly cssScale: number;
  readonly geometry: PageGeometry;
  readonly label: string;
  readonly annotations: readonly PdfTextMarkupAnnotation[];
}

const PageView = memo(function PageView({ core, index, box, cssScale, geometry, label, annotations }: PageViewProps) {
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return undefined;
      core.mountPage(index, el);
      return () => core.unmountPage(index, el);
    },
    [core, index],
  );
  const style = {
    left: box.x,
    top: box.y,
    width: box.width,
    height: box.height,
    // pdf.js text and annotation layers size and place themselves from these variables.
    '--scale-factor': cssScale,
    '--total-scale-factor': cssScale,
    '--scale-round-x': '1px',
    '--scale-round-y': '1px',
  } as CSSProperties;
  const marks = annotations.filter((a) => a.page === index + 1);
  return (
    <div ref={ref} className="salmon-pdf-viewer__page" role="region" aria-label={label} data-page-number={index + 1} style={style}>
      <div className="salmon-pdf-viewer__canvas-layer" />
      <div className="salmon-pdf-viewer__markup-layer" aria-hidden="true">
        {marks.flatMap((a) =>
          a.rects.map((rect, j) => {
            const r = pdfRectToCss(geometry, cssScale, markBand(a.kind, rect));
            return (
              <div
                key={`${a.id}-${j}`}
                className="salmon-pdf-viewer__markup"
                data-kind={a.kind}
                data-annotation-id={a.id}
                title={a.comment}
                style={{ left: r.left, top: r.top, width: r.width, height: r.height, background: a.color, opacity: a.opacity ?? 1 }}
              />
            );
          }),
        )}
      </div>
      <div className="salmon-pdf-viewer__find-layer" aria-hidden="true" />
      <div className="salmon-pdf-viewer__text-layer" />
      <div className="salmon-pdf-viewer__annotation-layer" />
    </div>
  );
});

function Sidebar({ core, snap, t, className, style }: { readonly core: ViewerCore; readonly snap: CoreSnapshot; readonly t: PdfViewerLocaleText; readonly className?: string | undefined; readonly style?: CSSProperties | undefined }) {
  const tab = snap.sidebar;
  return (
    <aside className={cx('salmon-pdf-viewer__sidebar', className)} style={style} aria-label={tab === 'outline' ? t.outline : t.thumbnails}>
      <div className="salmon-pdf-viewer__sidebar-tabs" role="group" aria-label={t.sidebar}>
        <Button size="sm" variant={tab === 'thumbnails' ? 'outline' : 'ghost'} aria-pressed={tab === 'thumbnails'} onClick={() => core.setSidebar('thumbnails')}>
          {t.thumbnails}
        </Button>
        <Button size="sm" variant={tab === 'outline' ? 'outline' : 'ghost'} aria-pressed={tab === 'outline'} onClick={() => core.setSidebar('outline')}>
          {t.outline}
        </Button>
      </div>
      {tab === 'outline' ? <Outline core={core} outline={snap.outline} t={t} /> : <Thumbnails core={core} snap={snap} t={t} />}
    </aside>
  );
}

function Thumbnails({ core, snap, t }: { readonly core: ViewerCore; readonly snap: CoreSnapshot; readonly t: PdfViewerLocaleText }) {
  const ref = useCallback((el: HTMLDivElement | null) => core.setThumbsElement(el), [core]);
  const count = snap.sizes.length;
  const total = count ? core.thumbOffset(count) : 0;
  return (
    <div ref={ref} className="salmon-pdf-viewer__thumbnails" role="list" aria-label={t.thumbnails}>
      <div className="salmon-pdf-viewer__thumbnails-inner" style={{ height: total }}>
        {snap.thumbs.map((i) => (
          <div key={i} role="listitem" className="salmon-pdf-viewer__thumbnail-item" style={{ top: core.thumbOffset(i) }}>
            <button
              type="button"
              className="salmon-pdf-viewer__thumbnail"
              aria-label={fill(t.thumbnailLabel, { page: i + 1 })}
              aria-current={snap.page === i ? 'page' : undefined}
              onClick={() => core.goToPage(i, 'thumbnail')}
            >
              <canvas
                ref={(c) => {
                  core.mountThumb(i, c);
                  return () => core.mountThumb(i, null);
                }}
                aria-hidden="true"
                style={{ width: THUMB_WIDTH, height: core.thumbHeight(i) - 36 }}
              />
              <span className="salmon-pdf-viewer__thumbnail-label" aria-hidden="true">
                {i + 1}
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Outline({ core, outline, t }: { readonly core: ViewerCore; readonly outline: readonly PdfViewerOutlineItem[]; readonly t: PdfViewerLocaleText }) {
  if (!outline.length) return <p className="salmon-pdf-viewer__empty-outline">{t.noOutline}</p>;
  return (
    <TreeView<PdfViewerOutlineItem>
      className="salmon-pdf-viewer__outline"
      aria-label={t.outline}
      data={outline}
      getItemId={(item) => item.id}
      getItemLabel={(item) => item.title}
      getChildren={(item) => (item.items.length ? item.items : null)}
      selection="single"
      height="100%"
      onItemClick={(event) => core.followOutline(event.item)}
    />
  );
}

function PasswordDialog({ core, reason, t }: { readonly core: ViewerCore; readonly reason: 'required' | 'incorrect' | null; readonly t: PdfViewerLocaleText }) {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement | null>(null);
  return (
    <Dialog
      open
      title={t.passwordTitle}
      className="salmon-pdf-viewer__password"
      initialFocus={input}
      onOpenChange={(open) => {
        if (!open) core.cancelPassword();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          core.submitPassword(value);
          setValue('');
        }}
      >
        <DialogBody>
          <p>{reason === 'incorrect' ? t.passwordIncorrect : t.passwordPrompt}</p>
          <label className="salmon-pdf-viewer__password-field">
            <span>{t.passwordLabel}</span>
            <input ref={input} type="password" autoComplete="current-password" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={reason === 'incorrect' ? true : undefined} />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => core.cancelPassword()}>
            {t.passwordCancel}
          </Button>
          <Button type="submit" tone="primary">
            {t.passwordSubmit}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export { INITIAL_VIEWPORT };
