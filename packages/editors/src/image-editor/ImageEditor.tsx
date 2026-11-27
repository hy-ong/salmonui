'use client';

// ImageEditor. Canvas 2D, zero dependencies. React owns the committed edit
// (controlled triads, history, tool, selection); the engine (`engine.ts`)
// owns the canvas and the requestAnimationFrame render loop, and its lazily
// loaded interaction layer (`interact.ts`) every pointer, wheel, pinch and
// drag transient. Edit operations (`ops.ts`), panels and the quick-access
// toolbar (`panels.tsx`), the annotation model and drawing, frames and the
// pixel fallback are lazy chunks. Render reads no browser global, so the
// server renders the same shell.

import { lazy, Suspense, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Toolbar, ToolbarItem, ToolbarSeparator } from '@salmonui/navigation/toolbar';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { announce, liveRegionProps } from '@salmonui/core/internal/live-region';
import { pressSource } from '@salmonui/core/internal/press';
import { filterOps } from './adjust.js';
import { ImageEditorEngine } from './engine.js';
import { clamp, outputSize, type Point, type Size } from './geometry.js';
import { emptyHistory, pushHistory, redoHistory, undoHistory, type History } from './history.js';
import { IMAGE_EDITOR_DEFAULT_LOCALE_TEXT, IMAGE_EDITOR_DEFAULT_QUICK_TOOLBAR, IMAGE_EDITOR_DEFAULT_TOOLBAR, itemIcon, TOOL_ITEMS } from './items.js';
import type { StyleDefaults } from './panels.js';
import type {
  ImageEditorActions,
  ImageEditorAdjustments,
  ImageEditorAnnotation,
  ImageEditorBeforeEvent,
  ImageEditorChangeEvent,
  ImageEditorCropRatio,
  ImageEditorEditState,
  ImageEditorEvent,
  ImageEditorFilter,
  ImageEditorFrame,
  ImageEditorInputSource,
  ImageEditorLocaleText,
  ImageEditorOperation,
  ImageEditorProps,
  ImageEditorSource,
  ImageEditorTool,
  ImageEditorToolbarItem,
  ImageEditorTransform,
} from './types.js';

type Ops = typeof import('./ops.js');
const Panels = lazy(() => import('./panels.js'));
const loadOps = (): Promise<Ops> => import('./ops.js');

const EMPTY_TRANSFORM: ImageEditorTransform = Object.freeze({});
const EMPTY_ADJUSTMENTS: ImageEditorAdjustments = Object.freeze({});
const NO_FRAME: ImageEditorFrame = Object.freeze({ type: 'none' });
const NO_ANNOTATIONS: readonly ImageEditorAnnotation[] = Object.freeze([]);
const FRESH: ImageEditorEditState = Object.freeze({ transform: EMPTY_TRANSFORM, adjustments: EMPTY_ADJUSTMENTS, filter: 'default', frame: NO_FRAME, annotations: NO_ANNOTATIONS });
export const IMAGE_EDITOR_DEFAULT_CROP_RATIOS: readonly ImageEditorCropRatio[] = Object.freeze(['free', 'square', 'circle', '3:2', '4:3', '16:9'] as ImageEditorCropRatio[]);
const PANEL_TOOLS: ReadonlySet<string> = new Set(['crop', 'straighten', 'resize', 'adjust', 'filter', 'frame', 'rectangle', 'ellipse', 'line', 'arrow', 'path', 'freehand', 'text', 'redact']);
const DRAWING: ReadonlySet<string> = new Set(['rectangle', 'ellipse', 'line', 'arrow', 'path', 'freehand', 'text', 'image', 'redact']);

/** Before / after callback names per operation: `onBefore<Name>` / `on<Name>`. */
const EVENTS: Readonly<Record<string, string>> = {
  crop: 'Crop',
  rotate: 'Rotate',
  flip: 'Flip',
  resize: 'Resize',
  zoom: 'Zoom',
  pan: 'Pan',
  annotation: 'AnnotationChange',
  filter: 'Filter',
  adjustment: 'Adjust',
  frame: 'Frame',
  selection: 'Select',
};

type Status = 'empty' | 'loading' | 'ready' | 'error';
export type AnnotationAction = 'add' | 'update' | 'delete' | 'clone' | 'reorder';
type FilePurpose = { kind: 'open' } | { kind: 'image'; at: Point | null };
type ViewCall = (kind: 'zoom' | 'panStart' | 'panEnd', value: unknown, source: ImageEditorInputSource) => boolean;

