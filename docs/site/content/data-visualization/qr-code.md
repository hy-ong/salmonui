---
title: QRCode
description: A zero-dependency QR Code encoder and SVG component with automatic modes and versions 1 to 40, the four error correction levels, mask selection, GS1 element strings and a logo in a cleared center.
category: Barcodes
order: 20
demos: [qr-code-basic]
---

```tsx
import { QRCode } from '@salmonui/charts/barcode';
import '@salmonui/charts/barcode/styles.css';

<QRCode value="https://salmonui.dev" errorCorrection="q" />;
```

`import { QRCode } from '@salmonui/charts/barcode'` alone stays under 6 KB
gzip: it imports only the QR encoder, not the 1D or Data Matrix code.

## Encoding

- `mode`: `'auto'` (default) picks numeric, alphanumeric or byte (UTF-8),
  whichever encodes the whole value; or force one.
- `version`: `'auto'` (default, the smallest of 1 to 40 that fits) or a fixed
  version; a value that does not fit renders the invalid state.
- `errorCorrection: 'l' | 'm' | 'q' | 'h'` (default `'m'`), Reed-Solomon over
  GF(256) with the ISO block structure; the mask with the lowest ISO penalty
  is chosen unless `mask` forces one. A version 40 symbol encodes in a few
  milliseconds.
- `gs1`: the value is a GS1 element string (`(01)…(10)…`), encoded with FNC1
  in first position.

## Logo

`logo` (any React content) is centered over a cleared area of about 22 % of
the symbol width, and the default error correction rises to `'h'` so the
covered modules are recoverable. An explicit `errorCorrection`
still wins.

## Shared options

`moduleSize` (default 4 px) or `width` (width and height, the symbol is
square), `quietZone`, `text` (a caption under the symbol, off by default),
`color`, `background`, `label`, `invalidLabel`, `onInvalid` and the `ref`
API (`QRCodeApi`, the same as `BarcodeApi`) work as on
[Barcode](/docs/data-visualization/barcode). The symbol is one
`<svg role="img">` named by `label` (default the value), renders its final
markup on the server, and draws only as SVG (see
[Barcode](/docs/data-visualization/barcode#svg-only)).

All props and types are in the
[API reference](/docs/reference/charts/barcode).
