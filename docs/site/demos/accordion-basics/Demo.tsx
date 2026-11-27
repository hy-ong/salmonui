'use client';
import { useState } from 'react';
import { Accordion, AccordionItem } from '@salmonui/navigation/accordion';
import { Checkbox } from '@salmonui/inputs/checkbox';

export default function AccordionBasicsDemo() {
  const [single, setSingle] = useState(false);
  const [value, setValue] = useState<readonly string[]>(['shipping']);
  const [last, setLast] = useState('nothing yet');
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <Checkbox checked={single} onCheckedChange={(checked) => setSingle(checked)}>
        Single mode
      </Checkbox>
      <Accordion
        type={single ? 'single' : 'multiple'}
        value={value}
        onBeforeValueChange={(event) => {
          if (event.item === 'locked') event.preventDefault();
        }}
        onValueChange={(next, event) => {
          setValue(next);
          setLast(`${event.item} ${event.expanded ? 'expanded' : 'collapsed'} (${event.source})`);
        }}
      >
        <AccordionItem value="shipping" header="Shipping">
          Orders ship within two business days. Tracking links arrive by email.
        </AccordionItem>
        <AccordionItem value="returns" header="Returns">
          Return any unused item within 30 days for a full refund.
        </AccordionItem>
        <AccordionItem value="warranty" header="Warranty" disabled>
          Two years on every device.
        </AccordionItem>
        <AccordionItem value="locked" header="Vetoed by onBeforeValueChange">
          Never shown.
        </AccordionItem>
        <AccordionItem value="search" header="Find me with Ctrl+F" forceMount>
          This panel is mounted while collapsed, so find-in-page can reveal the word marmalade.
        </AccordionItem>
      </Accordion>
      <p style={{ margin: 0 }}>
        Expanded: <code>{JSON.stringify(value)}</code> · last change: {last}
      </p>
    </div>
  );
}
