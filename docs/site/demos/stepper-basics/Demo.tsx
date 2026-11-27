'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Step, Stepper } from '@salmonui/navigation/stepper';
import { Tooltip } from '@salmonui/overlays/tooltip';

export default function StepperBasicsDemo() {
  const [step, setStep] = useState(0);
  const [linear, setLinear] = useState(true);
  const [billingInvalid, setBillingInvalid] = useState(false);
  const steps = ['Account', 'Billing', 'Shipping', 'Confirm'];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Stepper aria-label="Checkout" value={step} onValueChange={setStep} linear={linear}>
        <Step label="Account" description="Sign in" render={(step) => <Tooltip content="Sign in or create an account" render={(tip) => <button {...step} {...tip} />} />} />
        <Step label="Billing" invalid={billingInvalid} />
        <Step label="Shipping" optional />
        <Step label="Confirm" render={(step) => <button {...step} title="Check the order before paying" />} />
      </Stepper>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>
          Back
        </Button>
        <Button variant="outline" disabled={step === steps.length - 1} onClick={() => setStep(step + 1)}>
          Next
        </Button>
        <Checkbox checked={linear} onCheckedChange={(checked) => setLinear(checked)}>
          Linear
        </Checkbox>
        <Checkbox checked={billingInvalid} onCheckedChange={(checked) => setBillingInvalid(checked)}>
          Billing invalid
        </Checkbox>
      </div>
      <p style={{ margin: 0 }}>Current step: {steps[step]}</p>
    </div>
  );
}
