// ColorPicker section of examples/vite-spa/inputs.html (?only=color;
// tests/browser/inputs-color.spec.ts).
import { useState } from 'react';
import { ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatchPicker, type ColorPickerMode } from '@salmonui/inputs/color-picker';
import { Form } from '@salmonui/inputs/form';
import { log, Section, submitTo } from './inputs-shared.tsx';
import '@salmonui/inputs/color-picker/styles.css';
import '@salmonui/inputs/form/styles.css';

const PALETTE = ['#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#8000ff', '#000000'];

function ModeLog() {
  const [mode, setMode] = useState<ColorPickerMode>('area');
  return (
    <ColorPicker
      inline
      label="Inline"
      mode={mode}
      onModeChange={(m) => (log({ kind: 'clr-mode', mode: m }), setMode(m))}
      onBeforeModeChange={(e) => log({ kind: 'clr-before-mode', mode: e.mode })}
      colors={PALETTE}
      columns={4}
      commitBehavior="immediate"
      defaultValue="#3366cc"
      onValueChange={(v, d) => log({ kind: 'clr-inline', value: v, reason: d.reason, source: d.source })}
      onValueCommit={(v, d) => log({ kind: 'clr-inline-commit', value: v, reason: d.reason })}
    />
  );
}

export function ColorSection() {
  return (
    <Section id="color" title="ColorPicker">
      <Form id="clr-form" onSubmit={submitTo('clr-form')}>
        <ColorPicker
          id="clr-brand"
          label="Brand"
          description="Primary brand color"
          name="brand"
          clearable
          defaultRecentColors={[]}
          onValueChange={(v, d) => log({ kind: 'clr-change', value: v, reason: d.reason, source: d.source })}
          onValueCommit={(v, d) => log({ kind: 'clr-commit', value: v, reason: d.reason })}
          onOpenChange={(open, d) => log({ kind: 'clr-open', open, reason: d.reason })}
          onBeforeOpenChange={(e) => log({ kind: 'clr-before-open', open: e.open, reason: e.reason })}
          onRecentColorsChange={(colors) => log({ kind: 'clr-recent', colors })}
        />
        <ColorPicker
          label="Immediate"
          name="accent"
          commitBehavior="immediate"
          defaultMode="swatches"
          colors={PALETTE}
          columns={4}
          defaultValue="#ff0000"
          onValueCommit={(v, d) => log({ kind: 'clr-immediate-commit', value: v, reason: d.reason })}
        />
        <ColorPicker label="Locked" defaultValue="#000000" onBeforeOpenChange={(e) => (log({ kind: 'clr-veto', open: e.open }), e.preventDefault())} />
        <ColorArea id="clr-area" aria-label="Area" name="area" defaultValue="#ff0000" onValueChange={(c, d) => log({ kind: 'clr-area', value: c.toString('hexa'), reason: d.reason, source: d.source })} onValueCommit={(c, d) => log({ kind: 'clr-area-commit', value: c.toString('hexa'), reason: d.reason })} />
        <ColorSlider id="clr-hue" channel="hue" name="hue" defaultValue="#ff0000" onValueChange={(c, d) => log({ kind: 'clr-hue', hue: Math.round(c.hue), reason: d.reason })} />
        <ColorSlider id="clr-alpha" channel="alpha" orientation="vertical" defaultValue="#ff0000" onValueChange={(c) => log({ kind: 'clr-alpha', alpha: c.alpha })} />
        <ColorSwatchPicker id="clr-swatches" aria-label="Palette" name="swatch" colors={PALETTE} columns={4} clearable defaultValue="#00ff00" onValueChange={(v, d) => log({ kind: 'clr-swatch', value: v, source: d.source })} />
        <ColorField id="clr-field" label="Hex color" name="hex" valueFormat="hex" clearable defaultValue="#336699" onValueChange={(v, d) => log({ kind: 'clr-field', value: v, reason: d.reason })} />
        <button type="submit" id="clr-submit">
          Submit colors
        </button>
        <button type="reset" id="clr-reset">
          Reset colors
        </button>
      </Form>
      <ModeLog />
      <ColorPicker inline label="Mode locked" commitBehavior="immediate" onBeforeModeChange={(e) => e.preventDefault()} />
    </Section>
  );
}
