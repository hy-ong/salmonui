'use client';

import { useState } from 'react';
import { OtpField } from '@salmonui/inputs/otp-field';

// A six-digit code in two groups with onComplete, and a masked four-digit PIN.
export default function OtpFieldBasicsDemo() {
  const [status, setStatus] = useState('Waiting for the code');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <OtpField label="Verification code" description="6 digits from the SMS" length={6} separator="-" groupSize={3} onValueChange={() => setStatus('Typing')} onComplete={(code) => setStatus(`Verifying ${code}`)} />
      <output>{status}</output>
      <OtpField label="PIN" mask="●" placeholder="○" />
    </div>
  );
}
