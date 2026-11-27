'use client';

import { useState } from 'react';
import { Select } from '@salmonui/dropdowns/select';
import { Scheduler, type SchedulerResource } from '@salmonui/scheduler';
import { ThemeProvider, type SalmonHexColor } from '@salmonui/core/theme';

type Row = { id: number; title: string; start: string; end: string; doctorId: number };

const doctors: SchedulerResource = {
  field: 'doctorId',
  name: 'doctors',
  label: 'Doctor',
  data: [
    { id: 1, text: 'Dr. Alvarez', color: '#2f9e44' },
    { id: 2, text: 'Dr. Brooks', color: '#9c36b5' },
    { id: 3, text: 'Dr. Chen', color: '#e8590c' },
  ],
};

const rows: Row[] = [
  { id: 1, title: 'Check-up', start: '2026-11-23T09:00', end: '2026-11-23T09:30', doctorId: 1 },
  { id: 2, title: 'Follow-up', start: '2026-11-23T10:00', end: '2026-11-23T10:30', doctorId: 2 },
  { id: 3, title: 'Consultation', start: '2026-11-24T11:00', end: '2026-11-24T12:00', doctorId: 3 },
  { id: 4, title: 'Vaccination', start: '2026-11-25T14:00', end: '2026-11-25T14:15', doctorId: 1 },
];

const WIDTHS = { phone: 380, tablet: 640, desktop: 1000 } as const;
const SEEDS: SalmonHexColor[] = ['#2563eb', '#0f766e', '#be185d'];
const WIDTH_ITEMS = Object.entries(WIDTHS).map(([key, px]) => ({ value: key, label: `${key} (${px} px)` }));
const SEED_ITEMS = SEEDS.map((s) => ({ value: s, label: s }));

/** The adaptive layout below a container width with one resource at a time, the color seeds and resource colors, and server-rendered events. */
export default function SchedulerAdaptiveThemingDemo() {
  const [width, setWidth] = useState<keyof typeof WIDTHS>('phone');
  const [primary, setPrimary] = useState<SalmonHexColor>('#2563eb');
  const [doctor, setDoctor] = useState<unknown>(2);
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Container
          <Select aria-label="Container" data={WIDTH_ITEMS} value={width} onValueChange={(value) => value != null && setWidth(value as keyof typeof WIDTHS)} />
        </label>
        <label>
          Primary seed
          <Select aria-label="Primary seed" data={SEED_ITEMS} value={primary} onValueChange={(value) => value != null && setPrimary(value as SalmonHexColor)} />
        </label>
      </div>
      <ThemeProvider theme={{ colors: { primary } }}>
        <div style={{ inlineSize: WIDTHS[width], maxInlineSize: '100%' }}>
          <Scheduler<Row>
            data={rows}
            resources={[doctors]}
            grouping={{ resources: ['doctors'] }}
            adaptive={{ breakpoint: 700 }}
            selectedResourceId={doctor}
            onSelectedResourceChange={(id) => setDoctor(id)}
            view="week"
            views={['day', 'week', 'month']}
            date="2026-11-23"
            timeZone="UTC"
            locale="en-GB"
            height={520}
            scrollTime="08:00"
          />
        </div>
      </ThemeProvider>
      <p className="demo-status" aria-live="polite">
        Shown resource: {String(doctor)}
      </p>
    </div>
  );
}
