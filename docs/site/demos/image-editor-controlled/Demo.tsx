'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { NumberField } from '@salmonui/inputs/number-field';
import { Select } from '@salmonui/dropdowns/select';
import { Slider } from '@salmonui/inputs/slider';
import {
  ImageEditor,
  type ImageEditorActions,
  type ImageEditorAnnotation,
  type ImageEditorFrame,
  type ImageEditorFrameType,
  type ImageEditorToolbarItem,
  type ImageEditorTransform,
} from '@salmonui/editors/image-editor';
import { EventLog, useEventLog } from '../../components/demo-kit';

/** A small generated photo (no network image) with pixel-art detail, so image smoothing is visible when zoomed. */
function makePhoto(): string {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 200;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#9fd3f5';
  ctx.fillRect(0, 0, 320, 200);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#3f8f4f' : '#5fb06c';
    ctx.fillRect(x * 20, 120 + y * 10, 20, 10);
  }
  ctx.fillStyle = '#f2b134';
  ctx.fillRect(240, 24, 40, 40);
  return c.toDataURL('image/png');
}

/** A sticker for the image annotation. */
function makeSticker(): string {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e5484d';
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEW', 32, 40);
  return c.toDataURL('image/png');
}

const FRAMES: readonly ImageEditorFrameType[] = ['none', 'mat', 'bevel', 'line', 'inset', 'hook'];

const AR_TEXT = { toolbar: 'أدوات الصورة', undo: 'تراجع', redo: 'إعادة', zoomIn: 'تكبير', zoomOut: 'تصغير', resize: 'تغيير الحجم', frame: 'إطار', freehand: 'رسم حر', select: 'تحديد', pan: 'تحريك' };

export default function ImageEditorControlledDemo() {
  const [log, push] = useEventLog();
  const [src, setSrc] = useState<string | null>(null);
  const [sticker, setSticker] = useState<string | null>(null);
  const [transform, setTransform] = useState<ImageEditorTransform>({ zoom: 1 });
  const [frame, setFrame] = useState<ImageEditorFrame>({ type: 'mat', color: '#ffffff', size: 16 });
  const [annotations, setAnnotations] = useState<readonly ImageEditorAnnotation[]>([]);
  const [smoothing, setSmoothing] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [width, setWidth] = useState(320);
  const actions = useRef<ImageEditorActions | null>(null);
  // Canvas images are generated in an effect: the server and the first client render match.
  useEffect(() => {
    setSrc(makePhoto());
    setSticker(makeSticker());
  }, []);

  const toolbar: readonly ImageEditorToolbarItem[] = [
    'select',
    'pan',
    'zoomIn',
    'zoomOut',
    '|',
    'crop',
    'rotateLeft',
    'rotateRight',
    'resize',
    'frame',
    '|',
    'rectangle',
    'text',
    'freehand',
    'image',
    '|',
    'undo',
    'redo',
    {
      id: 'sticker',
      label: 'Add sticker',
      icon: <span aria-hidden="true">★</span>,
      disabled: !sticker,
      onClick: () => {
        if (!sticker) return;
        const id = `sticker-${annotations.length + 1}`;
        setAnnotations((list) => [...list, { id, kind: 'image', x: 24 + list.length * 16, y: 24, width: 64, height: 64, src: sticker, opacity: 0.95 }]);
        actions.current?.select(id);
      },
    },
  ];

  const height = transform.resize?.height ?? 200;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <div role="group" aria-label="Edit state" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Width
          <NumberField aria-label="Width" min={80} max={1280} step={20} value={width} onValueChange={(value) => setWidth(value ?? 320)} style={{ inlineSize: 120 }} />
        </label>
        <Button variant="outline" onClick={() => setTransform((t) => ({ ...t, resize: { width, height: Math.round((width * 200) / 320) } }))}>
          Resize (keep 16:10)
        </Button>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Zoom
          <Slider min={0.5} max={4} step={0.25} value={transform.zoom ?? 1} onValueChange={(value) => setTransform((t) => ({ ...t, zoom: value }))} style={{ inlineSize: 160 }} />
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Frame
          <Select aria-label="Frame" data={FRAMES} value={frame.type} onValueChange={(value) => value != null && setFrame((f) => ({ ...f, type: value as ImageEditorFrameType }))} />
        </label>
        <Checkbox checked={smoothing} onCheckedChange={(checked) => setSmoothing(checked)}>
          imageSmoothing
        </Checkbox>
        <Checkbox checked={narrow} onCheckedChange={(checked) => setNarrow(checked)}>
          Phone width (360 px)
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
      </div>
      <div dir={rtl ? 'rtl' : 'ltr'} lang={rtl ? 'ar' : 'en'} style={{ inlineSize: narrow ? 360 : '100%', maxInlineSize: '100%' }}>
        <ImageEditor
          aria-label="Photo editor"
          src={src}
          actionsRef={actions}
          transform={transform}
          onTransformChange={(next, event) => {
            setTransform(next);
            if (next.resize) setWidth(next.resize.width);
            push(`onTransformChange (${event.reason}, ${event.source})`);
          }}
          frame={frame}
          onFrameChange={(next) => setFrame(next)}
          annotations={annotations}
          onAnnotationsChange={(next, event) => {
            setAnnotations(next);
            push(`onAnnotationsChange (${event.reason}, ${event.source})`);
          }}
          annotationDefaults={{ stroke: '#e5484d', strokeWidth: 4 }}
          imageSmoothing={smoothing}
          minZoom={0.5}
          maxZoom={4}
          toolbar={toolbar}
          quickAccessToolbar={['clone', 'delete', 'bringToFront', 'sendToBack', 'applyCrop', 'cancelCrop']}
          onToolbarItemClick={(event) => push(`onToolbarItemClick: ${event.id} (${event.source})`)}
          onBeforeResize={(event) => {
            if (event.value && event.value.width > 1280) {
              event.preventDefault();
              push('onBeforeResize: wider than 1280 px, cancelled');
            }
          }}
          onResize={(event) => push(`onResize: ${event.value ? `${event.value.width} × ${event.value.height}` : 'original size'}`)}
          onZoom={(event) => push(`onZoom: ${Math.round(event.previous * 100)}% -> ${Math.round(event.value * 100)}% (${event.source})`)}
          onPan={(event) => push(`onPan: ${Math.round(event.value.x)}, ${Math.round(event.value.y)} (${event.source})`)}
          onFrame={(event) => push(`onFrame: ${event.previous.type} -> ${event.value.type}`)}
          onSelect={(event) => push(`onSelect: ${event.value ?? 'none'} (${event.source})`)}
          onEditComplete={(event) => push(`onEditComplete: ${event.operation}`)}
          onHistoryChange={(history) => push(`onHistoryChange: ${history.undoCount} undo / ${history.redoCount} redo`)}
          localeText={rtl ? AR_TEXT : undefined}
          style={{ blockSize: 420 }}
          styles={{ stage: { background: 'repeating-conic-gradient(#0000000d 0 25%, transparent 0 50%) 0 0 / 16px 16px' } }}
        />
      </div>
      <p style={{ margin: 0 }} aria-live="polite">
        Output {transform.resize ? `${transform.resize.width} × ${height}` : '320 × 200 (original)'}, zoom {Math.round((transform.zoom ?? 1) * 100)}%, frame {frame.type}, {annotations.length} annotations.
      </p>
      <EventLog entries={log} />
    </div>
  );
}
