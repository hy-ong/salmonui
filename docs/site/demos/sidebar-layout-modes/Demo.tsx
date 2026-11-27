'use client';
import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { SidebarLayout, SidebarMain, SidebarPanel, SidebarTrigger, type SidebarPresentation } from '@salmonui/navigation/sidebar-layout';

// Placeholder links target this demo's own title (no dangling links in the static export).
const DEMO_ANCHOR = '#demo-sidebar-layout-modes-title';

const MODES = [
  { value: 'push', label: 'push' },
  { value: 'overlay', label: 'overlay' },
];
const SIDES = [
  { value: 'start', label: 'start' },
  { value: 'end', label: 'end' },
];

const CLOSE_ICON = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

const filters = ['All tasks', 'Assigned to me', 'Due this week', 'Completed'];

export default function SidebarLayoutModesDemo() {
  const [mode, setMode] = useState<SidebarPresentation>('push');
  const [side, setSide] = useState<'start' | 'end'>('start');
  const [rtl, setRtl] = useState(false);
  const [outsidePress, setOutsidePress] = useState(true);
  const [open, setOpen] = useState(true);
  const [last, setLast] = useState('nothing yet');
  return (
    <div dir={rtl ? 'rtl' : 'ltr'}>
      <div className="demo-toolbar">
        <label>
          Mode{' '}
          <Select
            aria-label="Mode"
            data={MODES}
            value={mode}
            onValueChange={(value) => {
              if (value == null) return;
              const next = value as SidebarPresentation;
              setMode(next);
              setOpen(next === 'push');
            }}
          />
        </label>
        <label>
          Side{' '}
          <Select aria-label="Side" data={SIDES} value={side} onValueChange={(value) => value != null && setSide(value as 'start' | 'end')} />
        </label>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
        <Checkbox checked={outsidePress} disabled={mode === 'overlay'} onCheckedChange={(checked) => setOutsidePress(checked)}>
          Close on outside press (push)
        </Checkbox>
      </div>
      {/* The layout bounds its panel to its own box: place it inside the container it belongs to. */}
      <SidebarLayout
        mode={mode}
        side={side}
        size="13rem"
        open={open}
        closeOnOutsidePress={outsidePress}
        onOpenChange={(next, event) => {
          setOpen(next);
          setLast(`${next ? 'opened' : 'closed'} (${event.reason}, ${event.source})`);
        }}
        style={{ blockSize: 300, maxInlineSize: 560, border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)' }}
      >
        <SidebarPanel navigation aria-label="Task filters">
          <div style={{ display: 'grid', gap: 8, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <strong>Filters</strong>
              <SidebarTrigger aria-label="Close filters" icon={CLOSE_ICON} />
            </div>
            <ul style={{ display: 'grid', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
              {filters.map((label) => (
                <li key={label} style={{ whiteSpace: 'nowrap' }}>
                  <a href={DEMO_ANCHOR}>{label}</a>
                </li>
              ))}
            </ul>
          </div>
        </SidebarPanel>
        <SidebarMain style={{ padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <SidebarTrigger aria-label="Filters" />
            <strong>Tasks</strong>
          </div>
          <p>Press here to test an outside press. Focus a filter link and press the close button inside the panel: focus returns to the Filters button.</p>
          <p>
            Last change: <output>{last}</output>
          </p>
        </SidebarMain>
      </SidebarLayout>
    </div>
  );
}
