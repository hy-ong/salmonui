// The asynchronous instance methods (`export`, `toBlob`, `toDataURL`,
// `print`), loaded with the export code on the first call so a family's
// initial chunk carries only the method stubs (instance.ts). Chart's
// document formats (`xlsx`, `pdf`) and its core CSV are `export-data.ts`.

import { isFormulaText } from '@salmonui/core/export-model';
import { blobToDataURL, download, printSvg, serializeSvg, toBlob, type ImageFormat } from './export.js';
import type { VizExportOptions, VizInstanceSource } from './instance.js';

export const svgOf = (root: HTMLElement | null): SVGSVGElement => {
  const svg = root?.querySelector<SVGSVGElement>('.salmon-viz-surface svg');
  if (!svg) throw new Error('Salmon UI: the visualization is not mounted');
  return svg;
};

export type InstanceMethod = 'export' | 'toBlob' | 'toDataURL' | 'print';

export async function run(source: VizInstanceSource, method: InstanceMethod, arg?: VizExportOptions | ImageFormat): Promise<unknown> {
  const root = source.root();
  const image = () => toBlob(svgOf(root), { format: (arg as ImageFormat | undefined) ?? 'png' });
  switch (method) {
    case 'export': {
      const options = (arg ?? {}) as VizExportOptions;
      const format = options.format ?? 'png';
      const fileName = options.fileName ?? `${source.name}.${format === 'jpeg' ? 'jpg' : format}`;
      if (format === 'csv') {
        const t = source.csv?.();
        if (!t) throw new Error('Salmon UI: no table to export');
        const cell = (text: string) => {
          const v = options.escapeFormulas !== false && isFormulaText(text) && isNaN(+text.replace(/,/g, '')) ? `'${text}` : text;
          return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        };
        download(new Blob([[t.columns, ...t.rows].map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), fileName);
        return undefined;
      }
      download(await toBlob(svgOf(root), { format, scale: options.scale }), fileName);
      return undefined;
    }
    case 'toBlob':
      return image();
    case 'toDataURL':
      return blobToDataURL(await image());
    case 'print':
      return printSvg(serializeSvg(svgOf(root)), source.title?.() ?? root?.getAttribute('aria-label') ?? source.name);
  }
}
