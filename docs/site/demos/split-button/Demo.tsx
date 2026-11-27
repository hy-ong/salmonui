'use client';
import { useState } from 'react';
import { MenuGroup, MenuItem, MenuSeparator, SplitButton } from '@salmonui/buttons/menu';

export default function SplitButtonDemo() {
  const [status, setStatus] = useState('Not saved');
  return (
    <div>
      <div className="demo-toolbar">
        <SplitButton
          tone="primary"
          menuLabel="More save options"
          classNames={{ menu: 'demo-split-menu' }}
          styles={{ menu: { minInlineSize: 200 } }}
          onClick={() => setStatus('Saved')}
          onAction={(event) => setStatus(`Chose ${event.id}`)}
          menu={
            <>
              <MenuGroup label="Save">
                <MenuItem id="draft">Save as draft</MenuItem>
                <MenuItem id="copy">Save a copy</MenuItem>
              </MenuGroup>
              <MenuSeparator />
              <MenuGroup label="Export">
                <MenuItem id="pdf">Export as PDF</MenuItem>
                <MenuItem id="docx">Export as DOCX</MenuItem>
              </MenuGroup>
            </>
          }
        >
          Save
        </SplitButton>
        <SplitButton variant="outline" disabled items={[{ id: 'x', label: 'Unavailable' }]}>
          Disabled
        </SplitButton>
      </div>
      <p>
        <output>{status}</output>
      </p>
    </div>
  );
}
