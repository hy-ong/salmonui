'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { Select } from '@salmonui/dropdowns/select';
import { ThemeStyle } from '@salmonui/core/server';
import { ThemeProvider } from '@salmonui/core/theme';
import { EventLog, useEventLog } from '../../components/demo-kit';

const SIZES = ['S', 'M', 'L', 'XL'];
const CITIES = ['Berlin', 'Lisbon', 'Nairobi', 'Osaka', 'Quito', 'Tallinn'];
const PLANS = [
  { value: 'team', label: 'Team' },
  { value: 'business', label: 'Business' },
];
const TAGS = ['Neu', 'Dringend', 'Rechnung', 'Versand', 'Retoure', 'Rückfrage'];
const TAGS_AR = [
  { value: 'new', label: 'جديد' },
  { value: 'urgent', label: 'عاجل' },
  { value: 'invoice', label: 'فاتورة' },
  { value: 'shipping', label: 'شحن' },
];

// German texts over the exported defaults; counts use Intl.PluralRules of `locale`.
const GERMAN = {
  selectedCount: (count: number, plural: Intl.LDMLPluralRule) => (plural === 'one' ? '1 Etikett' : `${count} Etiketten`),
  selectAll: 'Alle auswählen',
  deselectAll: 'Alle abwählen',
  noResults: 'Keine Treffer',
  clear: 'Leeren',
};

export default function DropdownFormsDemo() {
  const [log, push] = useEventLog();
  const [submitted, setSubmitted] = useState('(not submitted yet)');
  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 560 }}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(JSON.stringify([...new FormData(event.currentTarget)]));
        }}
        style={{ display: 'grid', gap: 12 }}
      >
        <div style={{ display: 'grid', gap: 4 }}>
          <label htmlFor="dd-forms-size">Size</label>
          <Select id="dd-forms-size" name="size" data={SIZES} placeholder="Choose a size" title="Shirt size" data-field="size" onValueChange={(value, event) => push(`size: ${String(value)} (reason ${event.reason})`)} />
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <span id="dd-forms-city">City</span>
          <Combobox aria-labelledby="dd-forms-city" name="city" data={CITIES} defaultValue="Lisbon" onValueChange={(value, event) => push(`city: ${String(value)} (reason ${event.reason})`)} />
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <span id="dd-forms-plan">Plan (read-only, still submitted)</span>
          <Select aria-labelledby="dd-forms-plan" name="plan" data={PLANS} defaultValue="team" readOnly />
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <span id="dd-forms-legacy">Legacy plan (disabled, not submitted)</span>
          <Select aria-labelledby="dd-forms-legacy" name="legacy" data={PLANS} defaultValue="business" disabled />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="submit">
            Submit
          </Button>
          <Button type="reset" variant="outline">
            Reset
          </Button>
        </div>
        <output>FormData: {submitted}</output>
      </form>
      <EventLog entries={log} />
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="dd-forms-styled">Styled with className, classNames, styles and a theme seed</span>
        <ThemeStyle theme={{ colors: { primary: '#0f766e' } }} />
        <ThemeProvider theme={{ colors: { primary: '#0f766e' } }}>
          <Select
            aria-labelledby="dd-forms-styled"
            data={SIZES}
            defaultValue="M"
            className="demo-dd-forms-select"
            style={{ inlineSize: 180 }}
            styles={{ trigger: { fontWeight: 600 }, option: { letterSpacing: '0.04em' } }}
          />
        </ThemeProvider>
      </div>
      <div lang="de" style={{ display: 'grid', gap: 4 }}>
        <span id="dd-forms-de">Etiketten (German texts, count display)</span>
        <Select aria-labelledby="dd-forms-de" multiple data={TAGS} valueDisplay="count" showSelectAll indicator="checkbox" searchable locale="de-DE" localeText={GERMAN} defaultValue={['Neu', 'Versand']} style={{ inlineSize: 240 }} />
      </div>
      <div dir="rtl" lang="ar" style={{ display: 'grid', gap: 4 }}>
        <span id="dd-forms-rtl">الوسوم (right to left)</span>
        <Combobox aria-labelledby="dd-forms-rtl" multiple data={TAGS_AR} defaultValue={['new', 'invoice']} />
      </div>
    </div>
  );
}
