'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { OtpField } from '@salmonui/inputs/otp-field';
import { Select } from '@salmonui/dropdowns/select';

type Transform = 'uppercase' | 'lowercase' | 'none';

// A controlled code the owner can fill or clear, cell placeholders, a case
// transform for alphanumeric codes, and autoFocus when the step appears.
export default function OtpFieldOptionsDemo() {
  const [code, setCode] = useState('');
  const [transform, setTransform] = useState<Transform>('uppercase');
  const [voucher, setVoucher] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <OtpField label="Login code" length={6} placeholder="000000" value={code} onValueChange={setCode} description='placeholder="000000" fills the empty cells' />
      <div className="demo-toolbar" style={{ marginBlockEnd: 0 }}>
        <Button type="button" variant="outline" onClick={() => setCode('482915')}>
          Fill from SMS
        </Button>
        <Button type="button" variant="outline" onClick={() => setCode('')}>
          Clear
        </Button>
        <output>Value: {JSON.stringify(code)}</output>
      </div>
      <div className="demo-toolbar" style={{ marginBlockEnd: 0 }}>
        <label>
          Transform
          <Select aria-label="Transform" data={['uppercase', 'lowercase', 'none']} value={transform} onValueChange={(value) => value != null && setTransform(value as Transform)} />
        </label>
      </div>
      <OtpField label="Voucher" type="alphanumeric" length={5} transform={transform} value={voucher} onValueChange={setVoucher} description="Type letters: they are stored in the chosen case" />
      <output>Value: {JSON.stringify(voucher)}</output>
      {sent ? (
        <OtpField label="Confirmation code" length={4} autoFocus description="Mounted with autoFocus: start typing right away" />
      ) : (
        <Button type="button" variant="outline" onClick={() => setSent(true)} style={{ justifySelf: 'start' }}>
          Send confirmation code
        </Button>
      )}
    </div>
  );
}
