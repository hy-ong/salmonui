---
title: GS1 DataBar
description: Gs1DataBar from @salmonui/charts/barcode/gs1-databar: Omnidirectional, Truncated, Stacked, Stacked Omnidirectional, Limited, Expanded and Expanded Stacked with segmentsPerRow.
category: Barcodes
order: 35
demos: [gs1-databar-variants]
---

```tsx
import { Gs1DataBar } from '@salmonui/charts/barcode/gs1-databar';
import '@salmonui/charts/barcode/styles.css';

<Gs1DataBar value="(01)09501101530003" />;
<Gs1DataBar variant="expandedStacked" segmentsPerRow={4} value="(01)98898765432106(3202)012345(15)991231" />;
```

`Gs1DataBar` lives in `@salmonui/charts/barcode/gs1-databar` and draws all
seven variants through one `variant` prop; it shares the SVG output, color, size,
quiet zone, label, invalid-value and `BarcodeApi` export options of `Barcode`
and uses the barcode stylesheet. It is a subpath of its own so a page that
only needs 1D codes or QR codes never downloads its encoder (and this one
never downloads theirs). The encoder follows ISO/IEC 24724 and reproduces the standard's
published example symbols module for module.

| `variant` | Data | Height |
| --- | --- | --- |
| `'omnidirectional'` (default) | A GTIN: 13 digits, 14 digits with its check digit, or `(01)` and 14 digits | 33X |
| `'truncated'` | As above | 13X |
| `'stacked'` | As above | Two rows, 5X and 7X, with a separator |
| `'stackedOmnidirectional'` | As above | Two 33X rows with three separator rows |
| `'limited'` | A GTIN starting with 0 or 1 | 10X |
| `'expanded'` | A GS1 element string, `(01)…(3202)…(15)…`, up to 74 numeric or 41 alphanumeric characters | 34X |
| `'expandedStacked'` | As `'expanded'` | 34X rows |

- `segmentsPerRow` (Expanded Stacked): symbol characters per row, an even
  number from 2 to 22 (default 4).
- Expanded picks the compressed encodation method from the element string
  (GTIN, weight, date, price and currency fields) and packs the rest with
  numeric, alphanumeric and ISO/IEC 646 general-purpose compaction.
- The human-readable text is the GTIN or element string with its application
  identifiers in parentheses; `text` replaces or hides it.
- A wrong check digit, a value out of range or a character outside the GS1
  character set renders the invalid state.

Like `Barcode`, the symbol is one `<svg role="img">` named by `label`
(default the value), renders its final markup on the server and draws only
as SVG (see
[Barcode](/docs/data-visualization/barcode#svg-only)).
`ref` gives a `BarcodeApi` for `toSVGString`, `toBlob`, `toDataURL` and
`export`. All props and types are in the
[API reference](/docs/reference/charts/barcode-gs1-databar).
