'use client';

import { useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { germanLocaleText } from '../../lib/locale-de';

interface Booking {
  readonly id: number;
  readonly guest: string;
  readonly arrival: Date;
  readonly checkIn: Date;
}

const bookings: Booking[] = [
  { id: 1, guest: 'Renée Dubois', arrival: new Date(Date.UTC(2026, 10, 2)), checkIn: new Date(Date.UTC(2026, 10, 2, 14, 30)) },
  { id: 2, guest: 'Kenji Sato', arrival: new Date(Date.UTC(2026, 10, 9)), checkIn: new Date(Date.UTC(2026, 10, 9, 16, 0)) },
  { id: 3, guest: 'Lena Fischer', arrival: new Date(Date.UTC(2026, 10, 18)), checkIn: new Date(Date.UTC(2026, 10, 18, 11, 15)) },
  { id: 4, guest: 'Somchai Wong', arrival: new Date(Date.UTC(2026, 11, 24)), checkIn: new Date(Date.UTC(2026, 11, 24, 20, 45)) },
];

const LOCALES = ['en-US', 'de-DE', 'en-GB', 'ar-EG', 'ja-JP-u-ca-japanese', 'th-TH'] as const;
const LOCALE_OPTIONS = LOCALES.map((l) => ({ value: l, label: l }));
const FIRST_DAY_OPTIONS = [
  { value: 'locale', label: 'From locale' },
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '6', label: 'Saturday' },
];

export default function DatePickerDemo() {
  const [locale, setLocale] = useState<string>('en-US');
  const [firstDay, setFirstDay] = useState<string>('locale');
  const columns = useMemo<DataGridColumn<Booking>[]>(() => {
    // `firstDayOfWeek` overrides the locale's week start (0 Sunday ... 6 Saturday).
    const editorProps = firstDay === 'locale' ? {} : { firstDayOfWeek: Number(firstDay) };
    return [
      { field: 'id', header: 'Id', type: 'number', primaryKey: true, width: 70 },
      { field: 'guest', header: 'Guest', width: 160 },
      { field: 'arrival', header: 'Arrival', type: 'date', format: 'yMMMd', width: 200, editorProps },
      { field: 'checkIn', header: 'Check-in', type: 'datetime', format: 'yMMMdHm', width: 240, editorProps },
    ];
  }, [firstDay]);
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Locale{' '}
          <Select aria-label="Locale" data={LOCALE_OPTIONS} value={locale} onValueChange={(value) => value != null && setLocale(String(value))} />
        </label>
        <label>
          First day of week{' '}
          <Select aria-label="First day of week" data={FIRST_DAY_OPTIONS} value={firstDay} onValueChange={(value) => value != null && setFirstDay(String(value))} />
        </label>
      </div>
      {/* Double-click (or F2) a date cell, then Alt+ArrowDown or the calendar button opens the picker. */}
      <DataGrid<Booking>
        aria-label="Bookings with date and date-time editors"
        data={bookings}
        columns={columns}
        height="auto"
        locale={locale}
        timeZone="UTC"
        dir="auto"
        editing={{ mode: 'cell' }}
        {...(locale === 'de-DE' ? { localeText: germanLocaleText } : {})}
      />
    </>
  );
}
