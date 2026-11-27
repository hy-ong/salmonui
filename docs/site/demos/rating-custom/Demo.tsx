'use client';

import { useState } from 'react';
import { Rating } from '@salmonui/inputs/rating';

const FACES = ['😠', '🙁', '😐', '🙂', '😍'];

// A minimum value, highlighting only the selected item, custom full and
// empty icons, and items drawn by renderItem from their index and state.
export default function RatingCustomDemo() {
  const [stars, setStars] = useState(1);
  const [face, setFace] = useState(3);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Rating label="Hotel stars" min={1} value={stars} onValueChange={setStars} showLabel description="min={1}: one star is the lowest value" />
      <output>Stars: {stars}</output>
      <Rating
        label="How was your stay?"
        highlightSelectedOnly
        value={face}
        onValueChange={setFace}
        renderItem={({ index, state }) => (
          <span aria-hidden="true" style={{ fontSize: '1.5em', filter: state === 'empty' ? 'grayscale(1)' : 'none', opacity: state === 'empty' ? 0.45 : 1 }}>
            {FACES[index - 1]}
          </span>
        )}
        description="highlightSelectedOnly with renderItem: only the chosen face is in color"
      />
      <output>Face: {face}</output>
      <Rating label="Spiciness" icon="🌶️" emptyIcon="·" defaultValue={2} count={4} description="icon and emptyIcon replace the star" />
    </div>
  );
}
