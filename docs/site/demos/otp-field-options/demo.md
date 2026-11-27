---
title: One-time code options
description: OtpField with a controlled value the owner fills or clears, per-cell placeholders, an uppercase, lowercase or unchanged transform, and autoFocus when the code step appears.
category: inputs
---

The login code is controlled: "Fill from SMS" and "Clear" set `value` from
the owner, and typing reports through `onValueChange`. Its empty cells show
the `placeholder` characters.

Type letters into the voucher and switch `transform`: the value is stored
upper-case, lower-case or as typed. "Send confirmation code" mounts a third
field with the native `autoFocus`, so focus lands in it without a click.
