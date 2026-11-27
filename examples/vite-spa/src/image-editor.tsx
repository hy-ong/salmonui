// ImageEditor browser page (tests/browser/image-editor*.spec.ts). The image is
// generated: a 200 x 100 canvas, left half red, right half blue, a 20 x 20 green square at
// the top-left corner (orientation marker).
//
//   ?src=url|blob|imagedata|none  ?controlled  ?dir=rtl  ?scheme=dark  ?width=<px>
//   ?nofilter (no ctx.filter: pixel fallback)  ?smoothing=0  ?quick=0  ?toolbar=custom|none
//   ?veto=<operation> (the matching onBefore* cancels)  ?annotations (two preset shapes)
//   ?undoLimit=<n>  ?hydrate  ?minZoom=<n>
//
// window.__ie is the actions ref; window.__ieLog records { events: string[], changes: string[], history, saved }.
import { StrictMode, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/editors/image-editor/styles.css';
import '@salmonui/core/styles.css';
import { ImageEditor, IMAGE_EDITOR_DEFAULT_TOOLBAR, type ImageEditorActions, type ImageEditorAnnotation, type ImageEditorProps, type ImageEditorSource, type ImageEditorTransform } from '@salmonui/editors/image-editor';
import { ThemeProvider } from '@salmonui/core/theme';

const params = new URLSearchParams(location.search);
const flag = (name: string): boolean => params.has(name);

if (flag('nofilter')) {
  // An engine without ctx.filter (Safari before 18): finetune and filters use the pixel fallback.
  for (const proto of [CanvasRenderingContext2D.prototype, typeof OffscreenCanvasRenderingContext2D === 'undefined' ? null : OffscreenCanvasRenderingContext2D.prototype]) {
    if (proto) delete (proto as unknown as { filter?: string }).filter;
  }
}

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 200;
  c.height = 100;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(100, 0, 100, 100);
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(0, 0, 20, 20);
  return c;
}

const log = { events: [] as string[], changes: [] as string[], history: null as unknown, saved: 0, transform: null as unknown, annotations: null as unknown };
declare global {
  interface Window {
    __ie?: ImageEditorActions | null;
    __ieLog: typeof log;
    __ieSource: () => Promise<ImageEditorSource>;
  }
}
window.__ieLog = log;

async function source(kind: string): Promise<ImageEditorSource | null> {
  const c = makeCanvas();
  if (kind === 'none') return null;
  if (kind === 'imagedata') return c.getContext('2d')!.getImageData(0, 0, 200, 100);
  if (kind === 'blob') return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/png'));
  return c.toDataURL('image/png');
}
window.__ieSource = async () => (await source('blob'))!;

const PRESET: readonly ImageEditorAnnotation[] = [
  { id: 'r1', kind: 'rectangle', x: 10, y: 10, width: 40, height: 30, stroke: '#000000', fill: '#ffff00', strokeWidth: 2 },
  { id: 'e1', kind: 'ellipse', x: 120, y: 40, width: 50, height: 40, stroke: '#ffffff', strokeWidth: 3 },
];

