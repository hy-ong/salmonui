'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Splitter } from '@salmonui/layout/splitter';
import { EventLog, useEventLog } from '../../components/demo-kit';

// An editor layout from a `panes` array: a fixed toolbar column, a collapsible
// outline whose collapse can be vetoed, the editor, and an inspector collapsed
// by id through its controlled `collapsed` prop.
export default function SplitterPanesDemo() {
  const [inspector, setInspector] = useState(false);
  const [lockOutline, setLockOutline] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [log, record] = useEventLog(6);
  return (
    <div>
      <div className="demo-toolbar">
        <Button variant="outline" aria-pressed={inspector} onClick={() => setInspector(!inspector)}>
          {inspector ? 'Expand inspector' : 'Collapse inspector'}
        </Button>
        <Checkbox checked={lockOutline} onCheckedChange={(checked) => setLockOutline(checked)}>
          Lock the outline (veto collapse)
        </Checkbox>
        <Checkbox checked={disabled} onCheckedChange={(checked) => setDisabled(checked)}>
          Disabled
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
      </div>
      <div dir={rtl ? 'rtl' : 'ltr'}>
        <Splitter
          aria-label="Editor layout"
          disabled={disabled}
          style={{ height: 220, border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)' }}
          onResizeStart={([a, b]) => record(`resize start: ${a} | ${b}`)}
          onSizesChange={(sizes) => record(`sizes: ${Object.entries(sizes).map(([id, s]) => `${id} ${s}`).join(', ')}`)}
          panes={[
            { id: 'tools', defaultSize: 56, resizable: false, content: <div className="demo-pane">Tools</div>, style: { background: 'var(--salmon-surface-sunken)' } },
            {
              id: 'outline',
              defaultSize: 160,
              minSize: 100,
              collapsible: true,
              collapsedSize: 24,
              content: <div className="demo-pane">Outline</div>,
              onCollapsedChange: (collapsed, event) => {
                if (lockOutline) event.preventDefault();
                record(`outline ${collapsed ? 'collapse' : 'expand'} requested (${event.source})${lockOutline ? ': vetoed' : ''}`);
              },
              onAfterCollapsedChange: (collapsed) => record(`outline ${collapsed ? 'collapsed' : 'expanded'}`),
            },
            { id: 'editor', minSize: 120, content: <div className="demo-pane">Editor</div> },
            {
              id: 'inspector',
              defaultSize: '25%',
              collapsible: true,
              collapsed: inspector,
              onCollapsedChange: (collapsed) => setInspector(collapsed),
              content: <div className="demo-pane">Inspector</div>,
            },
          ]}
        />
      </div>
      <EventLog entries={log} label="Splitter events" />
    </div>
  );
}
