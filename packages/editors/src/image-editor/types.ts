// Public types of `ImageEditor`. Every coordinate of `transform.crop` and of
// `annotations` is in the oriented image space: source pixels after the
// 90-degree rotation and the flips, before the crop (its size is the source
// size, with width and height swapped for 90 and 270 degrees).

import type { CSSProperties, HTMLAttributes, ReactNode, Ref, RefObject } from 'react';

/** What `src` accepts. A string is a URL or a data URL. */
export type ImageEditorSource = string | Blob | ImageBitmap | ImageData | HTMLImageElement | HTMLCanvasElement;

export type ImageEditorCropShape = 'rect' | 'circle';

/** A crop in oriented-image pixels. */
export interface ImageEditorCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** `'circle'` keeps the inscribed ellipse; the corners export transparent. Default `'rect'`. */
  readonly shape?: ImageEditorCropShape | undefined;
}

export interface ImageEditorFlip {
  readonly horizontal?: boolean | undefined;
  readonly vertical?: boolean | undefined;
}

/** Geometry of the edit. Every field is optional; omitted means neutral. */
export interface ImageEditorTransform {
  /** `null` or omitted: the whole oriented image. */
  readonly crop?: ImageEditorCrop | null | undefined;
  /** Clockwise degrees in 90-degree steps (normalized to 0, 90, 180, 270). */
  readonly rotation?: number | undefined;
  /** Straighten angle in degrees, -45 to 45; the image scales up so no empty corner shows. */
  readonly straighten?: number | undefined;
  readonly flip?: ImageEditorFlip | undefined;
  /** Output size in pixels; `null` or omitted keeps the crop size. */
  readonly resize?: { readonly width: number; readonly height: number } | null | undefined;
  /** Committed view zoom; 1 fits the image into the canvas. Not an edit (no history entry). */
  readonly zoom?: number | undefined;
}

/** Finetune values; 0 is neutral except `opacity` (100). */
export interface ImageEditorAdjustments {
  /** -100 to 100. */
  readonly brightness?: number | undefined;
  /** -100 to 100. */
  readonly contrast?: number | undefined;
  /** Hue rotation in degrees, -180 to 180. */
  readonly hue?: number | undefined;
  /** -100 to 100. */
  readonly saturation?: number | undefined;
  /** -100 to 100 (an exponential brightness: +100 doubles, -100 halves). */
  readonly exposure?: number | undefined;
  /** 0 to 100. Default 100. */
  readonly opacity?: number | undefined;
  /** Blur radius in source pixels, 0 to 20. */
  readonly blur?: number | undefined;
}

/** Filter presets. */
export type ImageEditorFilter = 'default' | 'chrome' | 'cold' | 'warm' | 'grayscale' | 'sepia' | 'invert';

export type ImageEditorFrameType = 'none' | 'mat' | 'bevel' | 'line' | 'inset' | 'hook';

/** A frame drawn over the output edges. */
export interface ImageEditorFrame {
  readonly type: ImageEditorFrameType;
  /** Default `'#ffffff'`. */
  readonly color?: string | undefined;
  /** A second color: the frame fills with a linear gradient from `color` to it. */
  readonly gradientColor?: string | undefined;
  /** Band or line width in output pixels. Default 5 % of the shorter side. */
  readonly size?: number | undefined;
  /** Distance of the `line`, `inset` and `hook` strokes from the edge. Default `size`. */
  readonly inset?: number | undefined;
  /** Corner radius of the opening (`mat`, `bevel`, `inset`) or of the line. Default 0. */
  readonly radius?: number | undefined;
}

export type ImageEditorAnnotationKind = 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'path' | 'text' | 'freehand' | 'image' | 'redact';

interface AnnotationCommon {
  /** Stable id; selection, history and callbacks use it. */
  readonly id: string;
  /** Clockwise degrees around the annotation's center. Default 0. */
  readonly rotation?: number | undefined;
  /** 0 to 1. Default 1. */
  readonly opacity?: number | undefined;
}

/** Stroke and fill of the shape kinds. */
export interface ImageEditorShapeStyle {
  /** CSS color; `'transparent'` or omitted draws no stroke for filled shapes. Default `'#e5484d'`. */
  readonly stroke?: string | undefined;
  /** CSS color; omitted draws no fill. */
  readonly fill?: string | undefined;
  /** Default 4. */
  readonly strokeWidth?: number | undefined;
}

