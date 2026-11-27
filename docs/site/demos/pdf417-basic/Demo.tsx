'use client';

import { Pdf417 } from '@salmonui/charts/barcode/pdf417';

const cell = { display: 'grid', gap: 4, justifyItems: 'start' } as const;

// PDF417 with automatic and fixed layouts, and Compact PDF417.
export default function Pdf417BasicDemo() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
      <div style={cell}>
        <span>Automatic columns and error correction</span>
        <Pdf417 value="Salmon UI PDF417 symbol" />
      </div>
      <div style={cell}>
        <span>2 columns, level 1</span>
        <Pdf417 value="PDF417 Symbology Standard" errorCorrection={1} columns={2} />
      </div>
      <div style={cell}>
        <span>Compact PDF417, taller rows</span>
        <Pdf417 value="Compact" compact rowHeightRatio={4} />
      </div>
    </div>
  );
}
