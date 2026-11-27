// Writes the committed PdfViewer fixtures from pdf-sample.ts:
//   node tests/browser/fixtures/write-pdf-fixtures.ts
// tests/browser/fixtures/sample.pdf, sample-protected.pdf (password "salmon")
// and the docs demo copies docs/site/public/sample.pdf and sample-protected.pdf.
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildSamplePdf } from './pdf-sample.ts';

const here = new URL('./', import.meta.url);
const demo = new URL('../../../docs/site/public/', import.meta.url);
mkdirSync(demo, { recursive: true });
const sample = buildSamplePdf();
writeFileSync(new URL('sample.pdf', here), sample);
const protectedPdf = buildSamplePdf({ password: 'salmon' });
writeFileSync(new URL('sample-protected.pdf', here), protectedPdf);
writeFileSync(new URL('sample.pdf', demo), sample);
writeFileSync(new URL('sample-protected.pdf', demo), protectedPdf);
console.log(`sample.pdf: ${sample.length} bytes`);
