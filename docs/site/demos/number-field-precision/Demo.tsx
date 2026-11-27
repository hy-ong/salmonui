'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { NumberField } from '@salmonui/inputs/number-field';
import { Select } from '@salmonui/dropdowns/select';

// Precision and range handling: `decimals` rounds the committed value,
// `restrictDecimals` refuses extra fraction digits while typing,
// `clampBehavior` clamps on blur or keeps the value and reports the error,
// and `details.formattedValue` is the text the blurred field shows.
export default function NumberFieldPrecisionDemo() {
  const [restrict, setRestrict] = useState(false);
  const [clamp, setClamp] = useState<'blur' | 'none'>('blur');
  const [weight, setWeight] = useState<number | null>(2.5);
  const [weightText, setWeightText] = useState('2.50 kg');
  const [reason, setReason] = useState('none');
  const [age, setAge] = useState<number | null>(30);
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={restrict} onCheckedChange={(checked) => setRestrict(checked)}>
          restrictDecimals
        </Checkbox>
        <label>
          clampBehavior
          <Select aria-label="clampBehavior" data={['blur', 'none']} value={clamp} onValueChange={(value) => value != null && setClamp(value as 'blur' | 'none')} />
        </label>
      </div>
      <div style={{ display: 'grid', gap: 16, justifyItems: 'start' }}>
        <NumberField
          label="Weight"
          style={{ inlineSize: 340, maxInlineSize: '100%' }}
          decimals={2}
          restrictDecimals={restrict}
          step={0.25}
          formatOptions={{ style: 'unit', unit: 'kilogram', minimumFractionDigits: 2, maximumFractionDigits: 2 }}
          value={weight}
          onValueChange={(value, details) => {
            setWeight(value);
            setWeightText(details.formattedValue);
            setReason(details.reason);
          }}
          description="decimals={2}: type 1.23456 and blur"
        />
        <output>
          value {String(weight)} · details.formattedValue {JSON.stringify(weightText)} · reason {reason}
        </output>
        <NumberField label="Age" style={{ inlineSize: 340, maxInlineSize: '100%' }}min={18} max={99} clampBehavior={clamp} value={age} onValueChange={setAge} description="18 to 99: type 150 and blur" />
        <output>Age value: {String(age)}</output>
      </div>
    </>
  );
}
