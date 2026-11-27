// Client entry of the zh-TW locale page (locale.html, `?locale`).
import '@salmonui/core/styles.css';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/calendars/date-picker/styles.css';
import '@salmonui/data-grid/styles.css';
import '@salmonui/dropdowns/select/styles.css';
import '@salmonui/inputs/form/styles.css';
import '@salmonui/inputs/number-field/styles.css';
import '@salmonui/inputs/text-field/styles.css';
import '../app.css';
import { LocalePage } from '../Locale.tsx';
import { hydrate } from '../hydrate.tsx';

hydrate(<LocalePage />);
