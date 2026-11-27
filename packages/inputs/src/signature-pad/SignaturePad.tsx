'use client';

// SignaturePad.
//
// - Strokes are the source of truth; the canvas is a render of them. Undo
//   and redo walk a stack of immutable states; resize and devicePixelRatio
//   changes redraw from the strokes; `toSVG()` uses the same curves.
// - Drawing uses `internal/pointer-drag.ts` (pointer capture, rAF-coalesced
//   moves with every `getCoalescedEvents()` sample) and draws only the new
//   segments of the live stroke; React does not render while drawing.
// - `touch-action: none` is on the canvas only. The server renders the sized
//   container and an empty canvas; drawing starts after mount.

import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react';
import { cx, FieldHelp, FieldStateContext, useField, type FieldCommonProps, type FieldValidationText } from '../internal/field/field.js';
import { useFormReset } from '@salmonui/core/internal/form';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { usePointerDrag } from '@salmonui/core/internal/pointer-drag';
import { EMPTY_STATE, fontSizeOf, segments, toSVG, WidthTracker, widthsOf, type SignatureItem, type SignatureState, type Stroke, type TextItem } from './strokes.js';

/** What changed (`onValueChange` details). */
export type SignatureAction = 'stroke' | 'undo' | 'redo' | 'clear' | 'load' | 'text' | 'reset';

export interface SignatureChangeDetails {
  readonly source: 'pointer' | 'touch' | 'keyboard' | 'api';
  readonly reason: SignatureAction;
  readonly action: SignatureAction;
}

/** Image options of `toDataURL` / `toBlob`. */
export interface SignatureImageOptions {
  /** Include `backgroundColor` and `backgroundImage`. Default true. */
  readonly background?: boolean | undefined;
}

/** `ref` of `SignaturePad`. */
export interface SignaturePadApi {
  /** The root element. */
  readonly element: HTMLDivElement | null;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
  isEmpty(): boolean;
  /** Replaces the signature with centered text. */
  drawText(text: string, options?: { readonly fontFamily?: string | undefined; readonly fontSize?: number | undefined }): void;
  /** Loads an image (data URL or URL) as the signature; resolves when drawn. */
  load(source: string): Promise<void>;
  /** PNG (default) or JPEG at the canvas resolution. */
  toDataURL(type?: 'image/png' | 'image/jpeg', options?: SignatureImageOptions): string;
  toBlob(type?: 'image/png' | 'image/jpeg', options?: SignatureImageOptions): Promise<Blob | null>;
  /** Vector markup from the stroke model, in CSS pixels. */
  toSVG(options?: SignatureImageOptions): string;
  focus(): void;
}

/** User-visible strings. */
export type SignaturePadLocaleText = FieldValidationText & {
  /** Canvas name while empty. Default `'Signature, empty'`. */
  readonly empty?: string;
  /** Canvas name with a signature. Default `'Signature, signed'`. */
  readonly signed?: string;
  /** Mode toggle. Default `'Type your name'`. */
  readonly typeMode?: string;
  /** Label of the name field. Default `'Name'`. */
  readonly typeLabel?: string;
  /** Default `'Clear'`. */
  readonly clear?: string;
};

