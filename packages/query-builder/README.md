# @salmonui/query-builder

QueryBuilder for Salmon UI with SQL and MongoDB import and export.

```sh
npm install @salmonui/query-builder @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { QueryBuilder } from '@salmonui/query-builder';
import { toSql, fromSql } from '@salmonui/query-builder/sql';
import { toMongo, fromMongo } from '@salmonui/query-builder/mongo';
```

Import the theme stylesheet once per application, then the
package stylesheet:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/query-builder/styles.css';
```

Components of other Salmon UI packages that it renders need their own family
stylesheets too.

Public entry points:

- `@salmonui/query-builder`
- `@salmonui/query-builder/sql`
- `@salmonui/query-builder/mongo`

## Documentation

- QueryBuilder: <https://salmonui.dev/docs/inputs/query-builder>

## License

MIT
