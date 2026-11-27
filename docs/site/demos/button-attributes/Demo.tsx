'use client';

import { useState, useSyncExternalStore } from 'react';
import { Button, ToggleButton } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';

const noopSubscribe = () => () => {};

// className / style passthrough, DOM attributes, handler composition and an
// SSR status: the server snapshot says "server HTML", the client "hydrated".
export default function ButtonAttributesDemo() {
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [locked, setLocked] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [archived, setArchived] = useState(0);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Button
          className="demo-archive-button"
          style={{ minInlineSize: 140, letterSpacing: '0.02em' }}
          data-analytics-id="archive"
          aria-describedby="demo-button-attributes-hint"
          onClick={() => setArchived((n) => n + 1)}
        >
          Archive ({archived})
        </Button>
        <ToggleButton
          pressed={pinned}
          onPressedChange={setPinned}
          onClick={(event) => {
            if (locked) event.preventDefault();
          }}
        >
          {pinned ? 'Pinned' : 'Pin'}
        </ToggleButton>
        <Checkbox checked={locked} onCheckedChange={(checked) => setLocked(checked)}>
          Lock pin
        </Checkbox>
      </div>
      <p id="demo-button-attributes-hint" style={{ margin: 0 }}>Archived items stay searchable for 30 days.</p>
      <p style={{ margin: 0 }}>
        Rendering: <output>{hydrated ? 'hydrated' : 'server HTML'}</output>
      </p>
    </div>
  );
}
