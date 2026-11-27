'use client';

import { useState, type CSSProperties } from 'react';
import { Button, type ButtonFloatingPosition, type ButtonTone, type ButtonVariant } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

const POSITIONS: ButtonFloatingPosition[] = ['topStart', 'topCenter', 'topEnd', 'middleStart', 'middleCenter', 'middleEnd', 'bottomStart', 'bottomCenter', 'bottomEnd'];
const TONES: ButtonTone[] = ['primary', 'neutral', 'success', 'warning', 'danger', 'info'];
const VARIANTS: ButtonVariant[] = ['solid', 'outline'];
// Readable labels for the camelCase values: "bottomEnd" -> "Bottom end".
const labelOf = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);
const options = (values: readonly string[]) => values.map((value) => ({ value, label: labelOf(value) }));

// Custom insets for the chosen position's own edges: a style override
// with logical inset properties.
function insetsFor(position: ButtonFloatingPosition, px: number): CSSProperties {
  const style: CSSProperties = {};
  if (position.startsWith('top')) style.insetBlockStart = px;
  if (position.startsWith('bottom')) style.insetBlockEnd = px;
  if (position.endsWith('Start')) style.insetInlineStart = px;
  if (position.endsWith('End')) style.insetInlineEnd = px;
  return style;
}

// floatingScope="parent" positions the buttons in this panel (position: relative)
// instead of the viewport; the nine positions are logical and mirror in RTL.
export default function FloatingActionButtonDemo() {
  const [position, setPosition] = useState<ButtonFloatingPosition>('bottomEnd');
  const [tone, setTone] = useState<ButtonTone>('primary');
  const [variant, setVariant] = useState<ButtonVariant>('solid');
  const [visible, setVisible] = useState(true);
  const [offset, setOffset] = useState(false);
  const [drafts, setDrafts] = useState(0);
  const [zoom, setZoom] = useState(100);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <label>
          Position{' '}
          <Select aria-label="Position" data={options(POSITIONS)} value={position} onValueChange={(value) => value != null && setPosition(value as ButtonFloatingPosition)} />
        </label>
        <label>
          Tone{' '}
          <Select aria-label="Tone" data={options(TONES)} value={tone} onValueChange={(value) => value != null && setTone(value as ButtonTone)} />
        </label>
        <label>
          Variant{' '}
          <Select aria-label="Variant" data={options(VARIANTS)} value={variant} onValueChange={(value) => value != null && setVariant(value as ButtonVariant)} />
        </label>
        <Checkbox checked={visible} onCheckedChange={(checked) => setVisible(checked)}>
          Visible
        </Checkbox>
        <Checkbox checked={offset} onCheckedChange={(checked) => setOffset(checked)}>
          Extra inset
        </Checkbox>
      </div>
      <div style={{ position: 'relative', blockSize: 220, border: '1px dashed var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-lg)' }}>
        <Button
          floating={position}
          floatingScope="parent"
          tone={tone}
          variant={variant}
          hidden={!visible}
          style={offset ? insetsFor(position, 48) : undefined}
          iconOnly
          aria-label="Compose"
          title="Compose"
          onClick={() => setDrafts((n) => n + 1)}
          iconStart={
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
          }
        />
        {/* Zoom in moves to the other bottom corner when Compose takes its corner, so the two never overlap. */}
        <Button floating={position === 'bottomStart' ? 'bottomEnd' : 'bottomStart'} floatingScope="parent" repeat onClick={() => setZoom((z) => Math.min(z + 10, 400))} onRepeat={() => setZoom((z) => Math.min(z + 10, 400))}>
          Zoom in
        </Button>
      </div>
      <p style={{ margin: 0 }}>
        Drafts: <output>{drafts}</output> · Zoom: <output>{zoom}%</output>
      </p>
    </div>
  );
}
