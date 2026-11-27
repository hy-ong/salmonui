'use client';

import { useState } from 'react';
import { Checkbox, CheckboxGroup } from '@salmonui/inputs/checkbox';

// A parent checkbox in the mixed state over a CheckboxGroup, and label placement.
export default function CheckboxBasicsDemo() {
  const [toppings, setToppings] = useState<readonly string[]>(['basil']);
  const all = ['basil', 'olives', 'chili'];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Checkbox checked={toppings.length === all.length} indeterminate={toppings.length > 0 && toppings.length < all.length} onCheckedChange={(checked) => setToppings(checked ? all : [])}>
        All toppings
      </Checkbox>
      <CheckboxGroup label="Toppings" name="toppings" value={toppings} onValueChange={setToppings} orientation="horizontal">
        <Checkbox value="basil">Basil</Checkbox>
        <Checkbox value="olives">Olives</Checkbox>
        <Checkbox value="chili">Chili</Checkbox>
      </CheckboxGroup>
      <Checkbox labelPlacement="start" description="Label before the box">
        Remember me
      </Checkbox>
      <output>Value: {JSON.stringify(toppings)}</output>
    </div>
  );
}
