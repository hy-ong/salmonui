'use client';

// Shared SVG view and instance API of `Barcode` and `QRCode`. Final markup on the server (no measurement), never
// mirrored in RTL (`direction: ltr` on the root: a mirrored symbol does not
// scan). Export code is a lazy chunk (`internal/viz/export.ts`).

import { useEffect, useImperativeHandle, useRef, type CSSProperties, type ReactNode, type Ref } from 'react';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { drawingToSvg, FONT_SIZE, hexContrast, type Drawing } from './render.js';

export type BarcodeImageFormat = 'png' | 'jpeg' | 'svg';

export interface BarcodeExportOptions {
  readonly format?: BarcodeImageFormat | undefined;
  /** Default `barcode.<format>`. */
  readonly fileName?: string | undefined;
  /** Raster scale on top of the device pixel ratio. Default 1. */
  readonly scale?: number | undefined;
}

/** Instance reached through `ref` on `Barcode` and `QRCode`. */
export interface BarcodeApi {
  /** The root `<svg>` (null before mount). */
  readonly element: SVGSVGElement | null;
  /** Standalone SVG markup; works without a DOM (server, tests). */
  toSVGString(): string;
  toBlob(format?: BarcodeImageFormat, options?: Omit<BarcodeExportOptions, 'format' | 'fileName'>): Promise<Blob>;
  toDataURL(format?: BarcodeImageFormat, options?: Omit<BarcodeExportOptions, 'format' | 'fileName'>): Promise<string>;
  /** Downloads the symbol; settles after the download started. */
  export(options?: BarcodeExportOptions): Promise<void>;
}

export type QRCodeApi = BarcodeApi;

export interface BarcodeInvalidEvent {
  readonly reason: string;
}

export interface SymbolSvgProps {
  readonly family: 'salmon-barcode' | 'salmon-qr-code';
  readonly drawing: Drawing | null;
  readonly label: string;
  readonly invalidReason: string | null;
  readonly color: string;
  readonly background: string;
  readonly logo?: ReactNode;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly apiRef?: Ref<BarcodeApi> | undefined;
  readonly onInvalid?: ((event: BarcodeInvalidEvent) => void) | undefined;
  readonly extra: Record<string, unknown>;
  readonly idHint: string;
}

/** Contrast below which a scanner may fail to read the symbol (development warning). */
export const MIN_SCAN_CONTRAST = 3;

export function SymbolSvg(props: SymbolSvgProps): ReactNode {
  const { drawing: dr, invalidReason, color, background, onInvalid } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const markup = () => (dr ? drawingToSvg(dr, props.label, color, background) : `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${props.label.replace(/"/g, '&quot;')}"/>`);
  useImperativeHandle(props.apiRef, () => {
    const blob = async (format: BarcodeImageFormat = 'png', options: { scale?: number | undefined } = {}): Promise<Blob> => {
      const svg = svgRef.current;
      if (format === 'svg' || !svg) return new Blob([svg ? new XMLSerializer().serializeToString(svg) : markup()], { type: 'image/svg+xml;charset=utf-8' });
      const io = await import('../internal/viz/export.js');
      return io.toBlob(svg, { format, scale: options.scale, background });
    };
    return {
      get element() {
        return svgRef.current;
      },
      toSVGString: () => (svgRef.current && typeof XMLSerializer !== 'undefined' ? new XMLSerializer().serializeToString(svgRef.current) : markup()),
      toBlob: blob,
      async toDataURL(format = 'png', options = {}) {
        const io = await import('../internal/viz/export.js');
        return io.blobToDataURL(await blob(format, options));
      },
      async export(options = {}) {
        const format = options.format ?? 'png';
        const b = await blob(format, { scale: options.scale });
        const io = await import('../internal/viz/export.js');
        io.download(b, options.fileName ?? `barcode.${format === 'jpeg' ? 'jpg' : format}`);
      },
    };
  });
  useEffect(() => {
    if (invalidReason === null) return;
    onInvalid?.({ reason: invalidReason });
    // An application that handles `onInvalid` gets no console noise.
    if (DEV && !onInvalid) warnOnce(`barcode-invalid:${props.idHint}:${invalidReason}`, `${props.family === 'salmon-qr-code' ? 'QRCode' : 'Barcode'}: ${invalidReason}`);
  }, [invalidReason, onInvalid, props.family, props.idHint]);
  useEffect(() => {
    if (!DEV) return;
    const c = hexContrast(color, background);
    if (c !== undefined && c < MIN_SCAN_CONTRAST) warnOnce(`barcode-contrast:${color}:${background}`, `${props.family === 'salmon-qr-code' ? 'QRCode' : 'Barcode'}: color ${color} on ${background} has contrast ${c.toFixed(2)}:1; scanners need a dark symbol on a light background (at least ${MIN_SCAN_CONTRAST}:1).`);
  }, [color, background, props.family]);
  const className = `salmon-viz ${props.family}${props.className ? ` ${props.className}` : ''}`;
  if (!dr) {
    return <svg {...props.extra} ref={svgRef} className={className} style={props.style} role="img" aria-label={props.label} data-invalid="" width={0} height={0} />;
  }
  return (
    <svg
      {...props.extra}
      ref={svgRef}
      className={className}
      style={props.style}
      role="img"
      aria-label={props.label}
      width={dr.width}
      height={dr.height}
      viewBox={`0 0 ${dr.width} ${dr.height}`}
      direction="ltr"
    >
      <rect width={dr.width} height={dr.height} fill={background} />
      <path d={dr.d} fill={color} shapeRendering="crispEdges" />
      {dr.bearer ? <path d={dr.bearer} fill={color} shapeRendering="crispEdges" /> : null}
      {dr.texts.map((t, i) => (
        <text key={i} x={t.x} y={t.y} textAnchor={t.anchor} fontSize={FONT_SIZE} fill={color} aria-hidden="true">
          {t.text}
        </text>
      ))}
      {dr.logo && props.logo ? (
        <foreignObject x={dr.logo.x} y={dr.logo.y} width={dr.logo.size} height={dr.logo.size}>
          <div className={`${props.family}-logo`}>{props.logo}</div>
        </foreignObject>
      ) : null}
    </svg>
  );
}
