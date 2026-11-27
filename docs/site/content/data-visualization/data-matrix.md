---
title: Data Matrix
description: Data Matrix as Barcode type="dataMatrix": ECC200 with ASCII, ASCII-numeric and Base256 encodation, every square and rectangular size and GS1 element strings.
category: Barcodes
order: 30
---

```tsx
import { Barcode } from '@salmonui/charts/barcode';
import '@salmonui/charts/barcode/styles.css';

<Barcode type="dataMatrix" value="https://salmonui.dev" size="auto" />;
```

Data Matrix is a `Barcode` type rather than a component of its own, because it
shares every rendering, text and export option with the 1D symbologies.

- `encoding: 'auto' | 'ascii' | 'asciiNumeric' | 'base256'`: ASCII packs digit
  pairs into one codeword and uses the upper shift for characters 128 to 255;
  `'auto'` switches to Base256 when that is shorter.
- `size: 'auto'` (default, the smallest square), `'auto-rectangular'`, or any
  ECC200 size written `'<rows>x<cols>'`: `'10x10'` to `'144x144'` and the
  rectangular `'8x18'`, `'8x32'`, `'12x26'`, `'12x36'`, `'16x36'`, `'16x48'`.
  A value that does not fit the requested size renders the invalid state.
- `gs1`: the value is a GS1 element string, encoded with FNC1 (the
  [QRCode](/docs/data-visualization/qr-code) page covers GS1 for both).
- Error correction is ECC200 Reed-Solomon with the standard block
  interleaving; the symbol has no text unless `text` is set.
- `moduleSize` defaults to 4 px. Color, quiet zone, `label`, `onInvalid`,
  server rendering and the `ref` export API work as for every
  [Barcode](/docs/data-visualization/barcode) type.

Data Matrix props are part of `BarcodeProps` in the
[API reference](/docs/reference/charts/barcode).
