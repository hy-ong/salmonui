// Image cells: the `cell` hook returns `{ image }` and the XLSX
// writer embeds a picture anchored to the cell (media, drawing, relationships,
// content types, row height) while the PDF writer draws an image XObject
// (JPEG `/DCTDecode`, PNG predictor pass-through, decoded PNG with `/SMask`),
// one per distinct image, with rows grown to the image. The image-free path
// writes no drawing parts and, for PDF, the same bytes as without a hook.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inflateSync, deflateSync } from 'node:zlib';
import type { ExportCellPatch, ExportFile, ExportHandlers, ExportImage } from '@salmonui/core/export-model';
import { exportPdf } from '@salmonui/export/pdf';
import { exportXlsx } from '@salmonui/export/xlsx';
import { crc32 } from '../dist/bytes.js';
import { makeEngine, pdfStreams, pdfText, sales, sheetCells, unzip, type Sale } from './helpers.ts';

const latin = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** PNG of raw scanlines; row `y` uses filter `y % 5` when `filters` is set (all five PNG filters). */
function png(w: number, h: number, colorType: number, depth: number, pixels: number[], options: { interlace?: number; filters?: boolean; extra?: [string, Uint8Array][] } = {}): Uint8Array {
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType] as number;
  const stride = Math.ceil((w * channels * depth) / 8);
  const bpp = Math.max(1, (channels * depth) >> 3);
  const raw = new Uint8Array(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    const f = options.filters ? y % 5 : 0;
    raw[y * (stride + 1)] = f;
    for (let x = 0; x < stride; x++) {
      const v = pixels[y * stride + x] as number;
      const a = x >= bpp ? (pixels[y * stride + x - bpp] as number) : 0;
      const b = y ? (pixels[(y - 1) * stride + x] as number) : 0;
      const c = y && x >= bpp ? (pixels[(y - 1) * stride + x - bpp] as number) : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      const pred = [0, a, b, (a + b) >> 1, paeth][f] as number;
      raw[y * (stride + 1) + 1 + x] = (v - pred) & 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([depth, colorType, 0, 0, options.interlace ?? 0], 8);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), ...(options.extra ?? []).map(([t, d]) => chunk(t, d)), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array())];
  return Buffer.concat(parts);
}

/** A JPEG header (SOI, APP0, SOF0 3x2 with 3 components, EOI): enough for the writers, which never decode JPEG. */
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
]);

