'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Slider } from '@salmonui/inputs/slider';
import { Tooltip, type TooltipPlacement } from '@salmonui/overlays/tooltip';
import { EventLog, useEventLog } from '../../components/demo-kit';

const PLACEMENTS: TooltipPlacement[] = ['top', 'topStart', 'topEnd', 'bottom', 'bottomStart', 'bottomEnd', 'start', 'startTop', 'startBottom', 'end', 'endTop', 'endBottom'];

// Tooltip options: a controlled tooltip opened from a button with a change log
// (a controlled `open` decides every change), the arrow and offset, a pointer-
// following tooltip, a collision boundary, a wide tooltip and right-to-left.
export default function TooltipOptionsDemo() {
  const [open, setOpen] = useState(false);
  const [allowHover, setAllowHover] = useState(true);
  const [placement, setPlacement] = useState<TooltipPlacement>('top');
  const [arrow, setArrow] = useState(true);
  const [offset, setOffset] = useState(6);
  const [rtl, setRtl] = useState(false);
  const [boundary, setBoundary] = useState<HTMLDivElement | null>(null);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const [log, record] = useEventLog(6);
  return (
    <div dir={rtl ? 'rtl' : 'ltr'}>
      <div className="demo-toolbar">
        <label>
          Placement
          <Select aria-label="Placement" data={PLACEMENTS} value={placement} onValueChange={(value) => value != null && setPlacement(value as TooltipPlacement)} />
        </label>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label>
            Offset
            <Slider min={0} max={24} value={offset} onValueChange={setOffset} style={{ inlineSize: 160 }} />
          </label>
          <output>{offset} px</output>
        </span>
        <Checkbox checked={arrow} onCheckedChange={(checked) => setArrow(checked)}>
          Arrow
        </Checkbox>
        <Checkbox checked={allowHover} onCheckedChange={(checked) => setAllowHover(checked)}>
          Allow hover and focus to open
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
      </div>
      <div className="demo-toolbar">
        <Tooltip
          content="Saved 2 minutes ago"
          open={open}
          placement={placement}
          arrow={arrow}
          offset={offset}
          style={{ fontWeight: 600 }}
          onOpenChange={(next, event) => {
            const accepted = !next || allowHover;
            record(`${next ? 'open' : 'close'} requested (${event.reason}, ${event.source})${accepted ? '' : ': ignored'}`);
            if (accepted) setOpen(next);
          }}
          onAfterOpen={() => record('after open')}
          onAfterClose={() => record('after close')}
        >
          <Button variant="outline">Save status</Button>
        </Tooltip>
        <Button variant="ghost" aria-pressed={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide the status tooltip' : 'Show the status tooltip'}
        </Button>
        <Tooltip content="Ships within 2 business days to every EU country; bulky items may take a week longer." styles={{ content: { width: 260 } }} placement="bottom">
          <Button variant="outline">Shipping</Button>
        </Tooltip>
        <Tooltip content="Deletes the draft for every editor" contentProps={{ 'data-variant': 'warning' }} container={portal}>
          <Button variant="outline">Delete draft</Button>
        </Tooltip>
        {/* The Delete draft tooltip is rendered inside this element (`container`), so it inherits its italic text. */}
        <div ref={setPortal} style={{ fontStyle: 'italic' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <Tooltip content="Pointer position" followCursor placement="topStart" delay={0}>
          <div
            tabIndex={0}
            role="group"
            aria-label="Pointer area"
            style={{ inlineSize: 220, blockSize: 96, display: 'grid', placeItems: 'center', border: '1px dashed var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)' }}
          >
            Move the pointer here
          </div>
        </Tooltip>
        <div ref={setBoundary} style={{ inlineSize: 220, blockSize: 96, overflow: 'auto', border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)', padding: 8 }}>
          <Tooltip content="Kept inside the bordered box" collisionBoundary={boundary} placement="start">
            <Button variant="outline">
              Boundary
            </Button>
          </Tooltip>
        </div>
      </div>
      <EventLog entries={log} label="Tooltip events" />
    </div>
  );
}