export interface SignaturePadProps extends FieldCommonProps {
  /** Controlled signature as a data URL (`null` empty). */
  readonly value?: string | null | undefined;
  readonly defaultValue?: string | null | undefined;
  /** After a stroke, undo, redo, clear, load, typed text or reset, with the PNG data URL (`null` empty). */
  readonly onValueChange?: ((value: string | null, details: SignatureChangeDetails) => void) | undefined;
  /** Default `'#000000'` (image data, not theme). */
  readonly strokeColor?: string | undefined;
  /** Default 0.5. */
  readonly minStrokeWidth?: number | undefined;
  /** Default 2.5. */
  readonly maxStrokeWidth?: number | undefined;
  /** Velocity filter weight 0..1; higher follows speed changes faster. Default 0.7. */
  readonly velocity?: number | undefined;
  /** Canvas fill. Default none (transparent). */
  readonly backgroundColor?: string | undefined;
  /** Image drawn under the strokes, stretched to the pad. Same-origin or CORS-enabled. */
  readonly backgroundImage?: string | undefined;
  /** Pad height (CSS length or px). Default 160. */
  readonly height?: number | string | undefined;
  /** Shows the Clear button and the "type your name" toggle. Default true. */
  readonly toolbar?: boolean | undefined;
  /** Font of typed text. Default `'cursive'`. */
  readonly fontFamily?: string | undefined;
  /** Submits the PNG data URL (empty when there is no signature). */
  readonly name?: string | undefined;
  readonly form?: string | undefined;
  readonly required?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly localeText?: SignaturePadLocaleText | undefined;
  readonly id?: string | undefined;
  readonly dir?: 'ltr' | 'rtl' | 'auto' | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly classNames?: { readonly label?: string; readonly surface?: string; readonly canvas?: string; readonly toolbar?: string; readonly description?: string; readonly error?: string } | undefined;
  readonly ref?: Ref<SignaturePadApi> | undefined;
}

interface Live {
  points: number[];
  widths: number[];
  tracker: WidthTracker;
  drawn: number;
  stroke: Omit<Stroke, 'points'>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Signature capture: a Canvas 2D pad drawn with Pointer Events,
 * a "type your name" keyboard mode, undo / redo (`Mod+Z`, `Mod+Shift+Z`),
 * PNG / JPEG / SVG output and form participation through a hidden input.
 * `ref` is a `SignaturePadApi`.
 */
export function SignaturePad(props: SignaturePadProps): ReactNode {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenRef = useRef<HTMLInputElement | null>(null);
  const drag = usePointerDrag();
  const controlled = props.value !== undefined;
  const initial = useRef(props.defaultValue ?? null);
  // The data URL currently shown (state only changes at the end of an action, never while drawing).
  const [url, setUrl] = useState<string | null>(controlled ? (props.value ?? null) : initial.current);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  /** Undo stack and position; `emitted` is the last URL reported (controlled echo detection). */
  const model = useRef({ history: [EMPTY_STATE] as SignatureState[], index: 0, emitted: undefined as string | null | undefined, images: new Map<string, HTMLImageElement>(), background: null as HTMLImageElement | null, size: [0, 0, 1] as [number, number, number] });
  const live = useRef<Live | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const shown = controlled ? (props.value ?? null) : url;
  const empty = shown === null;
  const text = useLocaleText('signaturePad', props.localeText);
  // `id` names the root; the canvas gets a generated id.
  const field = useField({
    ...props,
    localeText: text,
    id: undefined,
    validation: props.required ? { required: true, ...props.validation } : props.validation,
    value: shown ?? '',
    inputRef: hiddenRef,
    focusRef: canvasRef,
    revealOnChange: true,
  });

  const state = (): SignatureState => model.current.history[model.current.index]!;

  /** Draws background, base image and items at the device pixel ratio. */
  const paint = (ctx: CanvasRenderingContext2D, scale: number, s: SignatureState, background: boolean): void => {
    const [w, h] = model.current.size;
    const p = latest.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (background && p.backgroundColor) {
      ctx.fillStyle = p.backgroundColor;
      ctx.fillRect(0, 0, w, h);
    }
    if (background && model.current.background) ctx.drawImage(model.current.background, 0, 0, w, h);
    const base = s.base ? model.current.images.get(s.base) : null;
    if (base) ctx.drawImage(base, 0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const item of s.items) drawItem(ctx, item, w, h);
  };

  const redraw = (): void => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    paint(ctx, model.current.size[2], state(), true);
    const l = live.current;
    if (l) {
      l.drawn = 0;
      drawLive(ctx, l, true);
    }
  };

