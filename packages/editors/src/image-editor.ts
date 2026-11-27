'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/editors/image-editor`: ImageEditor:
// Canvas 2D crop, rotate, straighten, flip, resize, zoom and pan, finetune,
// filter presets, frames, annotations, redaction, history and export, with
// zero dependencies. Styles: `@salmonui/editors/image-editor/styles.css`
// (self-contained: it carries the Button, Menu and Toolbar rules it composes).
export { ImageEditor, IMAGE_EDITOR_DEFAULT_CROP_RATIOS } from './image-editor/ImageEditor.js';
export { IMAGE_EDITOR_DEFAULT_LOCALE_TEXT, IMAGE_EDITOR_DEFAULT_QUICK_TOOLBAR, IMAGE_EDITOR_DEFAULT_TOOLBAR } from './image-editor/items.js';
export { FILTER_PRESETS as IMAGE_EDITOR_FILTER_PRESETS, IMAGE_EDITOR_FILTERS } from './image-editor/adjust.js';
export type {
  ImageEditorActions,
  ImageEditorAdjustments,
  ImageEditorAnnotation,
  ImageEditorAnnotationKind,
  ImageEditorBeforeEvent,
  ImageEditorBeforeExportEvent,
  ImageEditorBoxAnnotation,
  ImageEditorChangeEvent,
  ImageEditorCrop,
  ImageEditorCropRatio,
  ImageEditorCropShape,
  ImageEditorCustomItem,
  ImageEditorEditCompleteEvent,
  ImageEditorEditState,
  ImageEditorEvent,
  ImageEditorExportOptions,
  ImageEditorFilter,
  ImageEditorFlip,
  ImageEditorFrame,
  ImageEditorFrameType,
  ImageEditorHistoryState,
  ImageEditorImageAnnotation,
  ImageEditorInputSource,
  ImageEditorLocaleText,
  ImageEditorOperation,
  ImageEditorPart,
  ImageEditorPointsAnnotation,
  ImageEditorProps,
  ImageEditorQuickItemId,
  ImageEditorRedactAnnotation,
  ImageEditorShapeStyle,
  ImageEditorSource,
  ImageEditorTextAnnotation,
  ImageEditorTool,
  ImageEditorToolbarItem,
  ImageEditorToolbarItemClickEvent,
  ImageEditorToolbarItemId,
  ImageEditorTransform,
} from './image-editor/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/editors/image-editor', 'salmon-image-editor');
