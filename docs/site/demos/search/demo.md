---
title: Search
description: The toolbar search box over the `search` prop, with an initial text, the operator (including `wildcard` and `like` patterns), the searched columns, case and accent switches, highlighted matches, a non-searchable column, search methods and events.
---

The grid server-renders already searched for "Lyon".

With the `wildcard` operator `T*o` finds "Tokyo" (`*` is any run of
characters, `?` one character); with `like`, `Ma%` finds the values that
start with "Ma". Both patterns match the whole value.
