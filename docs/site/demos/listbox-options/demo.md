---
title: Listbox data shapes and options
description: A primitive array, nested objects read through accessors, unique values behind equal labels, a checkbox at the inline end, a fixed height and per-option props.
category: dropdowns
---

The sizes list is a plain `string[]`: each string is its own value and
label. The offices list reads nested objects through `getItemValue` and
`getItemLabel`; two offices are both labelled "Springfield", so the value is
the office code, which is unique (a duplicate value would log a development
warning). Its checkboxes sit at the inline end (`indicatorPosition="end"`),
the list is four items tall (`maxVisibleItems={4}`), and `getItemProps` adds
a tooltip and a `data-closed` attribute to closed offices.