  /** Encodes the current state; null when empty. */
  const encode = (type: 'image/png' | 'image/jpeg' = 'image/png', background = true): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty()) return null;
    if (background) return canvas.toDataURL(type);
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    paint(ctx, model.current.size[2], state(), false);
    return off.toDataURL(type);
  };

  const isEmpty = (): boolean => {
    const s = state();
    return s.base === null && s.items.length === 0;
  };

  /** Publishes the new state: hidden input, label, `onValueChange`. */
  const publish = (action: SignatureAction, source: SignatureChangeDetails['source']): void => {
    const p = latest.current;
    const next = encode();
    model.current.emitted = next;
    if (!controlled) setUrl(next);
    if (p.onValueChange) p.onValueChange(next, Object.freeze({ source, reason: action, action }));
  };

  /** Pushes a state onto the undo stack (dropping the redo branch) and redraws. */
  const push = (next: SignatureState, replaceTop = false): void => {
    const m = model.current;
    if (!replaceTop) m.history = m.history.slice(0, m.index + 1);
    else m.history = m.history.slice(0, m.index);
    m.history.push(next);
    m.index = m.history.length - 1;
    redraw();
  };

  const loadBase = async (source: string | null): Promise<SignatureState> => {
    if (source === null) return EMPTY_STATE;
    const img = await loadImage(source);
    model.current.images.set(source, img);
    return { base: source, items: [] };
  };

  const textItem = (text: string, options?: { readonly fontFamily?: string | undefined; readonly fontSize?: number | undefined }): TextItem => ({
    kind: 'text',
    text,
    fontFamily: options?.fontFamily ?? latest.current.fontFamily ?? 'cursive',
    fontSize: options?.fontSize ?? 0,
    color: latest.current.strokeColor ?? '#000000',
  });

  const undo = (source: SignatureChangeDetails['source'] = 'api'): void => {
    if (model.current.index === 0) return;
    model.current.index--;
    redraw();
    publish('undo', source);
  };
  const redo = (source: SignatureChangeDetails['source'] = 'api'): void => {
    const m = model.current;
    if (m.index >= m.history.length - 1) return;
    m.index++;
    redraw();
    publish('redo', source);
  };
  const clear = (source: SignatureChangeDetails['source'] = 'api'): void => {
    if (isEmpty()) return;
    push(EMPTY_STATE);
    setTyped('');
    publish('clear', source);
  };
  const load = async (source: string, action: SignatureAction = 'load', emit = true): Promise<void> => {
    const next = await loadBase(source);
    push(next);
    if (emit) publish(action, 'api');
  };

  useImperativeHandle(props.ref, () => ({
    get element() {
      return rootRef.current;
    },
    undo: () => undo(),
    redo: () => redo(),
    canUndo: () => model.current.index > 0,
    canRedo: () => model.current.index < model.current.history.length - 1,
    clear: () => clear(),
    isEmpty,
    drawText(text, options) {
      push(text ? { base: null, items: [textItem(text, options)] } : EMPTY_STATE);
      publish('text', 'api');
    },
    load: (source) => load(source),
    toDataURL(type = 'image/png', options) {
      const canvas = canvasRef.current;
      if (!canvas) return '';
      return encode(type, options?.background !== false) ?? (options?.background === false ? '' : canvas.toDataURL(type));
    },
    toBlob(type = 'image/png', options) {
      const canvas = canvasRef.current;
      const data = canvas ? (encode(type, options?.background !== false) ?? (options?.background === false ? '' : canvas.toDataURL(type))) : '';
      if (!data) return Promise.resolve(null);
      return fetch(data).then((r) => r.blob());
    },
    toSVG(options) {
      const [w, h] = model.current.size;
      const p = latest.current;
      return toSVG(state(), w, h, options?.background === false ? null : { color: p.backgroundColor, image: p.backgroundImage });
    },
    focus: () => canvasRef.current?.focus(),
  }));

  // Size the backing store to the box at devicePixelRatio; redraw on resize and DPR changes.
  useEffect(() => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;
    const resize = (): void => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const [pw, ph, pd] = model.current.size;
      if (w === pw && h === ph && dpr === pd) return;
      model.current.size = [w, h, dpr];
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      redraw();
    };
    resize();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    let mq: MediaQueryList | null = null;
    const watch = (): void => {
      mq?.removeEventListener('change', onDpr);
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mq.addEventListener('change', onDpr);
    };
    const onDpr = (): void => {
      resize();
      watch();
    };
    watch();
    return () => {
      ro?.disconnect();
      mq?.removeEventListener('change', onDpr);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background image.
  useEffect(() => {
    const src = props.backgroundImage;
    let alive = true;
    if (!src) {
      model.current.background = null;
      redraw();
      return;
    }
    loadImage(src).then(
      (img) => {
        if (!alive) return;
        model.current.background = img;
        redraw();
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.backgroundImage]);

  // Repaint when the image props change.
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.backgroundColor]);

  // Initial and controlled values: an outside data URL becomes the base image.
  const source = controlled ? (props.value ?? null) : initial.current;
  useEffect(() => {
    const m = model.current;
    if (source === m.emitted) return;
    m.emitted = source;
    let alive = true;
    void loadBase(source).then(
      (next) => {
        if (!alive) return;
        // An outside value is a new baseline: no undo back past it.
        m.history = [next];
        m.index = 0;
        redraw();
        if (!controlled) setUrl(source);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useFormReset(hiddenRef, () => {
    const reset = initial.current;
    live.current = null;
    setTyped('');
    void loadBase(reset).then((next) => {
      const m = model.current;
      m.history = [next];
      m.index = 0;
      m.emitted = reset;
      redraw();
      setUrl(reset);
      if (controlled) latest.current.onValueChange?.(reset, Object.freeze({ source: 'api', reason: 'reset', action: 'reset' }));
    });
  });

  const interactive = !props.disabled && !props.readOnly;

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!interactive) return;
    const p = latest.current;
    const source = event.pointerType === 'touch' ? 'touch' : 'pointer';
    const add = (e: PointerEvent, rect: { readonly left: number; readonly top: number }): void => {
      const l = live.current;
      if (!l) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const n = l.points.length;
      if (n >= 4 && l.points[n - 4] === x && l.points[n - 3] === y) return;
      const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : -1;
      l.points.push(x, y, pressure, e.timeStamp);
      l.widths.push(l.tracker.next(x, y, pressure, e.timeStamp));
    };
    const session = drag.start(
      event,
      {
        onStart: (e, rect) => {
          const stroke = { kind: 'stroke' as const, color: p.strokeColor ?? '#000000', minWidth: p.minStrokeWidth ?? 0.5, maxWidth: p.maxStrokeWidth ?? 2.5, velocity: p.velocity ?? 0.7 };
          live.current = { points: [], widths: [], tracker: new WidthTracker(stroke), drawn: 0, stroke };
          add(e, rect);
        },
        onMove: (_e, rect, points) => {
          for (const sample of points) add(sample, rect);
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx && live.current) drawLive(ctx, live.current, false);
        },
        onEnd: () => {
          const l = live.current;
          live.current = null;
          if (!l || l.points.length === 0) return;
          const s = state();
          const stroke: Stroke = { ...l.stroke, points: l.points };
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) drawLive(ctx, l, true);
          const m = model.current;
          m.history = m.history.slice(0, m.index + 1);
          m.history.push({ base: s.base, items: [...s.items, stroke] });
          m.index = m.history.length - 1;
          publish('stroke', source);
        },
      },
      { frame: 'raf' },
    );
    if (session) {
      event.preventDefault();
      canvasRef.current?.focus({ preventScroll: true });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>): void => {
    if (!interactive || !(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) undo('keyboard');
    else if ((key === 'z' && event.shiftKey) || key === 'y') redo('keyboard');
    else return;
    event.preventDefault();
  };

  const height = props.height ?? 160;
  const label = props.label != null && props.label !== false;
  return (
    <FieldStateContext value={field}>
      <div ref={rootRef} id={props.id} dir={props.dir} className={cx('salmon-field salmon-signature-pad', props.className)} style={props.style} data-size={props.size ?? 'md'} data-empty={empty ? '' : undefined} data-typing={typing ? '' : undefined} {...field.rootProps}>
        {label ? (
          <span className={cx('salmon-field-label', props.classNames?.label)} id={field.labelId}>
            {props.label}
          </span>
        ) : null}
        <div ref={surfaceRef} className={cx('salmon-signature-pad-surface', props.classNames?.surface)} style={{ blockSize: typeof height === 'number' ? `${height}px` : height }}>
          <canvas
            ref={canvasRef}
            id={field.inputId}
            className={cx('salmon-signature-pad-canvas', props.classNames?.canvas)}
            role="img"
            tabIndex={props.disabled ? -1 : 0}
            aria-label={empty ? (text?.empty ?? 'Signature, empty') : (text?.signed ?? 'Signature, signed')}
            aria-labelledby={label ? `${field.labelId} ${field.inputId}` : undefined}
            aria-describedby={field.inputProps['aria-describedby']}
            aria-invalid={field.inputProps['aria-invalid']}
            aria-disabled={props.disabled ? true : undefined}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            onBlur={field.onBlur}
          />
        </div>
        {props.toolbar !== false && !props.readOnly ? (
          <div className={cx('salmon-signature-pad-toolbar', props.classNames?.toolbar)}>
            <button type="button" className="salmon-signature-pad-button" aria-pressed={typing} disabled={props.disabled} onClick={() => setTyping((t) => !t)}>
              {text?.typeMode ?? 'Type your name'}
            </button>
            <button type="button" className="salmon-signature-pad-button" disabled={props.disabled || empty} onClick={(e) => clear(e.detail === 0 ? 'keyboard' : 'pointer')}>
              {text?.clear ?? 'Clear'}
            </button>
          </div>
        ) : null}
        {typing && interactive ? (
          <label className="salmon-signature-pad-type">
            <span>{text?.typeLabel ?? 'Name'}</span>
            <input
              className="salmon-signature-pad-input"
              // Opened by the "Type your name" toggle: typing starts at once.
              autoFocus
              value={typed}
              autoComplete="name"
              onChange={(event) => {
                const v = event.currentTarget.value;
                setTyped(v);
                // One undo step per typing session: later keystrokes replace the text state.
                const s = state();
                const top = s.items.length === 1 && s.items[0]!.kind === 'text' && s.base === null;
                push(v ? { base: null, items: [textItem(v)] } : EMPTY_STATE, top && model.current.index > 0);
                publish('text', 'keyboard');
              }}
            />
          </label>
        ) : null}
        <input ref={hiddenRef} type="hidden" name={props.name} form={props.form} value={shown ?? ''} disabled={props.disabled} />
        <FieldHelp field={field} description={props.description} classNames={props.classNames} />
      </div>
    </FieldStateContext>
  );
}

function drawItem(ctx: CanvasRenderingContext2D, item: SignatureItem, w: number, h: number): void {
  if (item.kind === 'text') {
    ctx.fillStyle = item.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = fontSizeOf(item, w, h, (s) => {
      ctx.font = `${s}px ${item.fontFamily}`;
      return ctx.measureText(item.text).width;
    });
    ctx.font = `${size}px ${item.fontFamily}`;
    ctx.fillText(item.text, w / 2, h / 2);
    return;
  }
  const widths = widthsOf(item);
  drawStroke(ctx, item.points, widths, item.color, 0, item.points.length / 4 - 1);
}

function drawStroke(ctx: CanvasRenderingContext2D, points: readonly number[], widths: readonly number[], color: string, from: number, to: number): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  if (points.length === 4) {
    ctx.beginPath();
    ctx.arc(points[0]!, points[1]!, widths[0]! / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  segments(points, widths, (x0, y0, c1x, c1y, c2x, c2y, x1, y1, width) => {
    ctx.beginPath();
    ctx.lineWidth = width;
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x1, y1);
    ctx.stroke();
  }, from, to);
}

/** Draws the segments of the live stroke that are final (all of them when `end`). */
function drawLive(ctx: CanvasRenderingContext2D, l: Live, end: boolean): void {
  const n = l.points.length / 4;
  const to = end ? n - 1 : n - 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (end && n === 1) {
    drawStroke(ctx, l.points, l.widths, l.stroke.color, 0, 0);
    return;
  }
  if (to > l.drawn) {
    drawStroke(ctx, l.points, l.widths, l.stroke.color, l.drawn, to);
    l.drawn = to;
  }
}