const RGB = png(2, 2, 2, 8, [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);

/** A handler putting `image(row)` in the Region column. */
const regionImage = (image: (row: Sale) => ExportImage | null, patch: Partial<ExportCellPatch> = {}): ExportHandlers<Sale> => ({
  cell: ({ row, column }) => {
    if (column.field !== 'region') return null;
    const img = image(row);
    return img ? { image: img, ...patch } : null;
  },
});

interface ImageObject {
  readonly id: number;
  readonly dict: string;
  readonly data: Uint8Array;
}

function pdfImages(bytes: Uint8Array): ImageObject[] {
  const text = latin(bytes);
  const out: ImageObject[] = [];
  for (const m of text.matchAll(/(\d+) 0 obj\n<< \/Length (\d+) (\/Type \/XObject \/Subtype \/Image[^\n]*) >>\nstream\n/g)) {
    const start = (m.index as number) + m[0].length;
    out.push({ id: Number(m[1]), dict: m[3] as string, data: bytes.subarray(start, start + Number(m[2])) });
  }
  return out;
}

function checkXref(bytes: Uint8Array): number {
  const text = latin(bytes);
  const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
  const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  entries.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset`));
  return Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)?.[1]);
}

const pdf = async (engine: ReturnType<typeof makeEngine>, handlers?: ExportHandlers<Sale>, options = {}): Promise<Uint8Array> => ((await exportPdf(engine, options, handlers)) as ExportFile).data;

describe('XLSX image cells', () => {
  it('anchors pictures to cells with media, drawing, relationships, content types, and row height', async () => {
    const engine = makeEngine();
    const file = (await exportXlsx(
      engine,
      {},
      regionImage((row) => (row.id === 's0' ? { data: RGB, width: 40, height: 40 } : row.id === 's1' ? { data: RGB.slice(), width: 20, height: 10 } : row.id === 's2' ? { data: JPEG, width: 30, height: 21 } : null)),
    )) as ExportFile;
    const files = unzip(file.data);
    assert.ok(files.has('xl/media/image1.png'));
    assert.ok(files.has('xl/media/image2.jpeg'));
    assert.ok(!files.has('xl/media/image3.png'), 'same bytes in another array are one media part');
    const types = files.get('[Content_Types].xml') as string;
    assert.match(types, /<Default Extension="png" ContentType="image\/png"\/>/);
    assert.match(types, /<Default Extension="jpeg" ContentType="image\/jpeg"\/>/);
    assert.match(types, /<Override PartName="\/xl\/drawings\/drawing1\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.drawing\+xml"\/>/);
    assert.match(files.get('xl/worksheets/_rels/sheet1.xml.rels') as string, /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/drawing" Target="\.\.\/drawings\/drawing1\.xml"/);
    const drawingRels = files.get('xl/drawings/_rels/drawing1.xml.rels') as string;
    assert.match(drawingRels, /Id="rId1" Type="[^"]+\/image" Target="\.\.\/media\/image1\.png"/);
    assert.match(drawingRels, /Id="rId2" Type="[^"]+\/image" Target="\.\.\/media\/image2\.jpeg"/);
    const drawing = files.get('xl/drawings/drawing1.xml') as string;
    const anchors = [...drawing.matchAll(/<xdr:oneCellAnchor><xdr:from><xdr:col>(\d+)<\/xdr:col><xdr:colOff>0<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row>.*?<xdr:ext cx="(\d+)" cy="(\d+)"\/>.*?r:embed="(rId\d)"/g)].map((m) => m.slice(1).join(','));
    assert.deepEqual(anchors, ['1,1,381000,381000,rId1', '1,2,190500,95250,rId1', '1,3,285750,200025,rId2']);
    const sheet = files.get('xl/worksheets/sheet1.xml') as string;
    assert.match(sheet, /<pageMargins [^>]*\/><drawing r:id="rId1"\/><\/worksheet>/);
    assert.match(sheet, /<row r="2" ht="30" customHeight="1">/, '40 px image: 30 pt row');
    assert.match(sheet, /<row r="3">/, 'a 10 px image keeps the default height');
    assert.match(sheet, /<row r="4" ht="15.75" customHeight="1">/);
    const cells = sheetCells(files);
    assert.equal(cells['B2'], 'North', 'the cell text is kept under the picture');
  });

  it("text: '' leaves the cell empty; unusable images are skipped", async () => {
    const engine = makeEngine();
    const file = (await exportXlsx(engine, {}, regionImage((row) => (row.id === 's0' ? { data: RGB, width: 40, height: 40 } : { data: new Uint8Array([1, 2, 3]), width: 10, height: 10 }), { text: '' }))) as ExportFile;
    const files = unzip(file.data);
    const cells = sheetCells(files);
    assert.equal(cells['B2'], undefined);
    assert.equal([...(files.get('xl/drawings/drawing1.xml') as string).matchAll(/<xdr:oneCellAnchor>/g)].length, 1);
  });

  it('writes no drawing parts on the image-free path', async () => {
    const engine = makeEngine();
    for (const handlers of [{}, { cell: () => ({ style: { bold: true } }) }]) {
      const files = unzip(((await exportXlsx(engine, {}, handlers)) as ExportFile).data);
      assert.deepEqual([...files.keys()].filter((k) => /drawing|media|worksheets\/_rels/.test(k)), []);
      assert.doesNotMatch(files.get('[Content_Types].xml') as string, /png|jpeg|drawing/);
      assert.doesNotMatch(files.get('xl/worksheets/sheet1.xml') as string, /<drawing|customHeight/);
    }
  });
});

describe('PDF image cells', () => {
  it('draws JPEG and PNG XObjects once per distinct image, scaled into the cell', async () => {
    const engine = makeEngine();
    const bytes = await pdf(
      engine,
      regionImage((row) => (row.id === 's0' || row.id === 's3' ? { data: JPEG.slice(), width: 30, height: 20 } : row.id === 's1' ? { data: RGB, width: 400, height: 400 } : null)),
    );
    assert.equal(checkXref(bytes), 1);
    const images = pdfImages(bytes);
    assert.equal(images.length, 2, 'one XObject per distinct image');
    const [jpeg, rgb] = images as [ImageObject, ImageObject];
    assert.equal(jpeg.dict, '/Type /XObject /Subtype /Image /Width 3 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode');
    assert.deepEqual([...jpeg.data], [...JPEG]);
    assert.equal(rgb.dict, '/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 2 >>');
    assert.deepEqual([...inflateSync(rgb.data)], [0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255]);
    const text = latin(bytes);
    assert.match(text, new RegExp(`/XObject << /Im0 ${jpeg.id} 0 R /Im1 ${rgb.id} 0 R >>`));
    const content = pdfStreams(bytes).join('\n');
    const draws = [...content.matchAll(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/(Im\d) Do Q/g)];
    assert.deepEqual(draws.map((m) => m[5]), ['Im0', 'Im1', 'Im0']);
    assert.deepEqual([draws[0]?.[1], draws[0]?.[2]], ['22.5', '15'], '30 x 20 px at 0.75 pt/px');
    // The 400 px image is scaled down to the 90 pt column (fit to page) minus padding, aspect kept.
    assert.equal(draws[1]?.[1], draws[1]?.[2]);
    assert.ok(Number(draws[1]?.[1]) > 83 && Number(draws[1]?.[1]) < 85);
    const shown = pdfStreams(bytes).flatMap(pdfText);
    assert.ok(shown.includes('South') && shown.includes('North'), 'cells without an image print their text');
    assert.ok(!shown.includes('East'), 'an image replaces the text of its cell');
  });

  it('decodes PNG with alpha into color plus /SMask across all PNG filters', async () => {
    const w = 3;
    const h = 5;
    const pixels: number[] = [];
    for (let i = 0; i < w * h; i++) pixels.push((i * 37) & 255, (i * 91) & 255, (i * 13) & 255, i % 2 ? 128 : 255);
    const rgba = png(w, h, 6, 8, pixels, { filters: true });
    const palette = png(2, 1, 3, 8, [0, 1], { extra: [['PLTE', new Uint8Array([10, 20, 30, 40, 50, 60])], ['tRNS', new Uint8Array([0])]] });
    const bytes = await pdf(makeEngine(), regionImage((row) => (row.id === 's0' ? { data: rgba, width: 30, height: 50 } : row.id === 's1' ? { data: palette, width: 20, height: 10 } : null)));
    checkXref(bytes);
    const images = pdfImages(bytes);
    assert.equal(images.length, 4, 'two images, two soft masks');
    const color = images[0] as ImageObject;
    const mask = images[1] as ImageObject;
    assert.equal(color.dict, `/Type /XObject /Subtype /Image /Width 3 /Height 5 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask ${mask.id} 0 R`);
    assert.equal(mask.dict, '/Type /XObject /Subtype /Image /Width 3 /Height 5 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode');
    assert.deepEqual([...inflateSync(color.data)], pixels.filter((_, i) => i % 4 !== 3));
    assert.deepEqual([...inflateSync(mask.data)], pixels.filter((_, i) => i % 4 === 3));
    assert.deepEqual([...inflateSync((images[2] as ImageObject).data)], [10, 20, 30, 40, 50, 60]);
    assert.deepEqual([...inflateSync((images[3] as ImageObject).data)], [0, 255]);
  });

  it('passes palette and gray PNG through, with a color-key mask for tRNS', async () => {
    const indexed = png(4, 1, 3, 2, [0b00011011], { extra: [['PLTE', new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255])]] });
    const gray = png(2, 1, 0, 8, [7, 9], { extra: [['tRNS', new Uint8Array([0, 7])]] });
    const bytes = await pdf(makeEngine(), regionImage((row) => (row.id === 's0' ? { data: indexed, width: 8, height: 2 } : row.id === 's1' ? { data: gray, width: 4, height: 2 } : null)));
    const [a, b] = pdfImages(bytes) as [ImageObject, ImageObject];
    assert.equal(a.dict, '/Type /XObject /Subtype /Image /Width 4 /Height 1 /ColorSpace [/Indexed /DeviceRGB 3 <000000ff000000ff000000ff>] /BitsPerComponent 2 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 2 /Columns 4 >>');
    assert.equal(b.dict, '/Type /XObject /Subtype /Image /Width 2 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Mask [7 7] /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent 8 /Columns 2 >>');
  });

  it('grows rows to the image and paginates by height with a correct page count', async () => {
    const engine = makeEngine({ rows: sales(200) });
    const plain = checkXref(await pdf(engine));
    const bytes = await pdf(engine, regionImage(() => ({ data: RGB, width: 100, height: 100 })), { footer: '{page} of {pages}' });
    const pages = checkXref(bytes);
    assert.ok(pages > plain * 3, `${pages} pages with 75 pt rows, ${plain} without`);
    const streams = pdfStreams(bytes);
    const footers = streams.flatMap(pdfText).filter((t) => / of /.test(t));
    assert.deepEqual(footers, Array.from({ length: pages }, (_, i) => `${i + 1} of ${pages}`));
    assert.equal(pdfImages(bytes).length, 1);
    const draws = streams.join('\n').match(/\/Im0 Do/g) ?? [];
    assert.equal(draws.length, 200);
  });

  it('falls back to the text for interlaced PNG and unknown bytes', async () => {
    const interlaced = png(1, 1, 2, 8, [1, 2, 3], { interlace: 1 });
    const bytes = await pdf(makeEngine(), regionImage((row) => (row.id === 's0' ? { data: interlaced, width: 10, height: 10 } : { data: new Uint8Array([0, 1, 2]), width: 10, height: 10 })));
    assert.equal(pdfImages(bytes).length, 0);
    assert.ok(pdfStreams(bytes).flatMap(pdfText).includes('North'));
    assert.doesNotMatch(latin(bytes), /\/XObject/);
  });

  it('writes the same bytes with an image-free cell hook as without a hook', async () => {
    for (const rows of [6, 200]) {
      const engine = makeEngine({ rows: sales(rows) });
      for (const options of [{}, { header: 'Sales {page}/{pages}', columnOverflow: 'paginate' as const }]) {
        const plain = await pdf(engine, {}, options);
        const hooked = await pdf(engine, { cell: () => null }, options);
        assert.ok(Buffer.from(plain).equals(Buffer.from(hooked)), `${rows} rows ${JSON.stringify(options)}`);
      }
    }
  });
});