export interface ImageEditorBoxAnnotation extends AnnotationCommon, ImageEditorShapeStyle {
  readonly kind: 'rectangle' | 'ellipse';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Corner radius of a rectangle. */
  readonly radius?: number | undefined;
}

/** `line` and `arrow` use two points; `path` and `freehand` any number. Points are `[x0, y0, x1, y1, ...]`. */
export interface ImageEditorPointsAnnotation extends AnnotationCommon, ImageEditorShapeStyle {
  readonly kind: 'line' | 'arrow' | 'path' | 'freehand';
  readonly points: readonly number[];
  /** `path` only: joins the last point to the first (and fills with `fill`). */
  readonly closed?: boolean | undefined;
}

/** Text annotation. `x`, `y` are the top-left corner of the first line. */
export interface ImageEditorTextAnnotation extends AnnotationCommon {
  readonly kind: 'text';
  readonly x: number;
  readonly y: number;
  readonly text: string;
  /** Default `'sans-serif'`. */
  readonly fontFamily?: string | undefined;
  /** In oriented-image pixels. Default 32. */
  readonly fontSize?: number | undefined;
  /** Default `'#e5484d'`. */
  readonly color?: string | undefined;
  readonly bold?: boolean | undefined;
  readonly italic?: boolean | undefined;
}

/** Image annotation. */
export interface ImageEditorImageAnnotation extends AnnotationCommon {
  readonly kind: 'image';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** URL or data URL. */
  readonly src: string;
}

/** Redaction: burned into the pixels below it on render and export. */
export interface ImageEditorRedactAnnotation extends AnnotationCommon {
  readonly kind: 'redact';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Default `'blur'`. */
  readonly mode?: 'blur' | 'pixelate' | undefined;
  /** Blur radius or pixel block size in oriented-image pixels. Default 12. */
  readonly strength?: number | undefined;
}

/** Array order is z-order: the last annotation is drawn on top. */
export type ImageEditorAnnotation = ImageEditorBoxAnnotation | ImageEditorPointsAnnotation | ImageEditorTextAnnotation | ImageEditorImageAnnotation | ImageEditorRedactAnnotation;

/** Tools of the editor; `select` moves and resizes annotations, `pan` drags the zoomed view. */
export type ImageEditorTool = 'select' | 'pan' | 'crop' | 'straighten' | 'resize' | 'adjust' | 'filter' | 'frame' | ImageEditorAnnotationKind;

/** Crop ratio presets. A number is width / height. */
export type ImageEditorCropRatio = 'free' | 'square' | 'circle' | '3:2' | '4:3' | '16:9' | { readonly label: string; readonly ratio: number };

/** Built-in toolbar items. */
export type ImageEditorToolbarItemId =
  | 'open'
  | 'undo'
  | 'redo'
  | 'reset'
  | 'zoomIn'
  | 'zoomOut'
  | 'pan'
  | 'select'
  | 'crop'
  | 'rotateLeft'
  | 'rotateRight'
  | 'flipHorizontal'
  | 'flipVertical'
  | 'straighten'
  | 'resize'
  | 'adjust'
  | 'filter'
  | 'frame'
  | ImageEditorAnnotationKind
  | 'save';

export interface ImageEditorCustomItem {
  readonly id: string;
  /** Accessible name and tooltip. */
  readonly label: string;
  /** Decorative icon; without one the label is shown. */
  readonly icon?: ReactNode;
  readonly disabled?: boolean | undefined;
  readonly onClick?: ((actions: ImageEditorActions) => void) | undefined;
}

/** A toolbar entry: a built-in id, `'|'` for a separator, or a custom item. */
export type ImageEditorToolbarItem = ImageEditorToolbarItemId | '|' | ImageEditorCustomItem;

/** Quick-access items for a selected annotation or the crop. */
export type ImageEditorQuickItemId = 'edit' | 'clone' | 'delete' | 'bringForward' | 'sendBackward' | 'bringToFront' | 'sendToBack' | 'applyCrop' | 'cancelCrop';

/** Input that caused a change. */
export type ImageEditorInputSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** Operations reported by the before / after callbacks and `onEditComplete`. */
export type ImageEditorOperation = 'crop' | 'rotate' | 'flip' | 'resize' | 'zoom' | 'pan' | 'annotation' | 'filter' | 'adjustment' | 'frame' | 'selection' | 'undo' | 'redo' | 'reset' | 'open';

