---
title: Avatar
description: Initials, image or icon avatars in five sizes, two shapes and six tones, with an image error fallback and an overlapping AvatarGroup with a +N overflow.
category: Display
order: 10
demos: [avatar]
---

`Avatar` shows a person or entity as an image, initials or an icon. It
lives in `@salmonui/layout/avatar` with its own stylesheet. The entry is not
a client module: an avatar renders in React Server Components, and only
the image error fallback is a tiny client island.

```tsx
import { Avatar, AvatarGroup } from '@salmonui/layout/avatar';
import '@salmonui/layout/avatar/styles.css';

<Avatar name="Ada Lovelace" />
<Avatar src="/ada.png" name="Ada Lovelace" shape="circle" />
<AvatarGroup max={3} size="sm" aria-label="Reviewers">
  {people.map((p) => <Avatar key={p.id} name={p.name} src={p.photo} shape="circle" size="sm" />)}
</AvatarGroup>
```

<!-- demo: avatar -->

## Content

- `name` derives the initials: the first letter of the first and of the
  last word (`Ada Lovelace` is `AL`, `Plato` is `P`), upper-cased for
  `locale` (`initialsOf` is exported too). `children` replaces the text.
- `src` renders an `<img>` layered over the initials. When the image fails,
  a small client island hides it and the initials show. Because the image is
  rendered first, a cached image never flashes the initials, and the server
  HTML and the hydrated DOM match; an image that failed before hydration is
  caught on mount.
- `fallback` is shown when there is no name (an icon); it is decorative.

## Accessibility

With `alt` or `name` the avatar is an image: `role="img"` and an
`aria-label` (`alt` wins). Without either it is decorative
(`aria-hidden`), for use inside a control that already has a name.

## Appearance

| Prop | Values | Default |
| --- | --- | --- |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` (24, 32, 40, 56, 72 px), or a number in px (`size={22}`) | `'md'` |
| `shape` | `'square'` (rounded rectangle) or `'circle'` | `'square'` |
| `tone` | `'neutral' \| 'primary' \| 'info' \| 'success' \| 'warning' \| 'danger'` | `'neutral'` |
| `variant` | `'soft'` (a tinted fill, tone-colored initials) or `'solid'` (the tone fill, on-color initials) | `'soft'` |

A number sets the avatar to that many pixels and scales the initials with
it, for sizes between the named steps such as a 22px avatar beside the
account name in an app bar:

```tsx
<Avatar name="Olivia Lin" size={22} shape="circle" />
```

A numeric `size` sets no `data-size` attribute; the size travels in the
`--salmon-avatar-size` custom property on the element.

`variant="solid"` fills the avatar with its tone: a neutral solid avatar
is a gray disc with white initials (the secondary text color, so the
initials keep a 4.5:1 contrast), a primary one uses the primary color and
its on-color text.

```tsx
<Avatar name="Joyce" size={24} shape="circle" variant="solid" />
```

Tones come from the theme seeds; there is no name-to-color hashing. Other
colors go through `className` / `style` (an unsupported override). The
hooks are `data-size`, `data-shape`, `data-tone` and `data-variant` on `.salmon-avatar`.

## AvatarGroup

`AvatarGroup` (also `Avatar.Group`) stacks its children with an overlap
(`role="group"`; give it an `aria-label`). With `max`, the remaining
avatars collapse into one `+N` avatar whose label comes from
`localeText.more(count)` (default `"N more"`); `size` (named or px) and
`shape` style that avatar.

## Composition

- In a card header: `<Card.Header media={<Avatar … />}>` ([Card](/docs/layout/card)).
- In a display list item: `<ListItem><Avatar … /> Ada</ListItem>` ([List](/docs/layout/list)).
- With a notification badge: wrap the avatar in the Notifications
  category's overlay `Badge` with `overlap="circular"`, so the badge sits on
  the circle's edge instead of the box corner ([Badge](/docs/notifications/badge)).

```tsx
import { Avatar } from '@salmonui/layout/avatar';
import { Badge } from '@salmonui/notifications/badge';
import '@salmonui/layout/avatar/styles.css';
import '@salmonui/notifications/badge/styles.css';

<Badge content={3} overlap="circular" label="3 unread messages">
  <Avatar name="Ada Lovelace" shape="circle" />
</Badge>
<Badge dot overlap="circular" placement="bottomEnd" tone="success" label="Online">
  <Avatar name="Grace Hopper" shape="circle" />
</Badge>
```

Avatar and Badge stay independent: `/avatar` imports nothing from `/badge`,
so each page imports both stylesheets, and both render on the server.

The JavaScript is 0.87 KB gzip and the stylesheet 0.56 KB.

API reference: [`@salmonui/layout/avatar`](/docs/reference/layout/avatar).
