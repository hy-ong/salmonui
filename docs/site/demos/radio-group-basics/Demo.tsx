'use client';

import { useState } from 'react';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';

// A controlled group with a description and a disabled option, and a horizontal group.
export default function RadioGroupBasicsDemo() {
  const [plan, setPlan] = useState<string | null>('pro');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <RadioGroup label="Plan" name="plan" description="Billed monthly" value={plan} onValueChange={setPlan}>
        <Radio value="free">Free</Radio>
        <Radio value="pro">Pro</Radio>
        <Radio value="team" disabled>
          Team (soon)
        </Radio>
      </RadioGroup>
      <RadioGroup label="Size" name="size" defaultValue="m" orientation="horizontal">
        <Radio value="s">S</Radio>
        <Radio value="m">M</Radio>
        <Radio value="l">L</Radio>
      </RadioGroup>
      <output>Plan: {plan}</output>
    </div>
  );
}