/** Second argument of the change callbacks (frozen). */
export interface ImageEditorChangeEvent {
  readonly source: ImageEditorInputSource;
  readonly reason: ImageEditorOperation | 'add' | 'update' | 'delete' | 'clone' | 'reorder';
}

/** After-callback payload: the value before and after the operation. */
export interface ImageEditorEvent<T> {
  readonly operation: ImageEditorOperation;
  readonly previous: T;
  readonly value: T;
  readonly source: ImageEditorInputSource;
  /** Annotation operations: what happened. */
  readonly action?: 'add' | 'update' | 'delete' | 'clone' | 'reorder' | undefined;
}

/** Before-callback payload; `preventDefault()` cancels the operation. */
export interface ImageEditorBeforeEvent<T> extends ImageEditorEvent<T> {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** The undoable edit: everything history records. */
export interface ImageEditorEditState {
  readonly transform: ImageEditorTransform;
  readonly adjustments: ImageEditorAdjustments;
  readonly filter: ImageEditorFilter;
  readonly frame: ImageEditorFrame;
  readonly annotations: readonly ImageEditorAnnotation[];
}

export interface ImageEditorHistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoCount: number;
  readonly redoCount: number;
}

export interface ImageEditorEditCompleteEvent {
  readonly operation: ImageEditorOperation;
  readonly source: ImageEditorInputSource;
  readonly state: ImageEditorEditState;
}

export interface ImageEditorToolbarItemClickEvent {
  readonly id: string;
  readonly source: ImageEditorInputSource;
  readonly defaultPrevented: boolean;
  /** Skips the item's built-in action. */
  preventDefault(): void;
}

export interface ImageEditorExportOptions {
  /** Default `'image/png'`. */
  readonly type?: string | undefined;
  /** 0 to 1 for lossy types. */
  readonly quality?: number | undefined;
}

export interface ImageEditorBeforeExportEvent {
  readonly type: string;
  readonly quality: number | undefined;
  readonly width: number;
  readonly height: number;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** `actionsRef`: imperative operations. */
export interface ImageEditorActions {
  /** The edited image at output size; `null` when nothing is loaded or `onBeforeExport` cancelled. */
  toBlob(options?: ImageEditorExportOptions): Promise<Blob | null>;
  toDataURL(options?: ImageEditorExportOptions): Promise<string | null>;
  toImageData(): Promise<ImageData | null>;
  /** Opens another image; the edit starts over. */
  open(source: ImageEditorSource): void;
  undo(): void;
  redo(): void;
  reset(): void;
  /** Proposes a committed zoom (clamped to `minZoom` / `maxZoom`). */
  zoomTo(zoom: number): void;
  /** Selects an annotation by id (`null` clears). */
  select(id: string | null): void;
  setTool(tool: ImageEditorTool): void;
  /** Output size of the current edit, or `null` before load. */
  getSize(): { width: number; height: number } | null;
  /** Focuses the canvas. */
  focus(): void;
}

/** User-visible strings. */
export interface ImageEditorLocaleText {
  readonly toolbar: string;
  readonly canvas: string;
  readonly empty: string;
  readonly loading: string;
  readonly loadError: string;
  readonly keyboardHint: string;
  readonly quickToolbar: string;
  readonly open: string;
  readonly undo: string;
  readonly redo: string;
  readonly reset: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly pan: string;
  readonly select: string;
  readonly crop: string;
  readonly rotateLeft: string;
  readonly rotateRight: string;
  readonly flipHorizontal: string;
  readonly flipVertical: string;
  readonly straighten: string;
  readonly resize: string;
  readonly adjust: string;
  readonly filter: string;
  readonly frame: string;
  readonly rectangle: string;
  readonly ellipse: string;
  readonly line: string;
  readonly arrow: string;
  readonly path: string;
  readonly text: string;
  readonly freehand: string;
  readonly image: string;
  readonly redact: string;
  readonly save: string;
  readonly edit: string;
  readonly clone: string;
  readonly delete: string;
  readonly bringForward: string;
  readonly sendBackward: string;
  readonly bringToFront: string;
  readonly sendToBack: string;
  readonly applyCrop: string;
  readonly cancelCrop: string;
  readonly apply: string;
  readonly width: string;
  readonly height: string;
  readonly keepAspectRatio: string;
  readonly brightness: string;
  readonly contrast: string;
  readonly hue: string;
  readonly saturation: string;
  readonly exposure: string;
  readonly opacity: string;
  readonly blur: string;
  readonly ratioFree: string;
  readonly ratioSquare: string;
  readonly ratioCircle: string;
  readonly filterDefault: string;
  readonly filterChrome: string;
  readonly filterCold: string;
  readonly filterWarm: string;
  readonly filterGrayscale: string;
  readonly filterSepia: string;
  readonly filterInvert: string;
  readonly frameNone: string;
  readonly frameMat: string;
  readonly frameBevel: string;
  readonly frameLine: string;
  readonly frameInset: string;
  readonly frameHook: string;
  readonly frameColor: string;
  readonly frameSize: string;
  readonly strokeColor: string;
  readonly fillColor: string;
  readonly strokeWidth: string;
  readonly fontSize: string;
  readonly redactBlur: string;
  readonly redactPixelate: string;
  readonly strength: string;
  readonly textEditor: string;
  /** Live-region text for a committed operation. */
  readonly announce: (operation: ImageEditorOperation, detail?: string) => string;
}

export type ImageEditorPart = 'toolbar' | 'panel' | 'stage' | 'canvas' | 'quickToolbar';

export interface ImageEditorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onLoad' | 'onSelect' | 'defaultValue' | 'onChange' | 'children'> {
  /** The image. */
  readonly src?: ImageEditorSource | null | undefined;
  /** `crossOrigin` of a URL source. Default `'anonymous'` (export needs an untainted canvas). */
  readonly crossOrigin?: '' | 'anonymous' | 'use-credentials' | null | undefined;
  readonly onLoad?: ((info: { readonly width: number; readonly height: number }) => void) | undefined;
  readonly onLoadError?: ((error: unknown) => void) | undefined;
  /** `accept` of the `'open'` item's file input. Default `'image/*'`. */
  readonly accept?: string | undefined;

