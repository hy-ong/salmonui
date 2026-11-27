'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { NumberField } from '@salmonui/inputs/number-field';
import { Rating } from '@salmonui/inputs/rating';
import { Select } from '@salmonui/dropdowns/select';
import { Slider } from '@salmonui/inputs/slider';
import { TextField } from '@salmonui/inputs/text-field';
import { EventLog, useEventLog } from '../../components/demo-kit';

type Size = 'sm' | 'md' | 'lg';
type Locale = 'en-US' | 'de-DE';

// Built-in strings per locale: `localeText` overrides, `locale` formats.
const TEXT = {
  'en-US': { clear: 'Clear name', validationRequired: 'Enter your name.' },
  'de-DE': { clear: 'Name löschen', validationRequired: 'Bitte einen Namen eingeben.' },
} as const;

// The states every field shares: placeholder, disabled, read-only, size,
// direction, locale, adornments, clearing, className / style, ref methods,
// native focus events and controlled vs uncontrolled values.
export default function FieldStatesDemo() {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('Ada');
  const [disabled, setDisabled] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [size, setSize] = useState<Size>('md');
  const [locale, setLocale] = useState<Locale>('en-US');
  const [log, push] = useEventLog(12);
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={disabled} onCheckedChange={(checked) => setDisabled(checked)}>
          disabled
        </Checkbox>
        <Checkbox checked={readOnly} onCheckedChange={(checked) => setReadOnly(checked)}>
          readOnly
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          dir="rtl"
        </Checkbox>
        <label>
          size
          <Select aria-label="size" data={['sm', 'md', 'lg']} value={size} onValueChange={(value) => value != null && setSize(value as Size)} />
        </label>
        <label>
          locale
          <Select aria-label="locale" data={['en-US', 'de-DE']} value={locale} onValueChange={(value) => value != null && setLocale(value as Locale)} />
        </label>
      </div>
      <div className="demo-toolbar">
        <Button type="button" variant="outline" onClick={() => nameRef.current?.focus()}>
          ref.focus()
        </Button>
        <Button type="button" variant="outline" onClick={() => nameRef.current?.blur()}>
          ref.blur()
        </Button>
        <Button type="button" variant="outline" onClick={() => nameRef.current?.click()}>
          ref.click()
        </Button>
      </div>
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'grid', gap: 16, maxInlineSize: 380 }}>
        <TextField
          ref={nameRef}
          label="Name (controlled)"
          placeholder="Your name"
          required
          validation={{ required: true }}
          clearable
          localeText={TEXT[locale]}
          startAdornment="@"
          size={size}
          disabled={disabled}
          readOnly={readOnly}
          value={name}
          onValueChange={(value, details) => {
            setName(value);
            push(`onValueChange ${JSON.stringify(value)} (${details.reason}, ${details.source})`);
          }}
          onChange={(event) => push(`onChange: native input event, target.value ${JSON.stringify(event.target.value)}`)}
          onFocus={() => push('onFocus')}
          onBlur={() => push('onBlur')}
          onClick={() => push('onClick')}
          className="demo-accent-field"
          style={{ borderInlineStart: '3px solid var(--salmon-color-primary)', paddingInlineStart: 8 }}
          description="Clear it with the button or Escape: the required rule then shows its localized message."
        />
        <TextField label="Nickname (uncontrolled)" placeholder="Optional" defaultValue="" endAdornment=".dev" size={size} disabled={disabled} readOnly={readOnly} />
        <NumberField label="Budget" locale={locale} currency="EUR" defaultValue={1234.5} size={size} disabled={disabled} readOnly={readOnly} description="Formatted with the chosen locale on blur" />
        <Slider label="Balance" defaultValue={30} fill valueLabel={{ show: 'focus' }} disabled={disabled} readOnly={readOnly} description="Arrow keys follow the direction: in RTL, ArrowLeft increases" />
        <Rating label="Mood" defaultValue={3} disabled={disabled} readOnly={readOnly} size={size} />
      </div>
      <p className="demo-status">Name: {JSON.stringify(name)}</p>
      <EventLog entries={log} label="Field events" />
    </>
  );
}
