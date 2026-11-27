import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';
import { Calendar, RangeCalendar } from '@salmonui/calendars/calendar';
import { DateField, TimeField } from '@salmonui/calendars/date-field';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { DateRangePicker } from '@salmonui/calendars/date-range-picker';
import { TimePicker } from '@salmonui/calendars/time-picker';

// Every calendars family reads the nearest LocaleProvider:
// the zh-TW pack and its locale reach the markup, the Calendar and
// DateField a picker composes read their own families, and a component's own
// `localeText` / `locale` still win over the provider.

const zh = (el: ReactElement): string => renderToString(h(LocaleProvider, { locale: 'zh-TW', localeText: zhTW }, el));

describe('calendars families under LocaleProvider', () => {
  it('calendar: provider text and locale; own localeText and locale win', () => {
    const html = zh(h(Calendar, { defaultValue: '2026-11-23', showWeekNumbers: true }));
    assert.match(html, /aria-label="上個月"/);
    assert.match(html, /aria-label="下個月"/);
    assert.match(html, /2026年11月/);
    assert.match(html, /aria-label="第 \d+ 週"/);
    assert.match(html, /abbr="週次"/);
    assert.doesNotMatch(html, /第 {2}週/);
    const own = zh(h(Calendar, { defaultValue: '2026-11-23', locale: 'en-US', localeText: { previousMonth: 'Back' } }));
    assert.match(own, /aria-label="Back"/);
    assert.match(own, /aria-label="下個月"/);
    assert.match(own, /November 2026/);
    assert.match(zh(h(RangeCalendar, { defaultValue: { start: '2026-11-02', end: '2026-11-05' } })), /aria-label="上個月"/);
  });

  it('dateField: DateField and TimeField read one family', () => {
    const html = zh(h(DateField, { 'aria-label': 'D' }));
    assert.match(html, /aria-valuetext="空白"/);
    assert.match(html, /aria-label="年"/);
    assert.match(html, />年<\/span>/);
    assert.match(zh(h(TimeField, { 'aria-label': 'T' })), /aria-label="時"/);
    assert.match(zh(h(DateField, { 'aria-label': 'D', localeText: { empty: 'Nothing' } })), /aria-valuetext="Nothing"/);
  });

  it('datePicker: own family, and the composed DateField reads its family', () => {
    const html = zh(h(DatePicker, { 'aria-label': 'Due', clearable: true, defaultValue: '2026-11-23' }));
    assert.match(html, /aria-label="選擇日期"/);
    assert.match(html, /aria-label="清除"/);
    assert.match(html, /aria-label="年"/);
    const own = zh(h(DatePicker, { 'aria-label': 'Due', localeText: { chooseDate: 'Pick' } }));
    assert.match(own, /aria-label="Pick"/);
    assert.match(own, />年<\/span>/);
  });

  it('dateRangePicker', () => {
    const html = zh(h(DateRangePicker, { 'aria-label': 'Stay' }));
    assert.match(html, /aria-label="選擇日期範圍"/);
    assert.match(html, /aria-label="開始日期"/);
    assert.match(html, /aria-label="結束日期"/);
    assert.match(zh(h(DateRangePicker, { 'aria-label': 'Stay', localeText: { startDate: 'From' } })), /aria-label="From"/);
  });

  it('timePicker', () => {
    const html = zh(h(TimePicker, { 'aria-label': 'At' }));
    assert.match(html, /aria-label="選擇時間"/);
    assert.match(html, /aria-label="時"/);
    assert.match(zh(h(TimePicker, { 'aria-label': 'At', localeText: { openTimeList: 'Times!' } })), /aria-label="Times!"/);
  });
});
