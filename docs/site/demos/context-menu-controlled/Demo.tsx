'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { ContextMenu, Menu, MenuItem, Submenu, type ContextMenuPoint } from '@salmonui/buttons/menu';

export default function ContextMenuControlledDemo() {
  const [open, setOpen] = useState(false);
  const [anchorPoint, setAnchorPoint] = useState<ContextMenuPoint | undefined>(undefined);
  const [rtl, setRtl] = useState(false);
  const [last, setLast] = useState('nothing yet');
  return (
    <div dir={rtl ? 'rtl' : 'ltr'}>
      <div className="demo-toolbar">
        <Button
          variant="outline"
          onClick={(event) => {
            // Open from code at the button's corner (viewport coordinates).
            const rect = event.currentTarget.getBoundingClientRect();
            setAnchorPoint({ x: rtl ? rect.right : rect.left, y: rect.bottom });
            setOpen(true);
          }}
        >
          Open from code
        </Button>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
        {/* English status text keeps its own direction inside the mirrored demo. */}
        <span dir="ltr">
          open = <output>{String(open)}</output>
        </span>
      </div>
      <ContextMenu
        tabIndex={0}
        role="group"
        aria-label="Board"
        style={{ display: 'grid', placeItems: 'end', padding: 16, minBlockSize: 200, border: '1px dashed var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)' }}
        open={open}
        anchorPoint={anchorPoint}
        onBeforeOpen={() => setAnchorPoint(undefined)}
        onOpenChange={(next, event) => {
          setOpen(next);
          setLast(`${next ? 'opened' : 'closed'} (${event.reason})`);
        }}
        onAction={(event) => setLast(`action ${event.id}`)}
        menu={
          <Menu aria-label="Board actions">
            <MenuItem id="add-card">Add card</MenuItem>
            <MenuItem id="add-list">Add list</MenuItem>
            <Submenu label="Move board">
              <MenuItem id="move-top">To the top</MenuItem>
              <MenuItem id="move-archive">To the archive</MenuItem>
            </Submenu>
            <MenuItem id="close" onAction={() => setOpen(false)}>
              Close menu
            </MenuItem>
          </Menu>
        }
      >
        <span>Right-click near this corner of the page</span>
      </ContextMenu>
      <p className="demo-status" dir="ltr">
        Last change: <output>{last}</output>
      </p>
    </div>
  );
}
