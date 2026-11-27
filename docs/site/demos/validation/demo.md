---
title: Validation rules
description: Every built-in rule, an async custom validator, per-rule and localized messages, a row-level rule, and validateBatch in batch mode.
---

Double click a cell and type an invalid value: the editor shows the message
as you type and the row refuses to save. Try the voucher `WELCOME` (already
redeemed, checked asynchronously) or a five-star supplier with a minimum
order above 50 (row rule). In batch mode, `validateBatch()` checks every
pending change without saving.
