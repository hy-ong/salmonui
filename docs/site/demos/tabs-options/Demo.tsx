'use client';
import { useEffect, useRef, useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Tab, TabList, TabPanel, Tabs, type TabIconPlacement, type TabsPanelMount } from '@salmonui/navigation/tabs';
import { TextField } from '@salmonui/inputs/text-field';

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ICON_PLACEMENTS = ['start', 'end', 'top', 'bottom'];
const PANEL_MOUNTS = ['lazy', 'active', 'eager'];
const SCROLL_STEPS = [
  { value: 50, label: '50 px' },
  { value: 100, label: '100 px' },
  { value: 300, label: '300 px' },
];

const CALENDAR = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M2 3h12v11H2zM2 6h12M5 1v4M11 1v4" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export default function TabsOptionsDemo() {
  const [iconPlacement, setIconPlacement] = useState<TabIconPlacement>('start');
  const [panelMount, setPanelMount] = useState<TabsPanelMount>('lazy');
  const [scrollStep, setScrollStep] = useState(100);
  const [disabled, setDisabled] = useState(false);
  const [value, setValue] = useState('January');
  const [aria, setAria] = useState('');
  const root = useRef<HTMLDivElement>(null);

  // Read the ARIA wiring after the commit (no DOM access during render).
  useEffect(() => {
    const tab = root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const list = root.current?.querySelector<HTMLElement>('[role="tablist"]');
    const panel = tab ? document.getElementById(tab.getAttribute('aria-controls') ?? '') : null;
    setAria(
      tab
        ? `tablist aria-orientation=${list?.getAttribute('aria-orientation') ?? '-'}; tab aria-selected=true aria-controls=${tab.getAttribute('aria-controls')}; tabpanel aria-labelledby=${panel?.getAttribute('aria-labelledby') ?? '-'}`
        : 'no selected tab',
    );
  }, [value, disabled, panelMount]);

  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Icon placement{' '}
          <Select aria-label="Icon placement" data={ICON_PLACEMENTS} value={iconPlacement} onValueChange={(value) => value != null && setIconPlacement(value as TabIconPlacement)} />
        </label>
        <label>
          Panel mount{' '}
          <Select aria-label="Panel mount" data={PANEL_MOUNTS} value={panelMount} onValueChange={(value) => value != null && setPanelMount(value as TabsPanelMount)} />
        </label>
        <label>
          Scroll step{' '}
          <Select aria-label="Scroll step" data={SCROLL_STEPS} value={scrollStep} onValueChange={(value) => value != null && setScrollStep(Number(value))} />
        </label>
        <Checkbox checked={disabled} onCheckedChange={(checked) => setDisabled(checked)}>
          Disabled
        </Checkbox>
      </div>
      <div style={{ maxWidth: 420 }}>
        <Tabs ref={root} value={value} onValueChange={setValue} panelMount={panelMount} scrollStep={scrollStep} disabled={disabled}>
          <TabList aria-label="Monthly notes">
            {months.map((month) => (
              <Tab key={month} value={month} icon={CALENDAR} iconPlacement={iconPlacement}>
                {month}
              </Tab>
            ))}
          </TabList>
          {months.map((month) => (
            <TabPanel key={month} value={month}>
              <TextField label={`Notes for ${month}`} placeholder="Type, switch tabs, come back" style={{ inlineSize: '100%', maxInlineSize: 320 }} />
            </TabPanel>
          ))}
        </Tabs>
      </div>
      <p>
        ARIA: <output>{aria}</output>
      </p>
    </div>
  );
}
