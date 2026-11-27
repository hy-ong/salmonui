# @salmonui/core

Shared foundation of Salmon UI: theme and locale providers, server theme styles, locale packs, data and query types, virtual-scroll math, validation, formatting, the export model with CSV, and the theme stylesheet.

```sh
npm install @salmonui/core
```

Every component package depends on it. `react` and `react-dom` `>=19` are
optional peers (only `/theme`, `/server` and `/locale` need React); the neutral
subpaths (`/format`, `/validation`, `/data`, `/virtual`, `/dates`,
`/export-model`, `/locale/zh-TW`) import neither React nor the DOM. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { ThemeProvider } from '@salmonui/core/theme';
import { ThemeStyle, createThemeCss } from '@salmonui/core/server';
import { createFormatter } from '@salmonui/core/format';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
```

Import the theme stylesheet (the theme variables only) once per application,
before any family stylesheet. Each family stylesheet carries the control
styles it renders (button, dialog, picker, visually hidden text):

```tsx
import '@salmonui/core/styles.css';
```

Public entry points:

- `@salmonui/core/theme`
- `@salmonui/core/server`
- `@salmonui/core/format`
- `@salmonui/core/validation`
- `@salmonui/core/data`
- `@salmonui/core/virtual`
- `@salmonui/core/dates`
- `@salmonui/core/export-model`
- `@salmonui/core/styles.css`

The `internal` subpaths are private to the Salmon UI packages: not part of the
public API and not covered by semver.

## License

MIT
