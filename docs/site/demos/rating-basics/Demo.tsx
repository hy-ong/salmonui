'use client';

import { useState } from 'react';
import { Rating } from '@salmonui/inputs/rating';

// Half precision with clearing, labels and the value bubble; a read-only exact average.
export default function RatingBasicsDemo() {
  const [value, setValue] = useState(3.5);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Rating label="Your rating" precision="half" value={value} onValueChange={setValue} onHoverChange={setHover} clearable showLabel showTooltip />
      <output>{hover === null ? `Value: ${value}` : `Preview: ${hover}`}</output>
      <Rating label="Average of 1,284 reviews" readOnly precision="exact" value={4.32} showLabel renderLabel={({ value: v }) => v.toFixed(2)} />
      <Rating label="Favorites" icon="♥" emptyIcon="♡" count={3} defaultValue={2} size="lg" />
    </div>
  );
}
