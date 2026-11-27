'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { ColorPicker, parseColor, type ColorPickerMode } from '@salmonui/inputs/color-picker';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';

type Format = 'hex' | 'hexa' | 'rgb' | 'hsl';

const FORMATS: readonly Format[] = ['hexa', 'hex', 'rgb', 'hsl'];

// Controlled open and mode, cancellable open and mode switch, value formats and the two value events.
export default function ColorPickerPopoverDemo() {
  const [format, setFormat] = useState<Format>('hexa');
  const [value, setValue] = useState<string | null>('#2b8a3ecc');
  const [committed, setCommitted] = useState<string | null>('#2b8a3ecc');
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ColorPickerMode>('area');
  const [alpha, setAlpha] = useState(true);
  const [blockOpen, setBlockOpen] = useState(false);
  const [stayInArea, setStayInArea] = useState(false);
  const [log, push] = useEventLog(12);

  const changeFormat = (next: Format) => {
    setFormat(next);
    // The picker reports values in `valueFormat`; convert the current one too.
    setValue((v) => (v === null ? v : parseColor(v).toString(next)));
    setCommitted((v) => (v === null ? v : parseColor(v).toString(next)));
  };

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
      <div className="demo-toolbar">
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          Open the picker
        </Button>
        <Checkbox checked={blockOpen} onCheckedChange={(checked) => setBlockOpen(checked)}>
          Block opening
        </Checkbox>
        <Checkbox checked={stayInArea} onCheckedChange={(checked) => setStayInArea(checked)}>
          Stay in the area
        </Checkbox>
        <Checkbox checked={alpha} onCheckedChange={(checked) => setAlpha(checked)}>
          Opacity
        </Checkbox>
        <label>
          Value format
          <Select aria-label="Value format" data={FORMATS} value={format} onValueChange={(value) => value != null && changeFormat(value as Format)} />
        </label>
      </div>
      <ColorPicker
        label="Highlight"
        valueFormat={format}
        alpha={alpha}
        value={value}
        onValueChange={(v, d) => {
          setValue(v);
          push(`onValueChange ${v ?? 'null'} (${d.reason}, ${d.source})`);
        }}
        onValueCommit={(v, d) => {
          setCommitted(v);
          push(`onValueCommit ${v ?? 'null'} (${d.reason})`);
        }}
        open={open}
        onBeforeOpenChange={(event) => {
          if (blockOpen && event.open) {
            event.preventDefault();
            push(`onBeforeOpenChange open vetoed (${event.reason})`);
          }
        }}
        onOpenChange={(next, d) => {
          setOpen(next);
          push(`onOpenChange ${next ? 'open' : 'closed'} (${d.reason})`);
        }}
        mode={mode}
        onBeforeModeChange={(event) => {
          if (stayInArea && event.mode === 'swatches') {
            event.preventDefault();
            push('onBeforeModeChange swatches vetoed');
          }
        }}
        onModeChange={(next) => {
          setMode(next);
          push(`onModeChange ${next}`);
        }}
      />
      <output>
        Popover {open ? 'open' : 'closed'}, mode {mode}. Live value: {value ?? 'no color'}; committed: {committed ?? 'no color'}
      </output>
      <EventLog entries={log} label="Color picker events" />
    </div>
  );
}
