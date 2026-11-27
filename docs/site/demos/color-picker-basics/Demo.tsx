'use client';

import { useState } from 'react';
import { ColorPicker } from '@salmonui/inputs/color-picker';

const BRAND = [
  { label: 'Brand', colors: ['#e8590c', '#f08c00', '#2b8a3e', '#1971c2', '#5f3dc4'] },
  { label: 'Neutrals', colors: ['#ffffff', '#ced4da', '#868e96', '#343a40', '#000000'] },
];

// A confirm-mode popover with recent colors, and an immediate palette picker.
export default function ColorPickerBasicsDemo() {
  const [value, setValue] = useState<string | null>('#1971c2ff');
  const [recent, setRecent] = useState<readonly string[]>([]);
  const [accent, setAccent] = useState<string | null>('#e8590c');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'start' }}>
      <ColorPicker label="Theme color" description="Apply to keep, Cancel or Escape to discard" value={value} onValueChange={setValue} recentColors={recent} onRecentColorsChange={setRecent} clearable />
      <ColorPicker label="Accent" valueFormat="hex" commitBehavior="immediate" defaultMode="swatches" colors={BRAND} columns={5} value={accent} onValueChange={setAccent} />
      <output style={{ flexBasis: '100%' }}>
        Theme color {value ?? 'no color'}, accent {accent ?? 'no color'}
      </output>
    </div>
  );
}
