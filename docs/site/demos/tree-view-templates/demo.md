---
title: Tree View items and templates
description: SVG icons per item, link items that follow on a click anywhere on the row, tooltips through getItemProps and a renderItem template with unread badges.
category: navigation
---

Hover a row for its tooltip; **Installation**, **Theming** and **Changelog**
are links. Items with unread entries show a badge rendered by `renderItem`.

`getItemProps` (the tooltip `title`) and `renderItem` (the badge) customize
each row: they are pure and run only for the rows that are
rendered, never touching the DOM afterwards.
