'use client';
import { useState } from 'react';
import { Select } from '@salmonui/dropdowns/select';
import { Step, Stepper, type StepperProps } from '@salmonui/navigation/stepper';

const placements = ['end', 'start', 'bottom', 'top'] as const;
const ORIENTATIONS = ['vertical', 'horizontal'];

export default function StepperVerticalDemo() {
  const [orientation, setOrientation] = useState<NonNullable<StepperProps['orientation']>>('vertical');
  const [placement, setPlacement] = useState<(typeof placements)[number]>('end');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label>
          Orientation{' '}
          <Select aria-label="Orientation" data={ORIENTATIONS} value={orientation} onValueChange={(value) => value != null && setOrientation(value as 'vertical' | 'horizontal')} />
        </label>
        <label>
          Label placement{' '}
          <Select aria-label="Label placement" data={placements} value={placement} onValueChange={(value) => value != null && setPlacement(value as (typeof placements)[number])} />
        </label>
      </div>
      <Stepper aria-label="Deployment" orientation={orientation} labelPlacement={placement} defaultValue={2} onStepClick={(event) => console.log('step', event.index, event.source)}>
        <Step label="Build" />
        <Step label="Test" status="completed" />
        <Step label="Deploy" />
        <Step label="Verify" disabled />
      </Stepper>
      <Stepper aria-label="Order status" readOnly value={1} renderStep={(ctx) => (
          <span style={{ display: 'grid', gap: 2 }}>
            <span>{`${ctx.index + 1}. ${String(ctx.label)}`}</span>
            <small style={{ color: 'var(--salmon-text-secondary)' }}>{ctx.status}</small>
          </span>
        )}>
        <Step label="Ordered" />
        <Step label="Packed" />
        <Step label="Delivered" />
      </Stepper>
    </div>
  );
}
