// Client entry of the calendar pickers page (pickers.html, `?pickers`).
import '@salmonui/core/styles.css';
import '@salmonui/calendars/date-picker/styles.css';
import '@salmonui/calendars/date-range-picker/styles.css';
import '@salmonui/calendars/time-picker/styles.css';
import '../app.css';
import { Pickers } from '../Pickers.tsx';
import { hydrate } from '../hydrate.tsx';

hydrate(<Pickers />);
