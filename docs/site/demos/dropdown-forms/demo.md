---
title: Dropdown forms and appearance
description: A form with a placeholder, read-only and disabled fields, DOM attributes, submission and reset; styling through className, part maps and a theme seed; localized texts with plural counts; and a right-to-left chip field.
category: dropdowns
---

Submit the form to see what `FormData` holds: the read-only plan is
submitted, the disabled one is not. Change the size and the city, then
press Reset: both return to their initial values and the log shows
`reason reset`. The size Select gets `id`, `title` and `data-field` on its
trigger (inspect it). The styled Select takes `className`, a width through
`style`, and `styles` for the trigger and options, inside a theme scope with
a teal primary seed (colors are the only theme input). The German Select
shows its count with `localeText.selectedCount` and `Intl.PluralRules` for
`de-DE`; open it for the German "select all" text. The right-to-left chip
field mirrors its layout: the chips start at the right edge, and the chip
keys mirror too, so Right Arrow (not Left) moves from the empty input to the
last chip and on toward the first.
