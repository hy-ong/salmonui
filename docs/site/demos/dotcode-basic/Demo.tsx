'use client';

import { DotCode } from '@salmonui/charts/barcode/dotcode';

const cell = { display: 'grid', gap: 4, justifyItems: 'start' } as const;

// DotCode with an automatic size, a fixed column count and a GS1 element string.
export default function DotCodeBasicDemo() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 24 }}>
      <div style={cell}>
        <span>Automatic size</span>
        <DotCode value="Salmon UI" />
      </div>
      <div style={cell}>
        <span>21 columns</span>
        <DotCode value="Salmon UI" columns={21} />
      </div>
      <div style={cell}>
        <span>GS1</span>
        <DotCode value="(17)070620(10)ABC123456" gs1 moduleSize={3} />
      </div>
    </div>
  );
}
