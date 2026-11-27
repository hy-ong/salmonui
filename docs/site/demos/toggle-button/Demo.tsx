'use client';

import { useState } from 'react';
import { ToggleButton } from '@salmonui/buttons/button';

// An uncontrolled toggle and a controlled one whose state the parent owns.
export default function ToggleButtonDemo() {
  const [muted, setMuted] = useState(false);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <ToggleButton defaultPressed>Bold</ToggleButton>
      <ToggleButton variant="outline" tone="primary" pressed={muted} onPressedChange={setMuted}>
        Mute
      </ToggleButton>
      <span>Muted: {String(muted)}</span>
    </div>
  );
}
