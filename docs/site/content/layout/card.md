---
title: Card
description: A server-component card with header, media, body, actions and separator parts, vertical or horizontal, rendered as a div, an article or a link.
category: Containers
order: 10
demos: [card]
---

`Card` groups content about one subject. It ships as stable CSS classes
plus thin typed parts. None of the parts is a client component, so a card renders in React Server Components with no
JavaScript. It lives in `@salmonui/layout/card` with its own stylesheet.

```tsx
import { Card } from '@salmonui/layout/card';
import { Avatar } from '@salmonui/layout/avatar';
import { Button } from '@salmonui/buttons/button';
import '@salmonui/layout/card/styles.css';
import '@salmonui/layout/avatar/styles.css';
import '@salmonui/buttons/button/styles.css';

export function Profile() {
  return (
    <Card render={(props) => <article {...props} />}>
      <Card.Header media={<Avatar name="Ada Lovelace" shape="circle" />}>
        <Card.Title>Ada Lovelace</Card.Title>
        <Card.Description>Mathematician</Card.Description>
      </Card.Header>
      <Card.Body>Wrote the first algorithm intended for a machine.</Card.Body>
      <Card.Separator />
      <Card.Actions>
        <Button tone="primary">Follow</Button>
      </Card.Actions>
    </Card>
  );
}
```

<!-- demo: card -->

## Parts

| Part | Element and class |
| --- | --- |
| `Card` | `<div class="salmon-card">`; `render` swaps it (`<article>`, `<a>`) |
| `Card.Header` | `.salmon-card-header` with a `media` slot and a caption |
| `Card.Title` | `<h3 class="salmon-card-title">` (`level` 1 to 6) |
| `Card.Description` | `<p class="salmon-card-description">` |
| `Card.Media` | `.salmon-card-media`, full-bleed `<img>` / `<video>`, optional `title` overlay |
| `Card.Body` | `.salmon-card-body` |
| `Card.Actions` | `.salmon-card-actions`, `orientation: 'horizontal' \| 'vertical'` |
| `Card.Separator` | `<hr class="salmon-card-separator">` |

Every part is also exported flat (`CardHeader`, `CardTitle`, ...) for
server-component trees. The classes are stable styling hooks, so plain
markup with `.salmon-card` classes also works.

- The header `media` slot takes any node; for a round header image use
  `Avatar` with `shape="circle"`.
- `orientation="horizontal"` puts media and content side by side; it
  mirrors in RTL.
- Stacked sections inside a horizontal card have no dedicated class: nest
  `Card.Body` elements in your own grid.
- A whole-card link is `render={(p) => <a {...p} href="/ada" />}`; keep
  buttons out of a linked card.

The stylesheet is 0.70 KB gzip; the JavaScript is 0.62 KB.

API reference: [`@salmonui/layout/card`](/docs/reference/layout/card) and [`@salmonui/layout/avatar`](/docs/reference/layout/avatar).
