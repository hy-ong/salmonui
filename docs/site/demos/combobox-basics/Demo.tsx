'use client';

import { useState } from 'react';
import { Combobox, type ComboboxValue } from '@salmonui/dropdowns/combobox';

interface Fruit {
  readonly value: string;
  readonly label: string;
}

const FRUITS: Fruit[] = ['Apple', 'Apricot', 'Banana', 'Blueberry', 'Cherry', 'Grape', 'Kiwi', 'Lemon', 'Lime', 'Mango', 'Orange', 'Peach', 'Pear', 'Plum'].map((label) => ({ value: label.toLowerCase(), label }));

// An editable combobox with inline autofill, a creatable one, and typing
// MultiSelect chips with values added on blur.
export default function ComboboxBasicsDemo() {
  const [fruit, setFruit] = useState<ComboboxValue | null>(null);
  const [tags, setTags] = useState<readonly ComboboxValue[]>(['kiwi']);
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 360 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="demo-cbx-label">Fruit (autofill)</span>
        <Combobox aria-labelledby="demo-cbx-label" data={FRUITS} autofill value={fruit} onValueChange={setFruit} placeholder="Type a fruit" />
        <output>Value: {String(fruit)}</output>
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="demo-create-label">Fruit or your own</span>
        <Combobox aria-labelledby="demo-create-label" data={FRUITS} creatable onCreateItem={(text) => ({ value: text.toLowerCase(), label: text })} />
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="demo-tags-cbx-label">Tags</span>
        <Combobox aria-labelledby="demo-tags-cbx-label" multiple creatable commitOnBlur data={FRUITS} value={tags} onValueChange={setTags} onCreateItem={(text) => ({ value: text.toLowerCase(), label: text })} />
      </div>
    </div>
  );
}
