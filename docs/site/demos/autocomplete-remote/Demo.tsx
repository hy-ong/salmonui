'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Combobox, type ComboboxValue } from '@salmonui/dropdowns/combobox';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createDemoListSource } from '../../lib/demo-list-source';

interface Airport {
  readonly value: string;
  readonly label: string;
  readonly country: string;
}

const AIRPORTS: Airport[] = [
  ['AKL', 'Auckland', 'New Zealand'], ['ATH', 'Athens', 'Greece'], ['BCN', 'Barcelona', 'Spain'], ['BKK', 'Bangkok', 'Thailand'], ['BOG', 'Bogotá', 'Colombia'],
  ['CPT', 'Cape Town', 'South Africa'], ['DEL', 'Delhi', 'India'], ['DXB', 'Dubai', 'United Arab Emirates'], ['GRU', 'São Paulo', 'Brazil'], ['IST', 'Istanbul', 'Türkiye'],
  ['KEF', 'Reykjavík', 'Iceland'], ['LIM', 'Lima', 'Peru'], ['LIS', 'Lisbon', 'Portugal'], ['MAD', 'Madrid', 'Spain'], ['MEX', 'Mexico City', 'Mexico'],
  ['NBO', 'Nairobi', 'Kenya'], ['OSL', 'Oslo', 'Norway'], ['PRG', 'Prague', 'Czechia'], ['SCL', 'Santiago', 'Chile'], ['YUL', 'Montréal', 'Canada'],
].map(([value, label, country]) => ({ value: value as string, label: label as string, country: country as string }));

// AutoComplete over a remote source: suggestions load after typing, the
// list is busy while a read is pending and options render a custom template.
export default function AutocompleteRemoteDemo() {
  const [log, push] = useEventLog();
  const [source] = useState(() => createDemoListSource<Airport>({ rows: AIRPORTS, latency: 700, log: push }));
  const [showTrigger, setShowTrigger] = useState(false);
  const [value, setValue] = useState<ComboboxValue | null>(null);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
      <Checkbox checked={showTrigger} onCheckedChange={(checked) => setShowTrigger(checked)}>
        Show the popup button (<code>showTrigger</code>)
      </Checkbox>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="autocomplete-remote-label">Destination</span>
        <Combobox<Airport>
          aria-labelledby="autocomplete-remote-label"
          data={source}
          creatable
          showTrigger={showTrigger}
          minSearchLength={1}
          maxResults={8}
          searchOperator="contains"
          searchFields={['label', 'country']}
          ignoreAccents
          debounce={250}
          placeholder="City or country"
          renderItem={({ item, label }) => (
            <span>
              {label} <small>({item.value}, {item.country})</small>
            </span>
          )}
          value={value}
          onValueChange={(next) => setValue(next)}
        />
      </div>
      <p>
        Value: <output>{String(value)}</output>
      </p>
      <EventLog entries={log} label="Requests" />
    </div>
  );
}