const stripZoom = (t: ImageEditorTransform): ImageEditorTransform => {
  if (t.zoom === undefined) return t;
  const { zoom: _zoom, ...rest } = t;
  return rest;
};
const cx = (...names: (string | false | undefined)[]): string => names.filter(Boolean).join(' ');
const freeze = Object.freeze;

/** What the lazy chunks read from the latest render. Every function is safe to call from an event handler. */
export interface Ctx {
  readonly text: ImageEditorLocaleText;
  readonly engine: ImageEditorEngine;
  readonly current: ImageEditorEditState;
  readonly transform: ImageEditorTransform;
  readonly adjustments: ImageEditorAdjustments;
  readonly filter: ImageEditorFilter;
  readonly frame: ImageEditorFrame;
  readonly annotations: readonly ImageEditorAnnotation[];
  readonly tool: ImageEditorTool;
  readonly selected: string | null;
  readonly editing: string | null;
  readonly natural: Size | null;
  readonly zoom: number;
  readonly imageSmoothing: boolean;
  readonly cropRatios: readonly ImageEditorCropRatio[];
  readonly styleDefaults: StyleDefaults;
  readonly cropTick: number;
  readonly onBeforeExport: ImageEditorProps['onBeforeExport'];
  readonly onSave: ImageEditorProps['onSave'];
  latest(): Ctx;
  edit<T>(op: ImageEditorOperation, previous: T, value: T, next: ImageEditorEditState, source: ImageEditorInputSource, opts?: { action?: AnnotationAction; key?: string; detail?: string }): boolean;
  changeAnnotations(next: readonly ImageEditorAnnotation[], action: AnnotationAction, source: ImageEditorInputSource, select?: string | null, key?: string): boolean;
  select(id: string | null, source: ImageEditorInputSource): boolean;
  setTool(tool: ImageEditorTool, source: ImageEditorInputSource): void;
  setEditing(id: string | null): void;
  setStyleDefaults(patch: Partial<StyleDefaults>): void;
  pickFile(purpose: FilePurpose): void;
  say(op: ImageEditorOperation, detail?: string): void;
  canvas(): HTMLCanvasElement | null;
}

/**
 * ImageEditor: crop, rotate, straighten, flip, resize, zoom and pan, finetune
 * and filter presets, frames, shape / text / freehand / image annotations,
 * redaction, undo and redo, and export through `actionsRef`.
 * `.salmon-image-editor` with `data-status` and `data-tool`; `ref` is the
 * canvas (`role="img"`).
 */
