---
title: Tree View flat data
description: A team tree built from flat self-referential rows with getParentId, its expanded, selected and checked ids derived from per-row state fields, and siblings sorted with the English or Swedish collator.
category: navigation
---

- The rows are flat (`managerId` points at the parent); `getParentId`
  builds the hierarchy, no nested `children` arrays needed.
- Each row's `open`, `current` and `onboarded` fields become the initial
  `expanded`, `selected` and `checked` id lists, which the application
  then controls (the readouts follow every change).
- **Sort** orders siblings by `getItemLabel`; **Locale** switches the
  collator: in English Åsa sorts next to Adam, in Swedish Å comes after Z.
  `data order` (`sort={null}`) keeps the rows as given.
