'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Select } from '@salmonui/dropdowns/select';
import { Slider } from '@salmonui/inputs/slider';
import { Toolbar, ToolbarItem, ToolbarSeparator, type ToolbarOverflow } from '@salmonui/navigation/toolbar';

const MODES = ['menu', 'scroll', 'wrap'];
const actions = ['Cut', 'Copy', 'Paste', 'Undo', 'Redo', 'Find', 'Replace', 'Print'];

export default function ToolbarOverflowDemo() {
  const [mode, setMode] = useState<ToolbarOverflow>('menu');
  const [width, setWidth] = useState(360);
  const [last, setLast] = useState('nothing yet');
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Overflow{' '}
          <Select aria-label="Overflow" data={MODES} value={mode} onValueChange={(value) => value != null && setMode(value as ToolbarOverflow)} />
        </label>
        {/* Inline like the Overflow label, so the row's controls share one axis. */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label>
            Width
            <Slider min={160} max={720} value={width} onValueChange={setWidth} style={{ inlineSize: 200 }} />
          </label>
          <output>{width}px</output>
        </span>
      </div>
      <Toolbar aria-label="Edit" overflow={mode} scrollStep={100} style={{ inlineSize: width, maxInlineSize: '100%' }}>
        {actions.flatMap((name, index) => [
          index === 3 ? <ToolbarSeparator key="sep" /> : null,
          <ToolbarItem key={name} overflowPriority={name === 'Find' ? 1 : 0}>
            <Button onClick={() => setLast(name)}>{name}</Button>
          </ToolbarItem>,
        ])}
        <ToolbarItem overflow="always">
          <Button onClick={() => setLast('Settings')}>Settings</Button>
        </ToolbarItem>
      </Toolbar>
      <p className="demo-status">Last action: {last}</p>
    </div>
  );
}
