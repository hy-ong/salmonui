'use client';
import { useState } from 'react';
import { Select } from '@salmonui/dropdowns/select';
import { Tab, TabList, TabPanel, Tabs, type TabsPlacement } from '@salmonui/navigation/tabs';

const PLACEMENTS = ['top', 'bottom', 'start', 'end'];

const STAR = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M8 1l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z" fill="currentColor" />
  </svg>
);

export default function TabsBasicsDemo() {
  const [placement, setPlacement] = useState<TabsPlacement>('top');
  const [value, setValue] = useState('general');
  const [last, setLast] = useState('nothing yet');
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Placement{' '}
          <Select aria-label="Placement" data={PLACEMENTS} value={placement} onValueChange={(value) => value != null && setPlacement(value as TabsPlacement)} />
        </label>
      </div>
      <Tabs
        value={value}
        placement={placement}
        onBeforeValueChange={(event) => {
          if (event.value === 'locked') event.preventDefault();
        }}
        onValueChange={(next, event) => {
          setValue(next);
          setLast(`${next} (${event.source}, was ${event.previousValue})`);
        }}
      >
        <TabList aria-label="Account settings">
          <Tab value="general">General</Tab>
          <Tab value="billing" icon={STAR}>
            Billing
          </Tab>
          <Tab value="locked">Locked</Tab>
          <Tab value="archived" disabled>
            Archived
          </Tab>
        </TabList>
        <TabPanel value="general">General settings.</TabPanel>
        <TabPanel value="billing">Billing details.</TabPanel>
        <TabPanel value="locked">Never shown: onBeforeValueChange cancels it.</TabPanel>
        <TabPanel value="archived">Disabled.</TabPanel>
      </Tabs>
      <p>Last change: {last}</p>
    </div>
  );
}
