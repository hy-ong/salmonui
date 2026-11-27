import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { Gantt } from '@salmonui/gantt';

// The Gantt reads the nearest LocaleProvider: the
// zh-TW text and locale reach the columns and the chart; its own
// `localeText` / `locale` still win.

const tasks = [
  { id: 1, title: 'Project', parentId: null },
  { id: 2, title: 'Design', start: '2026-03-02', duration: 3, progress: 50, parentId: 1 },
];
const gantt = (props: Record<string, unknown> = {}): ReactElement => h(Gantt as never, { data: tasks, taskFields: { parentId: 'parentId' }, timeZone: 'UTC', id: 'g', ...props });
const zh = (el: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, el));

describe('gantt under LocaleProvider', () => {
  it('provider text and locale; own localeText and locale win', () => {
    const html = zh(gantt());
    assert.match(html, /任務名稱/);
    assert.match(html, /已完成 50%/);
    assert.doesNotMatch(html, /Task name/);
    const own = zh(gantt({ locale: 'en-US', localeText: { columnTitle: 'Name' } }));
    assert.match(own, />Name</);
    assert.match(own, /工期/);
    assert.match(own, /Mar 2, 2026/);
  });
});
