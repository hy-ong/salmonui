# @salmonui/calendars

Calendar, DateField, TimeField, DatePicker, DateRangePicker and TimePicker for Salmon UI.

```sh
npm install @salmonui/calendars @salmonui/core react react-dom
```

`react` and `react-dom` `>=19` are peer dependencies. ESM only.
Every `@salmonui/*` package of an application must resolve to the same
version (they are released together and exact-pinned to each other);
`@salmonui/core` warns in development when a second copy loads.

```tsx
import { Calendar, RangeCalendar } from '@salmonui/calendars/calendar';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { TimePicker } from '@salmonui/calendars/time-picker';
```

Import the theme stylesheet once per application, then the
stylesheet of each family you use:

```tsx
import '@salmonui/core/styles.css'; // the theme, once per application
import '@salmonui/calendars/calendar/styles.css';
```

Each family has its own `@salmonui/calendars/<family>/styles.css`.
A family stylesheet carries its own rules and those of every family and shared
module it renders, so it is the only stylesheet that family needs.

Public entry points:

- `@salmonui/calendars/calendar`
- `@salmonui/calendars/date-field`
- `@salmonui/calendars/date-picker`
- `@salmonui/calendars/date-picker/data-grid`
- `@salmonui/calendars/date-range-picker`
- `@salmonui/calendars/time-picker`

## License

MIT
