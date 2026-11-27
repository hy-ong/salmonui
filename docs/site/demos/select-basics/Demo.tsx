'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Select, type SelectValue } from '@salmonui/dropdowns/select';

const FRUITS = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'durian', label: 'Durian', disabled: true },
  { value: 'kiwi', label: 'Kiwi' },
  { value: 'lemon', label: 'Lemon' },
  { value: 'mango', label: 'Mango' },
  { value: 'peach', label: 'Peach' },
];

const COUNTRIES = ['Åland', 'Česko', 'Côte d’Ivoire', 'España', 'France', 'Ísland', 'México', 'Perú', 'Türkiye', 'Österreich'];

// A controlled Select, a searchable one with accent folding and highlighted
// matches, and a form field with a hidden native select.
export default function SelectBasicsDemo() {
  const [fruit, setFruit] = useState<SelectValue | null>('kiwi');
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 320 }}>
      <label style={{ display: 'grid', gap: 4 }}>
        <span id="demo-fruit-label">Fruit</span>
        <Select aria-labelledby="demo-fruit-label" data={FRUITS} value={fruit} onValueChange={setFruit} clearable placeholder="Pick a fruit" />
      </label>
      <output>Value: {String(fruit)}</output>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="demo-country-label">Country</span>
        <Select aria-labelledby="demo-country-label" data={COUNTRIES} searchable searchOperator="contains" ignoreAccents highlightMatches searchPlaceholder="Search countries" />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          alert(JSON.stringify([...new FormData(event.currentTarget)]));
        }}
        style={{ display: 'grid', gap: 8 }}
      >
        <span id="demo-size-label">Size (required)</span>
        <Select aria-labelledby="demo-size-label" name="size" required data={['S', 'M', 'L', 'XL']} placeholder="Choose a size" />
        <Button type="submit" style={{ justifySelf: 'start' }}>
          Submit
        </Button>
      </form>
    </div>
  );
}