function Editor({ src }: { src: ImageEditorSource | null }): ReactNode {
  const ref = useRef<ImageEditorActions | null>(null);
  const [transform, setTransform] = useState<ImageEditorTransform>({});
  const [annotations, setAnnotations] = useState<readonly ImageEditorAnnotation[]>(flag('annotations') ? PRESET : []);
  const veto = params.get('veto');
  const ev = (name: string) => (e: { operation: string; value: unknown; source: string; preventDefault?: () => void; action?: string }) => {
    log.events.push(`${name}:${e.operation}:${e.source}${e.action ? `:${e.action}` : ''}`);
    if (name.startsWith('before') && veto === e.operation) e.preventDefault?.();
  };
  const handlers: Partial<ImageEditorProps> = {};
  for (const n of ['Crop', 'Rotate', 'Flip', 'Resize', 'Zoom', 'Pan', 'AnnotationChange', 'Filter', 'Adjust', 'Frame', 'Select']) {
    (handlers as Record<string, unknown>)[`onBefore${n}`] = ev('before');
    (handlers as Record<string, unknown>)[`on${n}`] = ev('after');
  }
  const controlled = flag('controlled');
  useEffect(() => {
    window.__ie = ref.current;
  });
  const toolbar = params.get('toolbar');
  return (
    <ImageEditor
      {...handlers}
      id="ie"
      src={src}
      actionsRef={ref}
      style={{ inlineSize: params.get('width') ? `${params.get('width')}px` : '100%', blockSize: 480 }}
      className="demo-image-editor"
      imageSmoothing={params.get('smoothing') !== '0'}
      quickAccessToolbar={params.get('quick') === '0' ? false : undefined}
      undoLimit={params.get('undoLimit') ? Number(params.get('undoLimit')) : undefined}
      minZoom={params.get('minZoom') ? Number(params.get('minZoom')) : undefined}
      toolbar={toolbar === 'none' ? false : toolbar === 'custom' ? [...IMAGE_EDITOR_DEFAULT_TOOLBAR, '|', { id: 'stamp', label: 'Stamp', onClick: () => log.events.push('custom:stamp') }] : undefined}
      onToolbarItemClick={(e) => {
        log.events.push(`item:${e.id}:${e.source}`);
        if (e.id === 'reset' && flag('vetoReset')) e.preventDefault();
      }}
      onSave={() => {
        log.saved++;
      }}
      onLoad={({ width, height }) => log.events.push(`load:${width}x${height}`)}
      onLoadError={() => log.events.push('loadError')}
      onHistoryChange={(h) => {
        log.history = h;
      }}
      onEditComplete={(e) => log.events.push(`complete:${e.operation}:${e.source}`)}
      onBeforeExport={(e) => {
        log.events.push(`export:${e.type}:${e.width}x${e.height}`);
        if (veto === 'export') e.preventDefault();
      }}
      {...(controlled
        ? {
            transform,
            onTransformChange: (t: ImageEditorTransform, e: { reason: string }) => {
              log.changes.push(`transform:${e.reason}`);
              log.transform = t;
              setTransform(t);
            },
            annotations,
            onAnnotationsChange: (a: readonly ImageEditorAnnotation[], e: { reason: string }) => {
              log.changes.push(`annotations:${e.reason}`);
              log.annotations = a;
              setAnnotations(a);
            },
          }
        : {
            defaultAnnotations: annotations,
            onTransformChange: (t: ImageEditorTransform, e: { reason: string }) => {
              log.changes.push(`transform:${e.reason}`);
              log.transform = t;
            },
            onAnnotationsChange: (a: readonly ImageEditorAnnotation[], e: { reason: string }) => {
              log.changes.push(`annotations:${e.reason}`);
              log.annotations = a;
            },
          })}
      onAdjustmentsChange={(_a, e) => log.changes.push(`adjustments:${e.reason}`)}
      onFilterChange={(f, e) => log.changes.push(`filter:${f}:${e.reason}`)}
      onFrameChange={(f, e) => log.changes.push(`frame:${f.type}:${e.reason}`)}
      onToolChange={(t) => log.changes.push(`tool:${t}`)}
    />
  );
}

function Page({ src }: { src: ImageEditorSource | null }): ReactNode {
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main dir={params.get('dir') === 'rtl' ? 'rtl' : 'ltr'} style={{ padding: 24, background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
        <h1>Image editor</h1>
        <Editor src={src} />
        <button type="button" id="after">
          After
        </button>
      </main>
    </ThemeProvider>
  );
}

const root = document.getElementById('root')!;
void source(params.get('src') ?? 'url').then((src) => {
  if (flag('hydrate')) {
    // Server markup first (a string source renders the same shell), then hydration.
    root.innerHTML = renderToString(<Page src={src} />);
    hydrateRoot(root, <Page src={src} />, { onRecoverableError: (error) => console.error('recoverable', error) });
    (window as unknown as { __hydrated: boolean }).__hydrated = true;
  } else {
    createRoot(root).render(
      <StrictMode>
        <Page src={src} />
      </StrictMode>,
    );
  }
});
