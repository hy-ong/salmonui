---
title: Barcode encoder and validation
description: Code 11, Codabar, Code 32, Code 93 and Code 93 Extended from a text field with onInvalid reasons, plus a Data Matrix with selectable encodation and symbol size and GS1 element strings in Data Matrix and QR Code.
category: data-visualization
---

Pick a linear symbology and type: a value the symbology cannot encode
renders an empty `role="img"` named by `invalidLabel` and calls
`onInvalid({ reason })` instead of throwing (try letters in Code 11 or
Code 32, or lowercase in Code 93).

The Data Matrix takes an encodation (`auto`, `ascii`, `asciiNumeric`,
`base256`) and a symbol size (`auto`, `auto-rectangular` or `rows x
columns`). The GS1 content sets `gs1`, which starts both the Data Matrix
and the QR code with FNC1 and parses the `(AI)` element string. Some
combinations cannot encode, for example GS1 in Base 256, text in
`asciiNumeric` or a long value in a small fixed size; the status line shows
the reason.
