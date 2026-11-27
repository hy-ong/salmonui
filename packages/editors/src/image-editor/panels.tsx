'use client';

// Lazy chunk of ImageEditor: the tool panels (crop presets, straighten,
// resize, finetune, filters, frames, annotation style) and the quick-access
// toolbar. Sliders are uncontrolled: input
// events preview through the engine (no React state per drag step) and the
// native `change` event commits one history entry.

import { useEffect, useId, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Toolbar } from '@salmonui/navigation/toolbar';
import { FILTER_PRESETS } from './adjust.js';
import type { Ctx } from './ImageEditor.js';
import { normRotation, normStraighten, outputSize, type Size } from './geometry.js';
import { itemIcon } from './items.js';
import { applyCrop, quickAction } from './ops.js';
import { ratioValue, resizeKeepingAspect } from './transform.js';
import type { ImageEditorAdjustments, ImageEditorAnnotation, ImageEditorCropRatio, ImageEditorEditState, ImageEditorFilter, ImageEditorFrame, ImageEditorFrameType, ImageEditorInputSource, ImageEditorPart, ImageEditorQuickItemId } from './types.js';

export interface StyleDefaults {
  readonly stroke: string;
  readonly fill: string;
  readonly strokeWidth: number;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly color: string;
  readonly redactMode: 'blur' | 'pixelate';
  readonly strength: number;
}

export interface PanelsProps {
  readonly c: Ctx;
  readonly panel: boolean;
  readonly quick: readonly ImageEditorQuickItemId[];
  readonly selectedAnnotation: ImageEditorAnnotation | undefined;
  readonly classNames: Partial<Record<ImageEditorPart, string>> | undefined;
  readonly styles: Partial<Record<ImageEditorPart, CSSProperties>> | undefined;
}

interface P {
  readonly c: Ctx;
  readonly a: ImageEditorAnnotation | undefined;
}

const src = (e: { detail: number }): ImageEditorInputSource => (e.detail === 0 ? 'keyboard' : 'pointer');
const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1);

/** Attaches a native `change` listener (a range released, a color picker closed): one commit, not one per input. */
const onNativeChange =
  (commit: (el: HTMLInputElement) => void) =>
  (el: HTMLInputElement | null): (() => void) | undefined => {
    if (!el) return;
    const h = (): void => commit(el);
    el.addEventListener('change', h);
    return () => el.removeEventListener('change', h);
  };

/** Range input: `onInput` previews, the native `change` commits. */
function Range(props: { label: string; min: number; max: number; value: number; onPreview?: (v: number) => void; onCommit: (v: number) => void }): ReactElement {
  const { label, min, max, value, onPreview, onCommit } = props;
  return (
    <label className="salmon-image-editor-field">
      <span className="salmon-image-editor-field-label">{label}</span>
      <input
        key={value}
        aria-label={label}
        type="range"
        min={min}
        max={max}
        defaultValue={value}
        onInput={(e) => {
          const v = Number(e.currentTarget.value);
          const out = e.currentTarget.nextElementSibling;
          if (out) out.textContent = String(v);
          onPreview?.(v);
        }}
        ref={onNativeChange((el) => onCommit(Number(el.value)))}
      />
      <output className="salmon-image-editor-field-value">{value}</output>
    </label>
  );
}

