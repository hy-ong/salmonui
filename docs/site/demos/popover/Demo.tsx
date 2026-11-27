'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Popover } from '@salmonui/overlays/popover';
import { TextField } from '@salmonui/inputs/text-field';

export default function PopoverDemo() {
  const [customer, setCustomer] = useState('');
  const [applied, setApplied] = useState('All customers');
  return (
    <div>
      <div className="demo-toolbar">
        <Popover placement="bottomStart" arrow>
          <Popover.Trigger render={(props) => <Button {...props} />}>Filters</Popover.Trigger>
          <Popover.Content>
            <Popover.Title>Filters</Popover.Title>
            <Popover.Description>Narrow the order list.</Popover.Description>
            <div style={{ marginBlockEnd: 12 }}>
              <TextField label="Customer" value={customer} onValueChange={setCustomer} />
            </div>
            <Popover.Close render={(props) => <Button {...props} tone="primary" />} onClick={() => setApplied(customer || 'All customers')}>
              Apply
            </Popover.Close>
          </Popover.Content>
        </Popover>
        <Popover placement="end">
          <Popover.Trigger render={(props) => <Button {...props} variant="outline" />}>Help</Popover.Trigger>
          <Popover.Content aria-label="Help">
            Press Escape or click outside to close. <a href="#help">Read more</a>
          </Popover.Content>
        </Popover>
      </div>
      <p>
        <output>{applied}</output>
      </p>
    </div>
  );
}
