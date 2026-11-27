'use client';

import { useState } from 'react';
import { ColorArea, ColorField, ColorSlider, ColorSwatch, ColorSwatchPicker, parseColor, type Color } from '@salmonui/inputs/color-picker';

// The parts composed by hand around one `Color` (a `Color` keeps the hue of grays).
export default function ColorPickerPartsDemo() {
  const [color, setColor] = useState<Color>(() => parseColor('#7048e8'));
  return (
    <div style={{ display: 'grid', gap: 12, inlineSize: 240 }}>
      <ColorArea aria-label="Shade" value={color} onValueChange={setColor} />
      <ColorSlider channel="hue" value={color} onValueChange={setColor} />
      <ColorSlider channel="alpha" value={color} onValueChange={setColor} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
        <ColorSwatch color={color} style={{ inlineSize: 32, blockSize: 32 }} />
        <ColorField label="Color" valueFormat="rgb" value={color} onValueChange={(_, d) => d.color && setColor(d.color)} />
      </div>
      <ColorSwatchPicker aria-label="Presets" columns={6} colors={['#f03e3e', '#f59f00', '#37b24d', '#1c7ed6', '#7048e8', '#495057']} value={color.toString('hex')} onValueChange={(_, d) => d.color && setColor(d.color)} />
      <output>{color.toString('hsl')}</output>
    </div>
  );
}
