---
title: DotCode
description: DotCode from @salmonui/charts/barcode/dotcode: automatic or column-driven symbol size, GS1 element strings, Reed-Solomon error correction and automatic mask selection.
category: Barcodes
order: 45
demos: [dotcode-basic]
---

```tsx
import { DotCode } from '@salmonui/charts/barcode/dotcode';
import '@salmonui/charts/barcode/styles.css';

<DotCode value="(17)070620(10)ABC123456" gs1 />;
<DotCode value="Salmon UI" columns={21} />;
```

`DotCode` lives in `@salmonui/charts/barcode/dotcode`: it shares the SVG output, color, size,
quiet zone, label, invalid-value and `BarcodeApi` export options of `Barcode`
and uses the barcode stylesheet. It is a subpath of its own so a page that
only needs 1D codes or QR codes never downloads its encoder (and this one
never downloads theirs). The encoder follows
the AIM ISS DotCode specification (Rev 4.0) and reproduces its published
example symbols dot for dot.

- `columns`: the symbol width in dot columns, 5 to 200. By default the size is
  automatic, about 3:2 wide; the height follows from the data (width plus
  height is always odd).
- `gs1`: the value is a GS1 element string, `(01)…(17)…(10)…`; the encoder
  uses FNC1 between variable-length fields and the combined `(17)…(10)`
  codeword. Without `gs1` the value is ISO 8859-1 text, encoded with code
  sets A, B and C, shifts and a binary mode.
- Error correction is Reed-Solomon over GF(113) with interleaved blocks; the
  encoder scores the four masks (and their corner-lit variants when needed)
  and keeps the best, as the specification describes.
- Dots are drawn as square modules on the checkerboard of dot positions, with
  a 3-module quiet zone; `moduleSize` defaults to 4 px. No human-readable text
  is drawn unless `text` is set.

Like `Barcode`, the symbol is one `<svg role="img">` named by `label`
(default the value), renders its final markup on the server and draws only
as SVG (see
[Barcode](/docs/data-visualization/barcode#svg-only)).
`ref` gives a `BarcodeApi` for `toSVGString`, `toBlob`, `toDataURL` and
`export`. All props and types are in the
[API reference](/docs/reference/charts/barcode-dotcode).
