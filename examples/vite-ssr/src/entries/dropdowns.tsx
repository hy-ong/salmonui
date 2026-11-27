// Client entry of the dropdowns page (dropdowns.html, `?dropdowns`).
import '@salmonui/core/styles.css';
import '@salmonui/dropdowns/select/styles.css';
import '@salmonui/dropdowns/combobox/styles.css';
import '@salmonui/dropdowns/listbox/styles.css';
import '@salmonui/dropdowns/mention/styles.css';
import '@salmonui/dropdowns/tree-select/styles.css';
import '../app.css';
import { Dropdowns } from '../Dropdowns.tsx';
import { hydrate } from '../hydrate.tsx';

hydrate(<Dropdowns />);
