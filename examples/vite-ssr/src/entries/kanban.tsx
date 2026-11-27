// Client entry of the Kanban page (kanban.html, `?kanban`).
import '@salmonui/core/styles.css';
import '@salmonui/kanban/styles.css';
import '../app.css';
import { KanbanPage } from '../Kanban.tsx';
import { hydrate } from '../hydrate.tsx';

hydrate(<KanbanPage />);
