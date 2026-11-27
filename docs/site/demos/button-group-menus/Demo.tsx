'use client';

import { useState } from 'react';
import { Button, ButtonGroup, ToggleButton, ToggleButtonGroup } from '@salmonui/buttons/button';
import { MenuButton, MenuItem, SplitButton } from '@salmonui/buttons/menu';

const shareItems = [
  { id: 'link', label: 'Copy link' },
  { id: 'email', label: 'Email' },
];

// MenuButton and SplitButton as ButtonGroup children, a SplitButton in a
// vertical group, and the same group under dir="rtl".
export default function ButtonGroupMenusDemo() {
  const [last, setLast] = useState('nothing yet');
  const onAction = (event: { id: string }) => setLast(event.id);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }}>
        <ButtonGroup aria-label="Document" variant="outline">
          <Button onClick={() => setLast('edit')}>Edit</Button>
          <MenuButton items={shareItems} onAction={onAction}>
            Share
          </MenuButton>
          <SplitButton
            onClick={() => setLast('print')}
            onAction={onAction}
            menu={
              <>
                <MenuItem id="print-preview">Print preview</MenuItem>
                <MenuItem id="page-setup">Page setup</MenuItem>
              </>
            }
          >
            Print
          </SplitButton>
        </ButtonGroup>
        <ButtonGroup aria-label="Release" orientation="vertical" tone="primary">
          <SplitButton onClick={() => setLast('publish')} onAction={onAction} items={[{ id: 'schedule', label: 'Schedule…' }, { id: 'publish-draft', label: 'Publish as draft' }]}>
            Publish
          </SplitButton>
          <Button onClick={() => setLast('preview')}>Preview</Button>
          <Button onClick={() => setLast('discard')}>Discard</Button>
        </ButtonGroup>
      </div>
      <div dir="rtl" lang="ar" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <ToggleButtonGroup aria-label="المحاذاة" defaultValue="start" onValueChange={(value) => setLast(`align ${value ?? 'none'}`)}>
          <ToggleButton value="start">بداية</ToggleButton>
          <ToggleButton value="center">وسط</ToggleButton>
          <ToggleButton value="end">نهاية</ToggleButton>
        </ToggleButtonGroup>
        <ButtonGroup aria-label="تنسيق" variant="outline">
          <Button onClick={() => setLast('bold')}>عريض</Button>
          <Button onClick={() => setLast('italic')}>مائل</Button>
          <MenuButton items={[{ id: 'size-small', label: 'صغير' }, { id: 'size-large', label: 'كبير' }]} onAction={onAction}>
            الحجم
          </MenuButton>
        </ButtonGroup>
      </div>
      <p>
        Last action: <output>{last}</output>
      </p>
    </div>
  );
}
