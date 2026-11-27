---
title: Tree lazy children
description: A remote tree whose children load on expand through read({ parentRowId }), with the per-row load status, a failed child read reported by onError and a retry.
---

A fake remote source answers one level per read after 400 ms. The first
read asks for the roots (`parentRowId: null`); every expand of a folder
whose envelope says `hasChildren` asks for its children.
