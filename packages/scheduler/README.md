# @salmonui/scheduler

Scheduler for Salmon UI: day, week, month, agenda and timeline views with recurrence, resources and iCalendar data.

```sh
npm install @salmonui/scheduler @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { Scheduler, RecurrenceEditor } from '@salmonui/scheduler';
```

Import the theme stylesheet once per application, then the
package stylesheet,
after the stylesheets of the components it renders from other packages:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/buttons/button/styles.css';
import '@salmonui/buttons/menu/styles.css';
import '@salmonui/calendars/date-picker/styles.css';
import '@salmonui/dropdowns/select/styles.css';
import '@salmonui/dropdowns/combobox/styles.css';
import '@salmonui/overlays/popover/styles.css';
import '@salmonui/overlays/tooltip/styles.css';
import '@salmonui/scheduler/styles.css';
```

Public entry points:

- `@salmonui/scheduler`

## Documentation

- Scheduler: <https://salmonui.dev/docs/calendars/scheduler>
- RecurrenceEditor: <https://salmonui.dev/docs/calendars/recurrence-editor>

## License

MIT
