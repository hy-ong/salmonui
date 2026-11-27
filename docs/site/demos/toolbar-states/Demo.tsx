'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Slider } from '@salmonui/inputs/slider';
import { Toolbar, ToolbarItem, ToolbarSeparator } from '@salmonui/navigation/toolbar';

const icon = (d: string) => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const tools = [
  { name: 'Align left', d: 'M2 4h12M2 8h8M2 12h10' },
  { name: 'Align center', d: 'M2 4h12M4 8h8M3 12h10' },
  { name: 'Align right', d: 'M2 4h12M6 8h8M4 12h10' },
  { name: 'Bulleted list', d: 'M6 4h8M6 8h8M6 12h8M2.5 4h.5M2.5 8h.5M2.5 12h.5' },
  { name: 'Insert link', d: 'M7 9a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4L8 4M9 7a3 3 0 0 0-4 0L3 9a3 3 0 0 0 4 4l1-1' },
];

export default function ToolbarStatesDemo() {
  const [vertical, setVertical] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [showPrint, setShowPrint] = useState(true);
  const [blockHome, setBlockHome] = useState(false);
  const [width, setWidth] = useState(200);
  const [log, setLog] = useState<readonly string[]>([]);
  const add = (entry: string) => setLog((list) => [entry, ...list].slice(0, 5));
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox checked={vertical} onCheckedChange={(checked) => setVertical(checked)}>
          Vertical
        </Checkbox>
        <Checkbox checked={disabled} onCheckedChange={(checked) => setDisabled(checked)}>
          Disabled
        </Checkbox>
        <Checkbox checked={showPrint} onCheckedChange={(checked) => setShowPrint(checked)}>
          Show Print
        </Checkbox>
        <Checkbox checked={blockHome} onCheckedChange={(checked) => setBlockHome(checked)}>
          Block Home and End
        </Checkbox>
        {/* Inline like the checkboxes, so the row's controls share one axis. */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label>
            Width
            <Slider min={120} max={480} value={width} disabled={vertical} onValueChange={setWidth} style={{ inlineSize: 200 }} />
          </label>
          <output>{width}px</output>
        </span>
      </div>
      {/* Pushed to the inline end so the overflow menu has to shift to stay in the viewport. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Toolbar
          aria-label="Paragraph"
          orientation={vertical ? 'vertical' : 'horizontal'}
          overflow={vertical ? 'wrap' : 'menu'}
          disabled={disabled}
          style={vertical ? undefined : { inlineSize: width, maxInlineSize: '100%' }}
          onKeyDown={(event) => {
            if (blockHome && (event.key === 'Home' || event.key === 'End')) {
              event.preventDefault();
              add(`${event.key} blocked by onKeyDown`);
            } else {
              add(`key ${event.key}`);
            }
          }}
        >
          {tools.map((tool) => (
            <Button key={tool.name} aria-label={tool.name} iconOnly onClick={() => add(tool.name)}>
              {icon(tool.d)}
            </Button>
          ))}
          <ToolbarSeparator />
          <Button disabled onClick={() => add('Undo')}>
            Undo
          </Button>
          {showPrint ? <Button onClick={() => add('Print')}>Print</Button> : null}
        </Toolbar>
      </div>
      <div className="demo-log" aria-live="polite">
        {log.length === 0 ? (
          <span style={{ color: 'var(--salmon-text-secondary)' }}>No events yet.</span>
        ) : (
          <ol>
            {log.map((entry, index) => (
              <li key={`${index}-${entry}`}>{entry}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
