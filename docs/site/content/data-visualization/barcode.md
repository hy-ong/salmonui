---
title: Barcode
description: Zero-dependency 1D barcodes (Code 39, Code 11, Codabar, Code 32, Code 93, Code 128, GS1-128, EAN, UPC, ITF-14) and Data Matrix as one SVG path, with text, bearer bars, colors, invalid-value handling and image export.
category: Barcodes
order: 10
demos: [barcode-types, barcode-encoder]
---

```tsx
import { Barcode, type BarcodeApi } from '@salmonui/charts/barcode';
import '@salmonui/charts/barcode/styles.css';

<Barcode type="ean13" value="590123412345" />;
```

`Barcode` and `QRCode` live in `@salmonui/charts/barcode`. The encoders are
pure functions in the package (no dependency, no `measureText`), so the
server renders the final symbol and the client markup is identical.

The stacked and dot symbologies are subpaths of their own, so a page pays
only for the encoder it uses; they share every option below and the barcode
stylesheet:

| Component | Import | Page |
| --- | --- | --- |
| `Gs1DataBar` | `@salmonui/charts/barcode/gs1-databar` | [GS1 DataBar](/docs/data-visualization/gs1-databar) |
| `Pdf417` | `@salmonui/charts/barcode/pdf417` | [PDF417](/docs/data-visualization/pdf417) |
| `DotCode` | `@salmonui/charts/barcode/dotcode` | [DotCode](/docs/data-visualization/dotcode) |

## Symbologies

| `type` | Data | Notes |
| --- | --- | --- |
| `code39`, `code39Extended` | Code 39 set; Extended: ASCII 0 to 127 | `checksum` adds the mod-43 check character |
| `code11`, `codabar`, `code32`, `code93`, `code93Extended` | digits and `-`; Codabar with A to D start and stop; Code 32: 8 digits; Code 93 set or ASCII | Code 11 C and K checks, Code 32 check digit and base-32 encoding, Code 93 C and K checks |
| `code128` | ASCII 0 to 127 | Optimal automatic code set switching; `codeSet: 'a' \| 'b' \| 'c'` forces one |
| `ean8`, `ean13`, `upcA`, `upcE` | 7 / 12 / 11 / 6 digits, check digit optional | The check digit is computed when omitted and validated when given |
| `gs1Code128`, `itf14` | `(01)09501101530003(10)ABC`; 13 or 14 digits | GS1 application identifiers with FNC1 after variable-length fields |
| `dataMatrix` | ISO 8859-1 text | See [Data Matrix](/docs/data-visualization/data-matrix) |

## Text and layout

- `text`: `true` (default) shows the encoded value (EAN and UPC in their
  guard-separated groups), a string replaces it, `false` hides it;
  `textPosition: 'top' | 'bottom'`; `textAlign: 'start' | 'center' | 'end'`.
  The font is the system font.
- `moduleSize` (narrow bar width, default 2 px; 4 px for Data Matrix) or
  `width` / `height`; the quiet zone is kept unless `quietZone={false}`.
- `bearerBar: 'frame' | 'horizontal' | 'none'`, default `'frame'` for
  `itf14`.
- `color` / `background` are data colors (default black on white in both
  color schemes, because scanners need a dark symbol on a light background);
  development builds warn below 3:1 contrast.

## Invalid values

A value the symbology cannot encode never throws: the component renders an
empty `role="img"` whose name is the reason (`invalidLabel` customizes it) and
calls `onInvalid({ reason })`. Without `onInvalid`, development builds
log a warning instead.

```tsx
<Barcode type="ean13" value={input} onInvalid={({ reason }) => setError(reason)} />
```

<!-- demo: barcode-encoder -->

## Accessibility, RTL and output

The symbol is one `<svg role="img">` whose accessible name defaults to the
value (`label` overrides it), drawn as one path of merged module runs with
`shape-rendering="crispEdges"`. Symbols never mirror in right-to-left
pages. Barcodes are static images: they have no keyboard interaction and no
tab stop.

The encoders run during render as pure functions, so server rendering
(Next.js App Router, Vite SSR) produces the final symbol and hydration
changes nothing; the export code loads lazily on first use.

`ref` gives a `BarcodeApi` with `element`, `toSVGString()` (also without a
DOM), `toBlob(format)`, `toDataURL(format)` and `export({ format, fileName,
scale })` for PNG, JPEG or SVG:

```tsx
const barcode = useRef<BarcodeApi>(null);

<Barcode ref={barcode} type="code128" value="SALMON-42" />;
// later
await barcode.current?.export({ format: 'png', fileName: 'label.png' });
```

## SVG only

SVG is the only renderer; there is no render-mode prop. A barcode
is a few hundred rectangles, and SVG is crisp at every scale, prints well and
renders on the server, so a canvas mode would add code without a speed
benefit. When you need a raster image, call `api.toBlob('png')` or
`api.toDataURL('png')`.

All props and types are in the
[API reference](/docs/reference/charts/barcode).
