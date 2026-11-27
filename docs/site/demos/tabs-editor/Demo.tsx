'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Select } from '@salmonui/dropdowns/select';
import { Tab, TabList, TabPanel, Tabs } from '@salmonui/navigation/tabs';

const OVERFLOWS = ['menu', 'scroll'];
const initial = Array.from({ length: 10 }, (_, i) => `file-${i + 1}.ts`);

export default function TabsEditorDemo() {
  const [files, setFiles] = useState(initial);
  const [value, setValue] = useState(initial[0]!);
  const [overflow, setOverflow] = useState<'scroll' | 'menu'>('menu');
  // New file names never reuse a closed tab's name (tab values and keys stay unique).
  const [nextNumber, setNextNumber] = useState(initial.length + 1);
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Overflow{' '}
          <Select aria-label="Overflow" data={OVERFLOWS} value={overflow} onValueChange={(value) => value != null && setOverflow(value as 'scroll' | 'menu')} />
        </label>
        <Button variant="outline" onClick={() => {
            const file = `file-${nextNumber}.ts`;
            setNextNumber(nextNumber + 1);
            setFiles((list) => [...list, file]);
            setValue(file);
          }}>
          Add tab
        </Button>
      </div>
      <div style={{ maxWidth: 480 }}>
        <Tabs
          value={value}
          onValueChange={setValue}
          overflow={overflow}
          reorderable
          onReorder={(event) =>
            setFiles((list) => {
              const next = [...list];
              const [moved] = next.splice(event.fromIndex, 1);
              next.splice(event.toIndex, 0, moved!);
              return next;
            })
          }
        >
          <TabList aria-label="Open files">
            {files.map((file) => (
              <Tab key={file} value={file} onClose={(event) => setFiles((list) => list.filter((f) => f !== event.value))}>
                {file}
              </Tab>
            ))}
          </TabList>
          {files.map((file) => (
            <TabPanel key={file} value={file}>
              Contents of {file}
            </TabPanel>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