function Color(props: { label: string; value: string; onCommit: (v: string) => void }): ReactElement {
  return (
    <label className="salmon-image-editor-field">
      <span className="salmon-image-editor-field-label">{props.label}</span>
      <input key={props.value} aria-label={props.label} type="color" defaultValue={/^#[0-9a-f]{6}$/i.test(props.value) ? props.value : '#000000'} ref={onNativeChange((el) => props.onCommit(el.value))} />
    </label>
  );
}

function Choice<T extends string>(props: { options: readonly { value: T; label: string }[]; value: T; onChoose: (v: T, source: ImageEditorInputSource) => void; label: string }): ReactElement {
  return (
    <div role="group" aria-label={props.label} className="salmon-image-editor-choices">
      {props.options.map((o) => (
        <Button key={o.value} size="sm" variant={o.value === props.value ? 'solid' : 'outline'} aria-pressed={o.value === props.value} data-value={o.value} onClick={(e) => props.onChoose(o.value, src(e))}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

const ratioKey = (r: ImageEditorCropRatio): string => (typeof r === 'object' ? `custom:${r.label}` : r);

function CropPanel({ c }: P): ReactElement {
  const { text, cropRatios } = c;
  const [ratio, setRatio] = useState(() => (c.transform.crop?.shape === 'circle' ? 'circle' : 'free'));
  const label = (r: ImageEditorCropRatio): string => (typeof r === 'object' ? r.label : r === 'free' ? text.ratioFree : r === 'square' ? text.ratioSquare : r === 'circle' ? text.ratioCircle : r);
  return (
    <>
      <Choice
        label={text.crop}
        value={ratio}
        options={cropRatios.map((r) => ({ value: ratioKey(r), label: label(r) }))}
        onChoose={(key) => {
          const r = cropRatios.find((x) => ratioKey(x) === key)!;
          setRatio(key);
          c.engine.ui?.setCropRatio(ratioValue(r), r === 'circle' ? 'circle' : 'rect');
        }}
      />
      <Button size="sm" tone="primary" onClick={(e) => applyCrop(c.latest(), src(e))}>
        {text.apply}
      </Button>
      <Button size="sm" variant="outline" onClick={(e) => c.setTool('select', src(e))}>
        {text.cancelCrop}
      </Button>
    </>
  );
}

function ResizePanel({ c }: P): ReactElement {
  const { text, natural, transform } = c;
  const size = natural ? outputSize(transform, natural) : { width: 1, height: 1 };
  const [draft, setDraft] = useState<Size>(size);
  const [keep, setKeep] = useState(true);
  const aspect = size.width / size.height;
  const id = useId();
  useEffect(() => setDraft(size), [size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps
  const field = (key: 'width' | 'height'): ReactElement => (
    <label className="salmon-image-editor-field" htmlFor={id + key}>
      <span className="salmon-image-editor-field-label">{text[key]}</span>
      <input id={id + key} type="number" min={1} value={draft[key]} onChange={(e) => setDraft(resizeKeepingAspect(draft, { [key]: Number(e.currentTarget.value) || 1 }, keep, aspect))} />
    </label>
  );
  return (
    <>
      {field('width')}
      {field('height')}
      <label className="salmon-image-editor-field">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.currentTarget.checked)} />
        <span className="salmon-image-editor-field-label">{text.keepAspectRatio}</span>
      </label>
      <Button
        size="sm"
        tone="primary"
        onClick={(e) => {
          const l = c.latest();
          l.edit('resize', l.transform.resize ?? null, draft, { ...l.current, transform: { ...l.current.transform, resize: draft } }, src(e), { detail: `${draft.width} × ${draft.height}` });
        }}
      >
        {text.apply}
      </Button>
    </>
  );
}

const ADJUST: readonly (readonly [keyof ImageEditorAdjustments, number, number, number])[] = [
  ['brightness', -100, 100, 0],
  ['contrast', -100, 100, 0],
  ['hue', -180, 180, 0],
  ['saturation', -100, 100, 0],
  ['exposure', -100, 100, 0],
  ['opacity', 0, 100, 100],
  ['blur', 0, 20, 0],
];

/** Commits a panel value with its before / after pair. */
function commitPart<K extends 'adjustments' | 'frame' | 'filter'>(c: Ctx, part: K, next: ImageEditorEditState[K], source: ImageEditorInputSource, detail?: string): void {
  const l = c.latest();
  l.engine.preview = null;
  if (l.current[part] !== next) l.edit(part === 'adjustments' ? 'adjustment' : part, l.current[part], next, { ...l.current, [part]: next }, source, detail ? { detail } : {});
  l.engine.invalidate();
}

const preview = (c: Ctx, p: NonNullable<Ctx['engine']['preview']>): void => {
  c.engine.preview = p;
  c.engine.invalidate();
};

function AdjustPanel({ c }: P): ReactElement {
  const { text, adjustments } = c;
  return (
    <>
      {ADJUST.map(([key, min, max, neutral]) => (
        <Range
          key={key}
          label={text[key]}
          min={min}
          max={max}
          value={adjustments[key] ?? neutral}
          onPreview={(v) => preview(c, { adjustments: { ...c.latest().adjustments, [key]: v } })}
          onCommit={(v) => commitPart(c, 'adjustments', { ...c.latest().adjustments, [key]: v }, 'pointer', `${text[key]} ${v}`)}
        />
      ))}
    </>
  );
}

const FRAMES: readonly ImageEditorFrameType[] = ['none', 'mat', 'bevel', 'line', 'inset', 'hook'];

function FramePanel({ c }: P): ReactElement {
  const { text, frame, natural, transform } = c;
  const out = natural ? outputSize(transform, natural) : { width: 100, height: 100 };
  const short = Math.min(out.width, out.height);
  const tr = text as unknown as Record<string, string>;
  const set = (patch: Partial<ImageEditorFrame>, source: ImageEditorInputSource): void => {
    const f = c.latest().frame;
    commitPart(c, 'frame', { ...f, type: f.type === 'none' && !patch.type ? 'mat' : f.type, ...patch }, source, patch.type);
  };
  return (
    <>
      <Choice label={text.frame} value={frame.type} options={FRAMES.map((f) => ({ value: f, label: tr[`frame${cap(f)}`] ?? f }))} onChoose={(type, source) => set({ type }, source)} />
      <Color label={text.frameColor} value={frame.color ?? '#ffffff'} onCommit={(color) => set({ color }, 'pointer')} />
      <Range label={text.frameSize} min={1} max={Math.max(10, Math.round(short / 4))} value={frame.size ?? Math.round(short * 0.05)} onPreview={(v) => preview(c, { frame: { ...c.latest().frame, size: v } })} onCommit={(size) => set({ size }, 'pointer')} />
    </>
  );
}

/** Applies a style change to the defaults and to the selected annotation. */
function setStyle(c: Ctx, patch: Partial<StyleDefaults>, source: ImageEditorInputSource): void {
  const l = c.latest();
  l.setStyleDefaults(patch);
  const a = l.selected ? l.annotations.find((x) => x.id === l.selected) : undefined;
  if (!a || a.kind === 'image') return;
  const pick = (k: keyof StyleDefaults, as: string = k): Record<string, unknown> => (patch[k] === undefined ? {} : { [as]: patch[k] || undefined });
  const next = { ...a, ...(a.kind === 'text' ? { ...pick('color'), ...pick('fontSize') } : a.kind === 'redact' ? { ...pick('redactMode', 'mode'), ...pick('strength') } : { ...pick('stroke'), ...pick('fill'), ...pick('strokeWidth') }) } as ImageEditorAnnotation;
  l.changeAnnotations(l.annotations.map((x) => (x.id === a.id ? next : x)), 'update', source);
}

function StylePanel({ c, a }: P): ReactElement {
  const { text, styleDefaults: d, tool } = c;
  const kind = a?.kind ?? tool;
  const on = (patch: Partial<StyleDefaults>, source: ImageEditorInputSource = 'pointer'): void => setStyle(c, patch, source);
  if (kind === 'text') {
    const t = a?.kind === 'text' ? a : null;
    return (
      <>
        <Color label={text.strokeColor} value={t?.color ?? d.color} onCommit={(color) => on({ color })} />
        <Range label={text.fontSize} min={8} max={200} value={t?.fontSize ?? d.fontSize} onCommit={(fontSize) => on({ fontSize })} />
      </>
    );
  }
  if (kind === 'redact') {
    const r = a?.kind === 'redact' ? a : null;
    return (
      <>
        <Choice
          label={text.redact}
          value={r?.mode ?? d.redactMode}
          options={[
            { value: 'blur', label: text.redactBlur },
            { value: 'pixelate', label: text.redactPixelate },
          ]}
          onChoose={(redactMode, source) => on({ redactMode }, source)}
        />
        <Range label={text.strength} min={2} max={60} value={r?.strength ?? d.strength} onCommit={(strength) => on({ strength })} />
      </>
    );
  }
  const s = a && 'strokeWidth' in a ? a : null;
  return (
    <>
      <Color label={text.strokeColor} value={s?.stroke ?? d.stroke} onCommit={(stroke) => on({ stroke })} />
      {kind === 'rectangle' || kind === 'ellipse' || kind === 'path' ? <Color label={text.fillColor} value={s?.fill ?? (d.fill || '#ffffff')} onCommit={(fill) => on({ fill })} /> : null}
      <Range label={text.strokeWidth} min={1} max={40} value={s?.strokeWidth ?? d.strokeWidth} onCommit={(strokeWidth) => on({ strokeWidth })} />
    </>
  );
}

function StraightenPanel({ c }: P): ReactElement {
  return (
    <Range
      label={c.text.straighten}
      min={-45}
      max={45}
      value={normStraighten(c.transform.straighten)}
      onPreview={(v) => preview(c, { straighten: v })}
      onCommit={(v) => {
        const l = c.latest();
        const t = l.current.transform;
        const prev = { rotation: normRotation(t.rotation), straighten: normStraighten(t.straighten) };
        l.engine.preview = null;
        if (v !== prev.straighten) l.edit('rotate', prev, { ...prev, straighten: v }, { ...l.current, transform: { ...t, straighten: v } }, 'pointer', { detail: `${v}°` });
      }}
    />
  );
}

function FilterPanel({ c }: P): ReactElement {
  const tr = c.text as unknown as Record<string, string>;
  return <Choice label={c.text.filter} value={c.filter} options={(Object.keys(FILTER_PRESETS) as ImageEditorFilter[]).map((f) => ({ value: f, label: tr[`filter${cap(f)}`] ?? f }))} onChoose={(f, source) => commitPart(c, 'filter', f, source, tr[`filter${cap(f)}`])} />;
}

const BODIES: Readonly<Record<string, (p: P) => ReactElement>> = { crop: CropPanel, straighten: StraightenPanel, resize: ResizePanel, adjust: AdjustPanel, filter: FilterPanel, frame: FramePanel };

function panelBody(c: Ctx, a: ImageEditorAnnotation | undefined): { label: string; body: ReactNode } | null {
  const tr = c.text as unknown as Record<string, string>;
  const Body = BODIES[c.tool];
  if (Body) return { label: tr[c.tool]!, body: <Body c={c} a={a} /> };
  const kind = a?.kind ?? c.tool;
  if (kind === 'select' || kind === 'pan' || kind === 'image') return null;
  return { label: tr[kind] ?? kind, body: <StylePanel c={c} a={a} /> };
}

// Quick-access icons live in this chunk (16 x 16 strokes, decorative).
const QUICK_PATHS: Readonly<Record<string, string>> = {
  edit: 'M10 2l4 4-8 8H2v-4z',
  clone: 'M5 5h9v9H5zM2 11V2h9',
  delete: 'M2 4h12M6 4V2h4v2M4 4l1 10h6l1-10',
  bringForward: 'M5 5h9v9H5zM2 2h9v2M2 2v9h2',
  sendBackward: 'M2 2h9v9H2zM14 5v9H5v-2M14 5h-2',
  bringToFront: 'M8 2v9M5 5l3-3 3 3M2 14h12',
  sendToBack: 'M8 11V2M5 8l3 3 3-3M2 14h12',
  applyCrop: 'm2 8 4 4 8-8',
  cancelCrop: 'M3 3l10 10M13 3 3 13',
};

const CROP_ITEMS: ReadonlySet<ImageEditorQuickItemId> = new Set(['applyCrop', 'cancelCrop']);

/** The tool panel and the quick-access toolbar (a lazy chunk). */
export default function Panels({ c, panel, quick: items, selectedAnnotation: a, classNames, styles }: PanelsProps): ReactElement {
  const { text, engine, tool } = c;
  const body = panel ? panelBody(c, a) : null;
  const crop = tool === 'crop';
  const quick = items.filter((id) => (crop ? CROP_ITEMS.has(id) : !CROP_ITEMS.has(id) && (id !== 'edit' || a?.kind === 'text')));
  // Repaint after every commit so the quick toolbar follows the selection.
  useEffect(() => engine.invalidate());
  return (
    <>
      {body ? (
        <div role="group" aria-label={body.label} className={['salmon-image-editor-panel', classNames?.panel].filter(Boolean).join(' ')} style={styles?.panel} data-tool={tool}>
          {body.body}
        </div>
      ) : null}
      {quick.length ? (
        <Toolbar
          ref={(el) => {
            engine.quick = el;
            engine.invalidate();
          }}
          overflow="wrap"
          aria-label={text.quickToolbar}
          className={['salmon-image-editor-quick', classNames?.quickToolbar].filter(Boolean).join(' ')}
          style={styles?.quickToolbar}
          data-cropping={crop ? '' : undefined}
        >
          {quick.map((id) => (
            <Button key={id} variant="ghost" size="sm" iconOnly aria-label={text[id]} title={text[id]} data-item={id} onClick={(e) => quickAction(c.latest(), id, src(e))}>
              {itemIcon(id, QUICK_PATHS)}
            </Button>
          ))}
        </Toolbar>
      ) : null}
    </>
  );
}
