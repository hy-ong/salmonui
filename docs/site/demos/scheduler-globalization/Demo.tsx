'use client';

import { useState } from 'react';
import { Select } from '@salmonui/dropdowns/select';
import { getTimeZoneOffset, Scheduler, toZonedDateTime, type SchedulerProps } from '@salmonui/scheduler';

type Row = { id: number; title: string; start: string; end: string; startTimeZone?: string; endTimeZone?: string; location?: string };

const rows: Row[] = [
  { id: 1, title: 'Berlin standup', start: '2026-11-24T09:00', end: '2026-11-24T09:30', startTimeZone: 'Europe/Berlin', endTimeZone: 'Europe/Berlin', location: 'Berlin' },
  { id: 2, title: 'New York sync', start: '2026-11-24T10:00', end: '2026-11-24T11:00', startTimeZone: 'America/New_York', endTimeZone: 'America/New_York', location: 'New York' },
  { id: 3, title: 'Tokyo review', start: '2026-11-25T17:00', end: '2026-11-25T18:00', startTimeZone: 'Asia/Tokyo', endTimeZone: 'Asia/Tokyo', location: 'Tokyo' },
  { id: 4, title: 'Release (UTC)', start: '2026-11-26T14:00:00Z', end: '2026-11-26T15:00:00Z' },
];

const ZONES = ['Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'Asia/Riyadh', 'UTC'];

type Setup = { label: string; props: Partial<SchedulerProps<Row>> };
const SETUPS: Record<string, Setup> = {
  en: { label: 'English (en-GB)', props: { locale: 'en-GB' } },
  de: {
    label: 'Deutsch (de-DE, localeText)',
    props: { locale: 'de-DE', localeText: { previous: 'Zurück', next: 'Weiter', today: 'Heute', viewDay: 'Tag', viewWeek: 'Woche', viewWorkWeek: 'Arbeitswoche', viewMonth: 'Monat', allDay: 'Ganztägig', save: 'Speichern', cancel: 'Abbrechen', delete: 'Löschen', edit: 'Bearbeiten', moreDetails: 'Weitere Details', addTitle: 'Titel hinzufügen', fieldTitle: 'Titel', fieldLocation: 'Ort', fieldStart: 'Beginn', fieldEnd: 'Ende' } },
  },
  ar: { label: 'العربية, Islamic calendar, RTL', props: { locale: 'ar-SA', calendar: 'islamic-umalqura', dir: 'rtl' } },
};

const ZONE_ITEMS = ZONES.map((z) => ({ value: z, label: z }));
const SETUP_ITEMS = Object.entries(SETUPS).map(([key, s]) => ({ value: key, label: s.label }));

/** Events in several IANA zones shown in a chosen zone, per-event zones in the editor, the time zone helpers, locales, localeText, the Islamic calendar and RTL. */
export default function SchedulerGlobalizationDemo() {
  const [zone, setZone] = useState('Europe/Berlin');
  const [setup, setSetup] = useState('en');
  const [data, setData] = useState<readonly Row[]>(rows);
  const release = '2026-11-26T14:00:00Z';
  const wall = toZonedDateTime(release, zone);
  const offset = getTimeZoneOffset(release, zone);
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Show in
          <Select aria-label="Show in" data={ZONE_ITEMS} value={zone} onValueChange={(value) => value != null && setZone(String(value))} />
        </label>
        <label>
          Language
          <Select aria-label="Language" data={SETUP_ITEMS} value={setup} onValueChange={(value) => value != null && setSetup(String(value))} />
        </label>
      </div>
      <Scheduler<Row>
        key={setup}
        data={data}
        view="week"
        views={['day', 'week', 'workWeek', 'month']}
        date="2026-11-23"
        timeZone={zone}
        timeZones={ZONES}
        startHour="00:00"
        scrollTime="08:00"
        height={520}
        onAdd={(e) => setData(e.data)}
        onSave={(e) => setData(e.data)}
        onDelete={(e) => setData(e.data)}
        {...SETUPS[setup]?.props}
      />
      <p className="demo-status" aria-live="polite">
        The release at {release}: <code>toZonedDateTime</code> gives {String(wall)} in {zone}, <code>getTimeZoneOffset</code> {offset} minutes.
      </p>
    </div>
  );
}
