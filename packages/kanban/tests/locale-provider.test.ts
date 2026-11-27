import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { Kanban, type KanbanProps } from '@salmonui/kanban';

// The Kanban reads the nearest LocaleProvider; its
// own `localeText` still wins.

type Task = { id: number; title: string; status: string };
const base: KanbanProps<Task> = {
  data: [
    { id: 1, title: 'Write spec', status: 'todo' },
    { id: 2, title: 'Ship', status: 'done' },
  ],
  getCardId: (t) => t.id,
  columnField: 'status',
  columns: [
    { key: 'todo', header: 'To do', addButton: true, collapsible: true },
    { key: 'done', header: 'Done' },
  ],
  card: { headerField: 'title' },
  'aria-label': 'Tasks',
};
const board = (props: Partial<KanbanProps<Task>> = {}): ReactElement => h(Kanban as (p: KanbanProps<Task>) => ReactNode, { ...base, ...props } as KanbanProps<Task>);
const zh = (el: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, el));

describe('kanban under LocaleProvider', () => {
  it('provider text; own localeText wins', () => {
    const html = zh(board());
    assert.match(html, /aria-roledescription="看板"/);
    assert.match(html, /新增卡片/);
    assert.match(html, /收合 To do/);
    const own = zh(board({ localeText: { board: 'Board!' } }));
    assert.match(own, /aria-roledescription="Board!"/);
    assert.match(own, /收合 To do/);
  });
});