  readonly transform?: ImageEditorTransform | undefined;
  readonly defaultTransform?: ImageEditorTransform | undefined;
  readonly onTransformChange?: ((transform: ImageEditorTransform, event: ImageEditorChangeEvent) => void) | undefined;
  readonly adjustments?: ImageEditorAdjustments | undefined;
  readonly defaultAdjustments?: ImageEditorAdjustments | undefined;
  readonly onAdjustmentsChange?: ((adjustments: ImageEditorAdjustments, event: ImageEditorChangeEvent) => void) | undefined;
  readonly filter?: ImageEditorFilter | undefined;
  readonly defaultFilter?: ImageEditorFilter | undefined;
  readonly onFilterChange?: ((filter: ImageEditorFilter, event: ImageEditorChangeEvent) => void) | undefined;
  readonly frame?: ImageEditorFrame | undefined;
  readonly defaultFrame?: ImageEditorFrame | undefined;
  readonly onFrameChange?: ((frame: ImageEditorFrame, event: ImageEditorChangeEvent) => void) | undefined;
  readonly annotations?: readonly ImageEditorAnnotation[] | undefined;
  readonly defaultAnnotations?: readonly ImageEditorAnnotation[] | undefined;
  readonly onAnnotationsChange?: ((annotations: readonly ImageEditorAnnotation[], event: ImageEditorChangeEvent) => void) | undefined;
  readonly tool?: ImageEditorTool | undefined;
  readonly defaultTool?: ImageEditorTool | undefined;
  readonly onToolChange?: ((tool: ImageEditorTool, event: ImageEditorChangeEvent) => void) | undefined;

  /** Crop presets in the crop panel. Default `['free', 'square', 'circle', '3:2', '4:3', '16:9']`. */
  readonly cropRatios?: readonly ImageEditorCropRatio[] | undefined;
  /** Default 1. */
  readonly minZoom?: number | undefined;
  /** Default 10. */
  readonly maxZoom?: number | undefined;
  /** Maximum undo steps. Default 50. */
  readonly undoLimit?: number | undefined;
  /** Maps to `ctx.imageSmoothingEnabled` on the view and the export. Default `true`. */
  readonly imageSmoothing?: boolean | undefined;
  /** Style of new annotations (stroke, fill, width, font). */
  readonly annotationDefaults?: Partial<ImageEditorShapeStyle & { fontFamily: string; fontSize: number; color: string }> | undefined;