export function ImageEditor(props: ImageEditorProps): ReactElement {
  const {
    src,
    crossOrigin,
    onLoad,
    onLoadError,
    accept = 'image/*',
    transform: transformProp,
    defaultTransform,
    onTransformChange,
    adjustments: adjustmentsProp,
    defaultAdjustments,
    onAdjustmentsChange,
    filter: filterProp,
    defaultFilter,
    onFilterChange,
    frame: frameProp,
    defaultFrame,
    onFrameChange,
    annotations: annotationsProp,
    defaultAnnotations,
    onAnnotationsChange,
    tool: toolProp,
    defaultTool,
    onToolChange,
    cropRatios = IMAGE_EDITOR_DEFAULT_CROP_RATIOS,
    minZoom = 1,
    maxZoom = 10,
    undoLimit = 50,
    imageSmoothing = true,
    annotationDefaults,
    toolbar = IMAGE_EDITOR_DEFAULT_TOOLBAR,
    renderToolbar,
    onToolbarItemClick,
    quickAccessToolbar = IMAGE_EDITOR_DEFAULT_QUICK_TOOLBAR,
    onHistoryChange,
    onEditComplete,
    onBeforeExport,
    onSave,
    localeText: ownText,
    classNames,
    styles,
    actionsRef,
    ref,
    className,
    onKeyDown,
    ...others
  } = props;
  // The before / after callbacks stay off the root element.
  const rest: Record<string, unknown> = { ...others };
  for (const name of Object.values(EVENTS)) delete rest[`onBefore${name}`], delete rest[`on${name}`];
  const localeText = useLocaleText('imageEditor', ownText);
  const text = localeText ? { ...IMAGE_EDITOR_DEFAULT_LOCALE_TEXT, ...localeText } : IMAGE_EDITOR_DEFAULT_LOCALE_TEXT;
  type Ev = [ImageEditorChangeEvent];
  const [transform, setTransform] = useControllableState<ImageEditorTransform, Ev>(transformProp, defaultTransform ?? EMPTY_TRANSFORM, onTransformChange, 'ImageEditor transform');
  const [adjustments, setAdjustments] = useControllableState<ImageEditorAdjustments, Ev>(adjustmentsProp, defaultAdjustments ?? EMPTY_ADJUSTMENTS, onAdjustmentsChange, 'ImageEditor adjustments');
  const [filter, setFilter] = useControllableState<ImageEditorFilter, Ev>(filterProp, defaultFilter ?? 'default', onFilterChange, 'ImageEditor filter');
  const [frame, setFrame] = useControllableState<ImageEditorFrame, Ev>(frameProp, defaultFrame ?? NO_FRAME, onFrameChange, 'ImageEditor frame');
  const [annotations, setAnnotations] = useControllableState<readonly ImageEditorAnnotation[], Ev>(annotationsProp, defaultAnnotations ?? NO_ANNOTATIONS, onAnnotationsChange, 'ImageEditor annotations');
  const [tool, setToolState] = useControllableState<ImageEditorTool, Ev>(toolProp, defaultTool ?? 'select', onToolChange, 'ImageEditor tool');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [history, setHistoryState] = useState<History<ImageEditorEditState>>(emptyHistory);
  const [opened, setOpened] = useState<ImageEditorSource | null>(null);
  const source = opened ?? src ?? null;
  const [status, setStatus] = useState<Status>(source ? 'loading' : 'empty');
  const [natural, setNatural] = useState<Size | null>(null);
  const [cropTick, setCropTick] = useState(0);
  const [styleDefaults, setStyleDefaults] = useState<StyleDefaults>(() => {
    const d = annotationDefaults ?? {};
    return { stroke: d.stroke ?? '#e5484d', fill: d.fill ?? '', strokeWidth: d.strokeWidth ?? 4, fontSize: d.fontSize ?? 32, fontFamily: d.fontFamily ?? 'sans-serif', color: d.color ?? '#e5484d', redactMode: 'blur', strength: 12 };
  });
  const [initial, setInitial] = useState<ImageEditorEditState>(() => ({ transform: stripZoom(transformProp ?? defaultTransform ?? EMPTY_TRANSFORM), adjustments: adjustmentsProp ?? defaultAdjustments ?? EMPTY_ADJUSTMENTS, filter: filterProp ?? defaultFilter ?? 'default', frame: frameProp ?? defaultFrame ?? NO_FRAME, annotations: annotationsProp ?? defaultAnnotations ?? NO_ANNOTATIONS }));
  // Two commits in one event compose: handlers read the latest history here.
  const historyRef = useRef(history);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const filePurpose = useRef<FilePurpose>({ kind: 'open' });
  const openedByUser = useRef(false);
  const panFrom = useRef<Point>({ x: 0, y: 0 });
  const ops = useRef<Ops | null>(null);
  const self = useRef<Ctx | null>(null);
  // The engine's zoom and pan proposals, and the history actions, bound to the latest render.
  const viewRef = useRef<ViewCall | null>(null);
  const historyActions = useRef<{ undo(s: ImageEditorInputSource): void; redo(s: ImageEditorInputSource): void; reset(s: ImageEditorInputSource): void; loaded(size: Size): void } | null>(null);
  const hintId = useId();
  const zoom = clamp(transform.zoom ?? 1, minZoom, maxZoom);
  const current: ImageEditorEditState = { transform: stripZoom(transform), adjustments, filter, frame, annotations };

  const [engine] = useState(
    () =>
      new ImageEditorEngine({
        annotations: (next, action, source, select) => void self.current?.changeAnnotations(next, action, source, select),
        select: (id, source) => void self.current?.select(id, source),
        zoom: (z, source) => viewRef.current?.('zoom', z, source) ?? false,
        panStart: (source) => viewRef.current?.('panStart', null, source) ?? false,
        panEnd: (pan, source) => void viewRef.current?.('panEnd', pan, source),
        editText: (id) => self.current?.setEditing(id),
        pickImage: (at) => self.current?.pickFile({ kind: 'image', at }),
        cropDraft: () => setCropTick((n) => n + 1),
        create: (kind, at, list, sized) => (self.current && ops.current ? ops.current.create(self.current, kind, at, list, sized) : null),
      }),
  );

  const say = (op: ImageEditorOperation, detail?: string): void => announce(liveRef.current, text.announce(op, detail));

  /** Before / after pair around `apply`; `false` when the before-callback cancelled. */
  const run = <T,>(op: ImageEditorOperation, previous: T, value: T, source: ImageEditorInputSource, apply: (() => void) | null, action?: AnnotationAction): boolean => {
    const name = EVENTS[op];
    const p = props as unknown as Record<string, ((e: unknown) => void) | undefined>;
    const base: ImageEditorEvent<T> = { operation: op, previous, value, source, action: action === 'clone' ? 'add' : action };
    const before = name ? p[`onBefore${name}`] : undefined;
    if (before) {
      let prevented = false;
      const event: ImageEditorBeforeEvent<T> = {
        ...base,
        get defaultPrevented() {
          return prevented;
        },
        preventDefault() {
          prevented = true;
        },
      };
      before(event);
      if (prevented) return false;
    }
    if (!apply) return true;
    apply();
    if (name) p[`on${name}`]?.(freeze(base));
    return true;
  };

  const setHistory = (next: History<ImageEditorEditState>): void => {
    historyRef.current = next;
    setHistoryState(next);
    onHistoryChange?.(freeze({ canUndo: next.past.length > 0, canRedo: next.future.length > 0, undoCount: next.past.length, redoCount: next.future.length }));
  };

  /** Proposes a new edit state: records history, calls the changed parts' callbacks, reports completion. */
  const commit = (op: ImageEditorOperation, next: ImageEditorEditState, source: ImageEditorInputSource, reason: ImageEditorChangeEvent['reason'], key?: string, record = true, detail?: string, complete = true): void => {
    const ev = freeze<ImageEditorChangeEvent>({ source, reason });
    if (record) setHistory(pushHistory(historyRef.current, current, undoLimit, key, key ? Date.now() : 0));
    if (next.transform !== current.transform) setTransform((prev) => (prev.zoom === undefined ? next.transform : { ...next.transform, zoom: prev.zoom }), ev);
    if (next.adjustments !== current.adjustments) setAdjustments(next.adjustments, ev);
    if (next.filter !== current.filter) setFilter(next.filter, ev);
    if (next.frame !== current.frame) setFrame(next.frame, ev);
    if (next.annotations !== current.annotations) setAnnotations(next.annotations, ev);
    if (complete) done(op, source, next, detail);
  };
  const done = (op: ImageEditorOperation, source: ImageEditorInputSource, state: ImageEditorEditState, detail?: string): void => {
    onEditComplete?.(freeze({ operation: op, source, state }));
    say(op, detail);
  };

  // onEditComplete follows the after-callback.
  const edit: Ctx['edit'] = (op, previous, value, next, source, opts = {}) => run(op, previous, value, source, () => commit(op, next, source, op === 'annotation' ? (opts.action ?? 'update') : op, opts.key, true, opts.detail, false), opts.action) && (done(op, source, next, opts.detail), true);

  const setTool = (next: ImageEditorTool, source: ImageEditorInputSource): void => {
    if (next === tool) return;
    if (tool === 'path') engine.ui?.finishPath(source);
    setToolState(next, freeze({ source, reason: 'selection' }));
    engine.preview = null;
  };

  const select = (id: string | null, source: ImageEditorInputSource): boolean =>
    id === selected ||
    run('selection', selected, id, source, () => {
      setSelected(id);
      if (editing && editing !== id) setEditing(null);
    });

  const changeAnnotations: Ctx['changeAnnotations'] = (next, action, source, selectId, key) => {
    if (next === annotations) return false;
    const ok = edit('annotation', annotations, next, { ...current, annotations: next }, source, { action, detail: action, ...(key ? { key } : {}) });
    if (ok && selectId !== undefined && selectId !== selected) run('selection', selected, selectId, source, () => setSelected(selectId));
    return ok;
  };

  const proposeZoom = (z: number, source: ImageEditorInputSource): boolean => {
    const next = clamp(z, minZoom, maxZoom);
    return run('zoom', zoom, next, source, () => {
      setTransform((prev) => ({ ...prev, zoom: next }), freeze({ source, reason: 'zoom' }));
      say('zoom', `${Math.round(next * 100)}%`);
    });
  };

  const pickFile = (purpose: FilePurpose): void => {
    filePurpose.current = purpose;
    const input = fileRef.current;
    if (!input) return;
    input.accept = purpose.kind === 'image' ? 'image/*' : accept;
    input.value = '';
    input.click();
  };

  const restore = (state: ImageEditorEditState, op: 'undo' | 'redo' | 'reset', source: ImageEditorInputSource, next: History<ImageEditorEditState>): void => {
    setHistory(next);
    commit(op, state, source, op, undefined, false);
    if (selected && !state.annotations.some((a) => a.id === selected)) setSelected(null);
    setEditing(null);
  };
  const undo = (source: ImageEditorInputSource): void => {
    const r = undoHistory(historyRef.current, current);
    if (r) restore(r.state, 'undo', source, r.history);
  };
  const redo = (source: ImageEditorInputSource): void => {
    const r = redoHistory(historyRef.current, current);
    if (r) restore(r.state, 'redo', source, r.history);
  };
  const reset = (source: ImageEditorInputSource): void => {
    restore(initial, 'reset', source, pushHistory(historyRef.current, current, undoLimit));
    engine.ui?.zoomAround(1);
    if (zoom !== 1) proposeZoom(1, source);
  };

  const withOps = (fn: (o: Ops, c: Ctx) => void): void => {
    if (ops.current && self.current) fn(ops.current, self.current);
    else void loadOps().then((o) => self.current && fn((ops.current = o), self.current));
  };

  const clickItem = (id: string, event: { detail: number; nativeEvent: unknown }, custom?: () => void): void => {
    const source = pressSource(event);
    let prevented = false;
    onToolbarItemClick?.({
      id,
      source,
      get defaultPrevented() {
        return prevented;
      },
      preventDefault() {
        prevented = true;
      },
    });
    if (prevented) return;
    if (custom) return custom();
    if (id === 'open') return pickFile({ kind: 'open' });
    if (id === 'undo') return undo(source);
    if (id === 'redo') return redo(source);
    if (id === 'reset') return reset(source);
    // Keyboard activation of a drawing tool inserts its annotation (ops.toolbarAction); a pointer picks the tool.
    if (TOOL_ITEMS.has(id as never) && !(source === 'keyboard' && DRAWING.has(id))) {
      const next = (id === tool ? 'select' : id) as ImageEditorTool;
      setTool(next, source);
      if (next === 'image') pickFile({ kind: 'image', at: null });
      return;
    }
    withOps((o, c) => o.toolbarAction(c, id, source));
  };

  const ctx: Ctx = {
    text,
    engine,
    current,
    transform,
    adjustments,
    filter,
    frame,
    annotations,
    tool,
    selected,
    editing,
    natural,
    zoom,
    imageSmoothing,
    cropRatios,
    styleDefaults,
    cropTick,
    onBeforeExport,
    onSave,
    latest: () => self.current ?? ctx,
    edit,
    changeAnnotations,
    select,
    setTool,
    setEditing,
    setStyleDefaults: (patch) => setStyleDefaults((d) => ({ ...d, ...patch })),
    pickFile,
    say,
    canvas: () => canvasRef.current,
  };
  const loaded = (size: Size): void => {
    onLoad?.(freeze({ width: size.width, height: size.height }));
    if (!openedByUser.current) return say('open', `${size.width} × ${size.height}`);
    // A file opened in the editor starts a fresh edit.
    openedByUser.current = false;
    setHistory(emptyHistory());
    setInitial(FRESH);
    setSelected(null);
    setEditing(null);
    commit('open', FRESH, 'pointer', 'open', undefined, false);
  };
  const view: ViewCall = (kind, value, source) => {
    if (kind === 'zoom') return proposeZoom(value as number, source);
    if (kind === 'panStart') {
      panFrom.current = { ...engine.pan };
      return run('pan', panFrom.current, panFrom.current, source, null);
    }
    props.onPan?.(freeze({ operation: 'pan', previous: panFrom.current, value: { ...(value as Point) }, source }));
    say('pan');
    return true;
  };
  useLayoutEffect(() => {
    self.current = ctx;
    viewRef.current = view;
    historyActions.current = { undo, redo, reset, loaded };
  });

  // Stable actions (renderToolbar and custom items get them during render, before any effect).
  const [actions] = useState(
    (): ImageEditorActions => {
      const call = <R,>(fn: (o: Ops, c: Ctx) => Promise<R>): Promise<R | null> => loadOps().then((o) => (self.current ? fn((ops.current = o), self.current) : null));
      return {
        toBlob: (options = {}) => call((o, c) => o.exportBlob(c, options)),
        toDataURL: (options = {}) => call((o, c) => o.exportDataURL(c, options)),
        toImageData: () => call((o, c) => o.exportImageData(c)),
        open(next) {
          openedByUser.current = true;
          setOpened(next);
        },
        undo: () => historyActions.current?.undo('api'),
        redo: () => historyActions.current?.redo('api'),
        reset: () => historyActions.current?.reset('api'),
        zoomTo(z) {
          engine.ui?.zoomAround(z);
          engine.ui?.commitZoom('api');
        },
        select: (id) => void self.current?.select(id, 'api'),
        setTool: (t) => self.current?.setTool(t, 'api'),
        getSize: () => (self.current?.natural ? outputSize(self.current.current.transform, self.current.natural) : null),
        focus: () => canvasRef.current?.focus(),
      };
    },
  );
  useImperativeHandle(actionsRef, () => actions, [actions]);

  // Engine lifecycle: attach to the canvas, load the interaction and edit chunks, then sync every commit.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    engine.attach(canvas);
    let live = true;
    void Promise.all([loadOps(), import('./interact.js')]).then(([o, i]) => {
      if (!live) return;
      ops.current = o;
      engine.ui ??= new i.EngineUI(engine);
      if (engine.state) engine.ui.sync(null, engine.state);
      // Interactive from here on (tests and styles can key on it).
      canvas.dataset['interactive'] = '';
      engine.invalidate();
    });
    return () => {
      live = false;
      engine.detach();
    };
  }, [engine]);
  useLayoutEffect(() => {
    engine.textBox = textRef.current;
    engine.sync({ ...current, zoom, tool, selected, editing, smoothing: imageSmoothing, minZoom, maxZoom });
    const fops = filterOps(adjustments, filter);
    if (fops.length) void engine.need(annotations, fops);
  });

  // Loading: a source change starts over; a file opened in the editor also resets the edit.
  useEffect(() => {
    if (!source) {
      engine.clear();
      setStatus('empty');
      setNatural(null);
      return;
    }
    let live = true;
    setStatus('loading');
    engine.load(source, crossOrigin).then(
      (size) => {
        if (!live || !size) return;
        setNatural(size);
        setStatus('ready');
        historyActions.current?.loaded(size);
      },
      (error: unknown) => {
        if (!live) return;
        setStatus('error');
        onLoadError?.(error);
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, crossOrigin, engine]);

  // The text editor takes focus when it opens.
  useEffect(() => {
    if (editing) requestAnimationFrame(() => textRef.current?.focus());
  }, [editing]);

  const setCanvasRef = (el: HTMLCanvasElement | null): void => {
    canvasRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as { current: HTMLCanvasElement | null }).current = el;
  };

  const pointerSource = (e: { pointerType: string }): ImageEditorInputSource => (e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'pointer');

  // ---- toolbar ----
  const ready = status === 'ready';
  const renderItem = (item: ImageEditorToolbarItem, i: number): ReactNode => {
    if (item === '|') return <ToolbarSeparator key={`|${i}`} />;
    if (typeof item === 'object') {
      const press = (e: { detail: number; nativeEvent: unknown }): void => clickItem(item.id, e, () => item.onClick?.(actions));
      return (
        <ToolbarItem key={item.id} label={item.label} icon={item.icon}>
          {item.icon ? (
            <Button variant="ghost" size="sm" iconOnly aria-label={item.label} title={item.label} disabled={item.disabled} data-item={item.id} onClick={press}>
              {item.icon}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" disabled={item.disabled} data-item={item.id} onClick={press}>
              {item.label}
            </Button>
          )}
        </ToolbarItem>
      );
    }
    if (item === 'save' && !onSave) return null;
    const label = text[item];
    const disabled = item === 'undo' ? !history.past.length : item === 'redo' ? !history.future.length : item !== 'open' && !ready;
    return (
      <ToolbarItem key={item} label={label} icon={itemIcon(item)}>
        <Button variant="ghost" size="sm" iconOnly aria-label={label} title={label} aria-pressed={TOOL_ITEMS.has(item) ? tool === item : undefined} disabled={disabled} data-item={item} onClick={(e) => clickItem(item, e)}>
          {itemIcon(item)}
        </Button>
      </ToolbarItem>
    );
  };
  const toolbarEl =
    toolbar === false ? null : (
      <Toolbar aria-label={text.toolbar} className={cx('salmon-image-editor-toolbar', classNames?.toolbar)} style={styles?.toolbar}>
        {toolbar.map(renderItem)}
      </Toolbar>
    );

  const selectedAnnotation = selected ? annotations.find((a) => a.id === selected) : undefined;
  const panel = ready && (PANEL_TOOLS.has(tool) || !!selectedAnnotation);
  const quick = ready && quickAccessToolbar !== false && (tool === 'crop' || (!!selectedAnnotation && !editing)) ? quickAccessToolbar || [] : [];
  const editingText = editing ? annotations.find((a) => a.id === editing) : undefined;
  const message = status === 'ready' ? null : text[status === 'error' ? 'loadError' : status];
  const commitText = (value: string, source: ImageEditorInputSource): void => withOps((o, c) => o.commitText(c, value, source));

  return (
    <div
      {...rest}
      className={cx('salmon-image-editor', className)}
      data-status={status}
      data-tool={tool}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        // Mod+Z / Mod+Shift+Z / Mod+Y anywhere in the editor except its text fields.
        const k = event.key.toLowerCase();
        if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || (k !== 'z' && k !== 'y') || (event.target as HTMLElement).matches('input, textarea, select')) return;
        event.preventDefault();
        if (k === 'y' || event.shiftKey) redo('keyboard');
        else undo('keyboard');
      }}
    >
      {renderToolbar ? renderToolbar(toolbarEl, actions) : toolbarEl}
      <div className={cx('salmon-image-editor-stage', classNames?.stage)} style={styles?.stage}>
        <canvas
          ref={setCanvasRef}
          className={cx('salmon-image-editor-canvas', classNames?.canvas)}
          style={styles?.canvas}
          role="img"
          aria-label={text.canvas}
          aria-describedby={hintId}
          tabIndex={0}
          onKeyDown={(event) => {
            if (ready && ops.current && self.current && ops.current.canvasKey(self.current, event.nativeEvent)) event.preventDefault();
          }}
          onPointerDown={(e) => !editing && engine.ui?.pointerDown(e.nativeEvent, pointerSource(e))}
          onPointerMove={(e) => {
            const ui = engine.ui;
            if (!ui) return;
            ui.pointerMove(e.nativeEvent);
            if (e.pointerType === 'mouse' && !e.buttons) e.currentTarget.style.cursor = ui.cursorAt({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
          }}
          onPointerUp={(e) => engine.ui?.pointerUp(e.nativeEvent, pointerSource(e))}
          onPointerCancel={(e) => engine.ui?.pointerUp(e.nativeEvent, pointerSource(e), true)}
          onLostPointerCapture={(e) => engine.ui?.pointerUp(e.nativeEvent, pointerSource(e), true)}
          onDoubleClick={() => (tool === 'path' ? engine.ui?.finishPath('pointer') : selectedAnnotation?.kind === 'text' && setEditing(selectedAnnotation.id))}
        />
        <span id={hintId} className="salmon-visually-hidden">
          {text.keyboardHint}
        </span>
        {message ? (
          <div className="salmon-image-editor-message" data-status={status}>
            {message}
          </div>
        ) : null}
        {editingText?.kind === 'text' ? (
          <textarea
            ref={textRef}
            className="salmon-image-editor-text-input"
            aria-label={text.textEditor}
            defaultValue={editingText.text}
            rows={Math.max(1, editingText.text.split('\n').length)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape' && (e.key !== 'Enter' || e.shiftKey)) return;
              e.preventDefault();
              e.stopPropagation();
              commitText(e.key === 'Escape' ? editingText.text : e.currentTarget.value, 'keyboard');
            }}
            onBlur={(e) => commitText(e.currentTarget.value, 'pointer')}
          />
        ) : null}
        {panel || quick.length ? (
          <Suspense fallback={null}>
            <Panels c={ctx} panel={panel} quick={quick} selectedAnnotation={selectedAnnotation} classNames={classNames} styles={styles} />
          </Suspense>
        ) : null}
      </div>
      <div ref={liveRef} className="salmon-visually-hidden" {...liveRegionProps('polite')} />
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (!f) return;
          const purpose = filePurpose.current;
          if (purpose.kind === 'open') {
            openedByUser.current = true;
            setOpened(f);
          } else withOps((o, c) => o.addImage(c, f, purpose.at));
        }}
      />
    </div>
  );
}
