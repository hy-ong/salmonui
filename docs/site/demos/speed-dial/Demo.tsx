'use client';
import { useState } from 'react';
import { MenuButton, MenuItem } from '@salmonui/buttons/menu';

const plus = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M8 3v10M3 8h10" />
  </svg>
);

export default function SpeedDialDemo() {
  const [last, setLast] = useState('none');
  return (
    <div style={{ position: 'relative', minHeight: 220 }}>
      <p>
        Last action: <output>{last}</output>
      </p>
      <div style={{ position: 'absolute', insetBlockEnd: 16, insetInlineEnd: 16 }}>
        <MenuButton
          tone="primary"
          iconOnly
          aria-label="Actions"
          indicator={false}
          placement="top-end"
          onAction={(event) => setLast(event.id)}
          menu={
            <>
              <MenuItem id="copy">Copy</MenuItem>
              <MenuItem id="share" title="Share the link">
                Share
              </MenuItem>
              <MenuItem id="delete" disabled>
                Delete
              </MenuItem>
            </>
          }
        >
          {plus}
        </MenuButton>
      </div>
    </div>
  );
}