  /** Toolbar items. Default `IMAGE_EDITOR_DEFAULT_TOOLBAR`; `false` hides the toolbar. */
  readonly toolbar?: readonly ImageEditorToolbarItem[] | false | undefined;
  /** Replaces the toolbar: receives the default toolbar element and the actions. */
  readonly renderToolbar?: ((toolbar: ReactNode, actions: ImageEditorActions) => ReactNode) | undefined;
  readonly onToolbarItemClick?: ((event: ImageEditorToolbarItemClickEvent) => void) | undefined;
  /** Quick-access items; `false` hides the quick-access toolbar. */
  readonly quickAccessToolbar?: readonly ImageEditorQuickItemId[] | false | undefined;

  readonly onHistoryChange?: ((history: ImageEditorHistoryState) => void) | undefined;
  readonly onEditComplete?: ((event: ImageEditorEditCompleteEvent) => void) | undefined;
  readonly onBeforeExport?: ((event: ImageEditorBeforeExportEvent) => void) | undefined;
  /** The `'save'` toolbar item exports a PNG and passes it here (the download is the application's). */
  readonly onSave?: ((blob: Blob) => void) | undefined;

  readonly onBeforeCrop?: ((event: ImageEditorBeforeEvent<ImageEditorCrop | null>) => void) | undefined;
  readonly onCrop?: ((event: ImageEditorEvent<ImageEditorCrop | null>) => void) | undefined;
  readonly onBeforeRotate?: ((event: ImageEditorBeforeEvent<{ readonly rotation: number; readonly straighten: number }>) => void) | undefined;
  readonly onRotate?: ((event: ImageEditorEvent<{ readonly rotation: number; readonly straighten: number }>) => void) | undefined;
  readonly onBeforeFlip?: ((event: ImageEditorBeforeEvent<ImageEditorFlip>) => void) | undefined;
  readonly onFlip?: ((event: ImageEditorEvent<ImageEditorFlip>) => void) | undefined;
  readonly onBeforeResize?: ((event: ImageEditorBeforeEvent<{ readonly width: number; readonly height: number } | null>) => void) | undefined;
  readonly onResize?: ((event: ImageEditorEvent<{ readonly width: number; readonly height: number } | null>) => void) | undefined;
  readonly onBeforeZoom?: ((event: ImageEditorBeforeEvent<number>) => void) | undefined;
  readonly onZoom?: ((event: ImageEditorEvent<number>) => void) | undefined;
  readonly onBeforePan?: ((event: ImageEditorBeforeEvent<{ readonly x: number; readonly y: number }>) => void) | undefined;
  readonly onPan?: ((event: ImageEditorEvent<{ readonly x: number; readonly y: number }>) => void) | undefined;
  readonly onBeforeAnnotationChange?: ((event: ImageEditorBeforeEvent<readonly ImageEditorAnnotation[]>) => void) | undefined;
  readonly onAnnotationChange?: ((event: ImageEditorEvent<readonly ImageEditorAnnotation[]>) => void) | undefined;
  readonly onBeforeFilter?: ((event: ImageEditorBeforeEvent<ImageEditorFilter>) => void) | undefined;
  readonly onFilter?: ((event: ImageEditorEvent<ImageEditorFilter>) => void) | undefined;
  readonly onBeforeAdjust?: ((event: ImageEditorBeforeEvent<ImageEditorAdjustments>) => void) | undefined;
  readonly onAdjust?: ((event: ImageEditorEvent<ImageEditorAdjustments>) => void) | undefined;
  readonly onBeforeFrame?: ((event: ImageEditorBeforeEvent<ImageEditorFrame>) => void) | undefined;
  readonly onFrame?: ((event: ImageEditorEvent<ImageEditorFrame>) => void) | undefined;
  readonly onBeforeSelect?: ((event: ImageEditorBeforeEvent<string | null>) => void) | undefined;
  readonly onSelect?: ((event: ImageEditorEvent<string | null>) => void) | undefined;

  readonly localeText?: Partial<ImageEditorLocaleText> | undefined;
  readonly classNames?: Partial<Record<ImageEditorPart, string>> | undefined;
  readonly styles?: Partial<Record<ImageEditorPart, CSSProperties>> | undefined;
  /** Imperative operations (export, history, zoom). */
  readonly actionsRef?: RefObject<ImageEditorActions | null> | undefined;
  /** The canvas (the primary focusable element). */
  readonly ref?: Ref<HTMLCanvasElement> | undefined;
}
