'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Listbox, type ListboxKey } from '@salmonui/dropdowns/listbox';

interface Message {
  value: string;
  label: string;
}

const messages: Message[] = [
  { value: 'm1', label: 'Quarterly report' },
  { value: 'm2', label: 'Team lunch on Friday' },
  { value: 'm3', label: 'Release checklist' },
  { value: 'm4', label: 'Design review notes' },
  { value: 'm5', label: 'Travel booking' },
];

// An SVG glyph at the `sm` icon size (14px), filled when starred; never a font character.
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
    </svg>
  );
}

const swatches = ['Coral', 'Amber', 'Lime', 'Teal', 'Sky', 'Indigo', 'Violet', 'Rose', 'Slate', 'Sand', 'Moss', 'Ink'].map((label) => ({ value: label.toLowerCase(), label }));

export default function ListboxGridDemo() {
  // Rows that hold their own buttons: Tab or Right Arrow reaches them, Up / Down move between rows.
  const [selected, setSelected] = useState<ListboxKey | null>('m2');
  const [starred, setStarred] = useState<readonly string[]>(['m3']);
  // A gallery of tiles, four per row: arrows move in two dimensions, Enter or Space picks.
  const [swatch, setSwatch] = useState<ListboxKey | null>('teal');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'start' }}>
      <div style={{ minWidth: 280 }}>
        <p id="listbox-grid-rows">Messages</p>
        <Listbox
          layout="grid"
          data={messages}
          value={selected}
          onValueChange={(value) => setSelected(value)}
          aria-labelledby="listbox-grid-rows"
          styles={{ option: { blockSize: 40 } }}
          renderItem={({ item, label }) => (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}>{label}</span>
              <Button
                variant="ghost"
                iconOnly
                aria-pressed={starred.includes(item.value)}
                aria-label={`Star ${label}`}
                onClick={() => setStarred((s) => (s.includes(item.value) ? s.filter((v) => v !== item.value) : [...s, item.value]))}
              >
                <StarIcon filled={starred.includes(item.value)} />
              </Button>
            </span>
          )}
        />
        <p>
          Selected: <output>{String(selected)}</output>; starred: <output>{starred.join(', ') || 'none'}</output>
        </p>
      </div>
      <div style={{ minWidth: 280 }}>
        <p id="listbox-grid-gallery">Accent swatch</p>
        <Listbox
          layout="grid"
          columns={4}
          data={swatches}
          value={swatch}
          onValueChange={(value) => setSwatch(value)}
          maxVisibleItems={3}
          aria-labelledby="listbox-grid-gallery"
          styles={{ option: { blockSize: 56, justifyContent: 'center' } }}
        />
        <p>
          Swatch: <output>{String(swatch)}</output>
        </p>
      </div>
    </div>
  );
}
