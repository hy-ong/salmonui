'use client';

import { useState } from 'react';
import { Slider } from '@salmonui/inputs/slider';

// A filled single slider with a live and a committed value, a currency range with ticks, discrete sizes and a vertical slider.
export default function SliderBasicsDemo() {
  const [live, setLive] = useState(40);
  const [committed, setCommitted] = useState(40);
  return (
    <div style={{ display: 'grid', gap: 24, maxInlineSize: 360 }}>
      <Slider label="Volume" defaultValue={40} fill valueLabel={{ show: 'focus' }} onValueChange={setLive} onValueCommit={setCommitted} />
      <output>
        Live {live}, committed {committed}
      </output>
      <Slider
        label="Price"
        defaultValue={[200, 600]}
        max={1000}
        step={50}
        minStepsBetweenThumbs={2}
        formatOptions={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
        ticks={{ placement: 'after', majorStep: 250, minorStep: 50, showMinor: true }}
      />
      <Slider label="Size" values={['XS', 'S', 'M', 'L', 'XL']} defaultValue="M" ticks={{ placement: 'after' }} />
      <Slider label="Level" orientation="vertical" defaultValue={60} fill ticks={{ placement: 'after', majorStep: 25 }} />
    </div>
  );
}
