---
title: Mask tokens and editing
description: MaskedField custom tokens from a RegExp and from a string of allowed characters, details.masked and formatMasked, and the caret rules for typing, deleting and pasting.
category: inputs
---

The brand color mask `\#HHHHHH` uses a custom token `H` (a RegExp for one
hex digit) after a literal `#`; the grid reference uses `D`, a string of
allowed letters. Characters a position does not accept are refused.

The read-out under the color shows the raw value, `details.masked` and the
change reason. Below, `formatMasked(mask, raw)` formats whatever you type
in the plain input, without a component.

In the phone field, paste `4155550123` or `(415) 555-0123`: the paste is
masked character by character. Type in the middle: the caret skips the
literals. Backspace and Delete clear one position without shifting the
rest; select a range and type to replace it.
