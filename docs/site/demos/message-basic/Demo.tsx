'use client';

import { useState } from 'react';
import { Button, ToggleButton, ToggleButtonGroup } from '@salmonui/buttons/button';
import { Message, type MessageTone, type MessageVariant } from '@salmonui/notifications/message';

const TONES: MessageTone[] = ['neutral', 'primary', 'info', 'success', 'warning', 'danger'];

// Tones per variant, a dismissible message with an action, and a polite live message.
export default function MessageBasicDemo() {
  const [variant, setVariant] = useState<MessageVariant>('soft');
  const [dismissed, setDismissed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rtlDismissed, setRtlDismissed] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div>
        <ToggleButtonGroup aria-label="Variant" disallowEmpty value={variant} onValueChange={(next) => next && setVariant(next as MessageVariant)}>
          {(['soft', 'outline', 'solid'] as const).map((v) => (
            <ToggleButton key={v} value={v}>
              {v}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
      {TONES.map((tone) => (
        <Message key={tone} tone={tone} variant={variant} title={tone}>
          The {tone} tone in the {variant} variant.
        </Message>
      ))}
      <Message tone="info" hidden={dismissed} onDismiss={() => setDismissed(true)} action={<Button>Update</Button>}>
        Version 2 is ready.
      </Message>
      {dismissed ? (
        <div>
          <Button variant="ghost" onClick={() => setDismissed(false)}>
            Show the update message again
          </Button>
        </div>
      ) : null}
      <div>
        <Button onClick={() => setSaved(true)}>
          Save
        </Button>
      </div>
      <Message live="polite" tone="success" hidden={!saved} icon={false} align="center" onDismiss={() => setSaved(false)}>
        Changes saved.
      </Message>
      <div dir="rtl" lang="ar">
        <Message tone="warning" title="تنبيه" style={{ maxInlineSize: 420 }} localeText={{ dismiss: 'إغلاق' }} hidden={rtlDismissed} onDismiss={() => setRtlDismissed(true)}>
          ستنتهي صلاحية كلمة المرور خلال ثلاثة أيام.
        </Message>
      </div>
    </div>
  );
}
