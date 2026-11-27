// Export and print, loaded as a lazy chunk by
// the `api.export()` / `toBlob()` / `toDataURL()` / `print()` instance
// methods and `exportVisualizations`. Zero dependencies: the drawn SVG is cloned, its
// `var(--salmon-*)` colors are inlined from the computed style, and raster
// formats go through an `<img>` and a canvas at `scale` x the device pixel
// ratio.

import type { ExportableVisualization, ExportVisualizationsOptions } from './export-all.js';
import type { VizExportWriters } from './instance.js';
import { resolveColor } from './plot-canvas.js';

export type RasterFormat = 'png' | 'jpeg';
export type ImageFormat = RasterFormat | 'svg';

export interface ExportImageOptions {
  readonly format?: ImageFormat | undefined;
  readonly fileName?: string | undefined;
  /** Raster scale on top of the device pixel ratio. Default 1. */
  readonly scale?: number | undefined;
  /** Raster background (JPEG has no alpha). Default: the theme surface. */
  readonly background?: string | undefined;
}

const XMLNS = 'http://www.w3.org/2000/svg';

/** Standalone SVG markup of a rendered visualization (colors and fonts inlined). */
export function serializeSvg(svg: SVGSVGElement, background?: string): string {
  const style = getComputedStyle(svg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = sizeOf(svg);
  clone.setAttribute('xmlns', XMLNS);
  clone.setAttribute('width', `${width}`);
  clone.setAttribute('height', `${height}`);
  clone.removeAttribute('aria-hidden');
  clone.removeAttribute('class');
  const textColor = style.color || '#000';
  // Every attribute and inline style that references a variable gets the resolved color.
  const colors = new Map<string, string>();
  // `var(--salmon-chart-1)` and friends resolve through light-dark() and relative colors: let the cascade compute them.
  const inlineVar = (text: string) => resolveColor(svg, text.trim(), colors);
  const walk = (el: Element) => {
    for (const attr of el.attributes) {
      if (attr.value.includes('var(')) el.setAttribute(attr.name, attr.name === 'style' ? attr.value.replace(/var\([^;]*\)/g, inlineVar) : inlineVar(attr.value));
    }
    for (const child of el.children) walk(child);
  };
  walk(clone);
  // Class-based styles do not survive serialization: inline the computed fill / stroke of text and marks.
  const live = svg.querySelectorAll('*');
  const copies = clone.querySelectorAll('*');
  live.forEach((node, i) => {
    const copy = copies[i];
    if (!copy) return;
    const cs = getComputedStyle(node);
    if (node.tagName === 'text' || node.tagName === 'tspan') {
      if (!copy.getAttribute('fill')) copy.setAttribute('fill', cs.fill || textColor);
      copy.setAttribute('font-size', cs.fontSize);
      if (cs.fontWeight && cs.fontWeight !== '400') copy.setAttribute('font-weight', cs.fontWeight);
    } else if (cs.display === 'none' || cs.visibility === 'hidden') {
      copy.setAttribute('display', 'none');
    } else {
      if (!copy.getAttribute('fill') && cs.fill && cs.fill !== 'rgb(0, 0, 0)') copy.setAttribute('fill', cs.fill);
      if (!copy.getAttribute('stroke') && cs.stroke && cs.stroke !== 'none') copy.setAttribute('stroke', cs.stroke);
    }
  });
  clone.setAttribute('font-family', style.fontFamily || 'system-ui, sans-serif');
  const bg = background ?? style.getPropertyValue('--salmon-surface-base').trim();
  if (bg) {
    const rect = svg.ownerDocument.createElementNS(XMLNS, 'rect');
    for (const [name, value] of [['width', '100%'], ['height', '100%'], ['fill', bg]] as const) rect.setAttribute(name, value);
    clone.prepend(rect);
  }
  return new XMLSerializer().serializeToString(clone);
}

/** Rasterizes SVG markup to a blob. */
export async function svgToBlob(markup: string, width: number, height: number, format: RasterFormat, scale = 1): Promise<Blob> {
  const dpr = Math.max(1, globalThis.devicePixelRatio || 1) * scale;
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = resolve as () => void;
      img.onerror = () => reject(new Error('SVG rasterization failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.scale(dpr, dpr);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), `image/${format}`, 0.92));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function sizeOf(svg: SVGSVGElement): { width: number; height: number } {
  const box = svg.viewBox.baseVal;
  return { width: box?.width || svg.clientWidth, height: box?.height || svg.clientHeight };
}

export async function toBlob(svg: SVGSVGElement, options: ExportImageOptions = {}): Promise<Blob> {
  const format = options.format ?? 'png';
  const markup = serializeSvg(svg, options.background);
  if (format === 'svg') return new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const { width, height } = sizeOf(svg);
  return svgToBlob(markup, width, height, format, options.scale);
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(`${reader.result}`);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Saves a blob through a temporary link; settles after the click. */
export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  // Revoked after the click task: browsers read the URL asynchronously (a 0 ms revoke cancels the download).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Stacks several SVGs into one (`exportVisualizations`), vertically
 * or horizontally, each at its drawing size.
 */
export function combineSvgs(svgs: readonly SVGSVGElement[], direction: 'vertical' | 'horizontal' = 'vertical', gap = 16): { markup: string; width: number; height: number } {
  let width = 0;
  let height = 0;
  const parts: string[] = [];
  for (const svg of svgs) {
    const s = sizeOf(svg);
    const inner = serializeSvg(svg);
    const across = direction === 'horizontal';
    const start = (across ? width : height) + (parts.length ? gap : 0);
    parts.push(inner.replace('<svg', `<svg x="${across ? start : 0}" y="${across ? 0 : start}"`));
    width = across ? start + s.width : Math.max(width, s.width);
    height = across ? Math.max(height, s.height) : start + s.height;
  }
  return { markup: `<svg xmlns="${XMLNS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`, width, height };
}

/** Prints SVG markup in a hidden frame (the vector stays a vector). */
export function printSvg(markup: string, title: string, extraHtml = ''): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;inset-inline-start:-10000px';
    document.body.appendChild(frame);
    const done = () => {
      frame.remove();
      resolve();
    };
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) return done();
    const esc = title.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    doc.open();
    doc.write(`<!doctype html><html><head><title>${esc}</title><style>@page{margin:12mm}body{margin:0;font-family:system-ui,sans-serif}svg{max-width:100%;height:auto}</style></head><body>${markup}${extraHtml}</body></html>`);
    doc.close();
    const win = frame.contentWindow;
    win.addEventListener('afterprint', done, { once: true });
    win.focus();
    win.print();
    setTimeout(done, 1000);
  });
}

