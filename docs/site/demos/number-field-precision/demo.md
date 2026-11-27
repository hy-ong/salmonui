---
title: Number precision and clamping
description: NumberField decimals rounding the committed value, restrictDecimals refusing extra fraction digits while typing, clampBehavior blur or none, and details.formattedValue as the displayed text.
category: inputs
---

Type `1.23456` into Weight and press Tab: `decimals={2}` rounds the
committed value to 1.23 and the read-out shows `details.formattedValue`,
the text the blurred field displays. Turn on
`restrictDecimals` and try again: the third fraction digit is refused while
typing.

Type `150` into Age and press Tab. With `clampBehavior="blur"` the value
clamps to 99; switch to `none` and the value stays 150 while the field
reports the range error.
