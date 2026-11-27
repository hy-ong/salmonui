'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Combobox, type ComboboxValue } from '@salmonui/dropdowns/combobox';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Code {
  readonly value: string;
  readonly label: string;
}

const AIRPORTS: Code[] = [
  ['AMS', 'Amsterdam'], ['CDG', 'Paris Charles de Gaulle'], ['FRA', 'Frankfurt'], ['HND', 'Tokyo Haneda'], ['ICN', 'Seoul Incheon'],
  ['JFK', 'New York JFK'], ['LHR', 'London Heathrow'], ['NRT', 'Tokyo Narita'], ['SIN', 'Singapore Changi'], ['SYD', 'Sydney'],
].map(([value, label]) => ({ value: value as string, label: `${value} · ${label}` }));

const CITIES = ['東京', '大阪', '京都', '札幌', '名古屋', '福岡', 'ソウル', '北京', '上海'];

// Created items must be three letters: anything else is rejected (onCreateItem returns null).
const createAirport = (text: string): Code | null => (/^[a-z]{3}$/i.test(text.trim()) ? { value: text.trim().toUpperCase(), label: `${text.trim().toUpperCase()} · custom code` } : null);

export default function ComboboxOptionsDemo() {
  const [log, push] = useEventLog();
  const [airport, setAirport] = useState<ComboboxValue | null>('LHR');
  const [text, setText] = useState('LHR · London Heathrow');
  const [showTrigger, setShowTrigger] = useState(true);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
      <Checkbox checked={showTrigger} onCheckedChange={(checked) => setShowTrigger(checked)}>
        Show the dropdown button
      </Checkbox>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="cbx-options-airport">Airport (or any three-letter code)</span>
        <Combobox<Code>
          aria-labelledby="cbx-options-airport"
          data={AIRPORTS}
          searchOperator="contains"
          creatable
          onCreateItem={(created) => {
            const item = createAirport(created);
            push(item ? `onCreateItem "${created}" → ${item.value}` : `onCreateItem "${created}" → rejected`);
            return item;
          }}
          showTrigger={showTrigger}
          value={airport}
          onValueChange={(next, event) => {
            push(`onValueChange ${String(next)} (reason ${event.reason}, source ${event.source})`);
            setAirport(next);
          }}
          inputValue={text}
          onInputChange={(next, event) => {
            push(`onInputChange "${next}" (reason ${event.reason})`);
            setText(next);
          }}
        />
      </div>
      <p>
        Value: <output>{String(airport)}</output> · Input text: <output>{text}</output>
      </p>
      <Button variant="outline" style={{ justifySelf: 'start' }} onClick={() => setText('Tokyo')}>
        Set the input text to “Tokyo”
      </Button>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="cbx-options-ime">都市 (type with a Japanese or Chinese input method)</span>
        <Combobox aria-labelledby="cbx-options-ime" lang="ja" data={CITIES} searchOperator="contains" onInputChange={(next, event) => push(`IME field onInputChange "${next}" (reason ${event.reason})`)} />
      </div>
      <EventLog entries={log} />
    </div>
  );
}
