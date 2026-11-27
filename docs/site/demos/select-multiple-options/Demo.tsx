'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select, type SelectValue } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';

const TOPPINGS = ['Basil', 'Capers', 'Garlic', 'Mushrooms', 'Olives', 'Onions', 'Peppers', 'Pineapple', 'Rocket', 'Tomatoes'];

export default function SelectMultipleOptionsDemo() {
  const [log, push] = useEventLog();
  const [toppings, setToppings] = useState<readonly SelectValue[]>(['Basil', 'Olives']);
  const [hideSelected, setHideSelected] = useState(false);
  const [closeOnSelect, setCloseOnSelect] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
      <div role="group" aria-label="Options" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <Checkbox checked={hideSelected} onCheckedChange={(checked) => setHideSelected(checked)}>
          <code>hideSelected</code>
        </Checkbox>
        <Checkbox checked={closeOnSelect} onCheckedChange={(checked) => setCloseOnSelect(checked)}>
          <code>closeOnSelect</code>
        </Checkbox>
      </div>
      <span id="select-multiple-options-label">Toppings</span>
      <Select
        aria-labelledby="select-multiple-options-label"
        multiple
        data={TOPPINGS}
        valueSeparator=" · "
        hideSelected={hideSelected}
        closeOnSelect={closeOnSelect}
        showSelectAll
        value={toppings}
        onValueChange={(next, event) => {
          push(`onValueChange [${next.join(', ')}] (reason ${event.reason}, source ${event.source})`);
          setToppings(next);
        }}
        placeholder="Choose toppings"
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="outline" onClick={() => setToppings(TOPPINGS)}>
          Select all from code
        </Button>
        <Button variant="outline" onClick={() => setToppings([])}>
          Clear from code
        </Button>
      </div>
      <output>Value: [{toppings.join(', ')}]</output>
      <EventLog entries={log} />
    </div>
  );
}