/** A vector PDF of SVG markups (one page each) through the application's `exportWriters.pdf` loader. */
export async function pdfBlob(markups: readonly string[], load: VizExportWriters['pdf'], options: { readonly orientation?: 'portrait' | 'landscape' | undefined; readonly pageSize?: string | undefined; readonly title?: string | undefined }): Promise<Blob> {
  if (!load) throw new Error('Salmon UI: pdf needs exportWriters.pdf');
  const { writeGraphicsPdf } = await load();
  const file = await (writeGraphicsPdf as (pages: readonly string[], o: typeof options) => Promise<{ readonly data: Uint8Array }>)(markups, options);
  return new Blob([file.data as BlobPart], { type: 'application/pdf' });
}

/**
 * `exportVisualizations`: every drawing serialized with its colors
 * resolved, stacked into one SVG, then rasterized, kept as SVG or written as
 * one vector PDF page through `writers.pdf`.
 */
export async function combine(items: readonly ExportableVisualization[], options: ExportVisualizationsOptions): Promise<Blob> {
  const svgs: SVGSVGElement[] = [];
  for (const item of items) {
    const el = item && !('localName' in item) ? item.element : item;
    const svg = el?.localName === 'svg' ? el : el?.querySelector('.salmon-viz-surface svg');
    if (svg) svgs.push(svg as SVGSVGElement);
  }
  const format = options.format ?? 'png';
  const { markup, width, height } = combineSvgs(svgs, options.direction, options.gap);
  const blob = format === 'svg' ? new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }) : format === 'pdf' ? await pdfBlob([markup], options.writers?.pdf, options) : await svgToBlob(markup, width, height, format, options.scale);
  if (options.download !== false) download(blob, options.fileName ?? `visualizations.${format === 'jpeg' ? 'jpg' : format}`);
  return blob;
}
