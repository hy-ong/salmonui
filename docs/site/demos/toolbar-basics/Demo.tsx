'use client';
import { useState } from 'react';
import { Button, ToggleButton } from '@salmonui/buttons/button';
import { MenuButton } from '@salmonui/buttons/menu';
import { NumberField } from '@salmonui/inputs/number-field';
import { Toolbar, ToolbarGroup, ToolbarItem, ToolbarSeparator, ToolbarSpacer } from '@salmonui/navigation/toolbar';

const icon = (d: string) => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export default function ToolbarBasicsDemo() {
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [last, setLast] = useState('nothing yet');
  return (
    <div>
      <Toolbar aria-label="Formatting" overflow="wrap">
        <ToggleButton aria-label="Bold" iconOnly pressed={bold} onPressedChange={setBold}>
          {icon('M5 3h4a2.5 2.5 0 0 1 0 5H5zM5 8h5a2.5 2.5 0 0 1 0 5H5z')}
        </ToggleButton>
        <ToggleButton aria-label="Italic" iconOnly pressed={italic} onPressedChange={setItalic}>
          {icon('M10 3H7M9 13H6M9 3 7 13')}
        </ToggleButton>
        <ToolbarSeparator />
        <ToolbarItem label="Font size">
          <NumberField aria-label="Font size" defaultValue={14} min={8} max={72} style={{ inlineSize: 96 }} />
        </ToolbarItem>
        <ToolbarSpacer />
        <ToolbarGroup align="end" aria-label="Document">
          <Button title="Save the document" onClick={() => setLast('Save')}>
            Save
          </Button>
          <MenuButton
            items={[
              { id: 'export', label: 'Export…' },
              { id: 'print', label: 'Print' },
            ]}
            onAction={(event) => setLast(event.id)}
          >
            More
          </MenuButton>
        </ToolbarGroup>
      </Toolbar>
      <p className="demo-status">
        Bold {bold ? 'on' : 'off'}, italic {italic ? 'on' : 'off'}. Last action: {last}
      </p>
    </div>
  );
}
