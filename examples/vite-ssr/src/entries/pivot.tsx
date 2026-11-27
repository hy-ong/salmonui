// Client entry of the Pivot Table page (pivot.html, `?pivot`).
import '@salmonui/core/styles.css';
import '@salmonui/pivot-table/styles.css';
import '../app.css';
import { Pivot } from '../Pivot.tsx';
import { hydrate } from '../hydrate.tsx';

hydrate(<Pivot />);
