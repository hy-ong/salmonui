import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { RecurrenceEditor, Scheduler } from '@salmonui/scheduler';

// The scheduler families read the nearest LocaleProvider: the zh-TW pack and its locale reach the markup (the views read
// the resolved locale), the RecurrenceEditor family carries the summary
// text, and a component's own `localeText` / `locale` still win.

const zh = (el: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, el));
const data = [{ id: 1, title: 'Standup', start: '2026-11-23T09:00', end: '2026-11-23T09:30' }];

describe('scheduler families under LocaleProvider', () => {
  it('scheduler: provider text and locale; own localeText and locale win', () => {
    const props = { data, view: 'week', date: '2026-11-23', timeZone: 'UTC' } as const;
    const html = zh(h(Scheduler, props));
    assert.match(html, /今天/);
    assert.match(html, /全天/);
    assert.match(html, /2026年11月/);
    assert.doesNotMatch(html, /Nov 22/);
    const own = zh(h(Scheduler, { ...props, locale: 'en-US', localeText: { today: 'Now' } }));
    assert.match(own, /Now/);
    assert.match(own, /全天/);
    assert.match(own, /Nov 22 – 28, 2026/);
  });

  it('recurrenceEditor: editor and summary text; own localeText wins', () => {
    const props = { defaultValue: 'FREQ=WEEKLY;BYDAY=MO', start: '2026-11-23' } as const;
    const html = zh(h(RecurrenceEditor, props));
    assert.match(html, /aria-label="重複規則"/);
    assert.match(html, /每週的星期一/);
    assert.doesNotMatch(html, /每 1 /);
    assert.match(zh(h(RecurrenceEditor, { ...props, defaultValue: 'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=5' })), /每 2 個月的5日/);
    assert.match(html, /星期一/);
    const own = zh(h(RecurrenceEditor, { ...props, localeText: { repeat: 'Again', weeklyOn: 'Weekly: {days}' } }));
    assert.match(own, />Again</);
    assert.match(own, /Weekly: 星期一/);
  });
});
