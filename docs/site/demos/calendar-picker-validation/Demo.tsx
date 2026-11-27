'use client';

import { useRef, useState, type FormEvent } from 'react';
import { DatePicker, type PickerHandle, type PlainDate } from '@salmonui/calendars/date-picker';
import { TimePicker, type PlainTime } from '@salmonui/calendars/time-picker';
import { Button } from '@salmonui/buttons/button';

type Booking = { checkIn: PlainDate | null; checkOut: PlainDate | null; arrival: PlainTime | null };

const initial: Booking = { checkIn: null, checkOut: null, arrival: null };

/** Pickers bound to external form state: controlled values, custom validation with invalid / errorMessage, onInvalid and ref.focus(). */
export default function CalendarPickerValidationDemo() {
  const checkInRef = useRef<PickerHandle>(null);
  const checkOutRef = useRef<PickerHandle>(null);
  const [form, setForm] = useState<Booking>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [changes, setChanges] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState('');
  const set = <K extends keyof Booking>(key: K, value: Booking[K]) => {
    setChanges((n) => n + 1);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const errors = {
    checkIn: form.checkIn ? '' : 'Choose a check-in date.',
    checkOut: !form.checkOut ? 'Choose a check-out date.' : form.checkIn && form.checkOut.toString() <= form.checkIn.toString() ? 'Check-out must be after check-in.' : '',
  };
  const show = (key: keyof typeof errors) => (submitted || touched[key]) && errors[key] !== '';
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (errors.checkIn) return checkInRef.current?.focus();
    if (errors.checkOut) return checkOutRef.current?.focus();
    setStatus(`Booked ${String(form.checkIn)} to ${String(form.checkOut)}, arriving ${form.arrival ? String(form.arrival) : 'any time'}`);
  };
  return (
    <form noValidate onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <DatePicker
          ref={checkInRef}
          label="Check-in"
          name="checkIn"
          required
          value={form.checkIn}
          onValueChange={(value) => set('checkIn', value as PlainDate | null)}
          onBlur={() => setTouched((t) => ({ ...t, checkIn: true }))}
          invalid={show('checkIn')}
          errorMessage={errors.checkIn}
          onInvalid={() => setStatus('onInvalid: check-in failed constraint validation')}
          min="2026-11-01"
        />
        <DatePicker
          ref={checkOutRef}
          label="Check-out"
          name="checkOut"
          required
          value={form.checkOut}
          onValueChange={(value) => set('checkOut', value as PlainDate | null)}
          onBlur={() => setTouched((t) => ({ ...t, checkOut: true }))}
          invalid={show('checkOut')}
          errorMessage={errors.checkOut}
          placeholderValue={form.checkIn ?? undefined}
          min="2026-11-01"
        />
        <TimePicker label="Arrival time" name="arrival" value={form.arrival} onValueChange={(value) => set('arrival', value)} min="14:00" max="22:00" errorMessage="Arrival is between 14:00 and 22:00." onInvalid={() => setStatus('onInvalid: arrival time is out of range')} />
      </div>
      <div className="demo-toolbar">
        <Button variant="outline" type="submit">Book</Button>
        <Button variant="outline" type="button" onClick={() => setForm({ checkIn: null, checkOut: null, arrival: null })}>
          Clear from outside
        </Button>
        <Button variant="outline"
          type="button"
          onClick={() => {
            setForm((f) => ({ ...f, checkIn: null }));
            setStatus('');
          }}
        >
          Reset check-in
        </Button>
        <Button variant="outline" type="button" onClick={(e) => e.currentTarget.form?.reportValidity()}>
          Check native validity
        </Button>
      </div>
      <p className="demo-status" aria-live="polite">
        State: {JSON.stringify(form)} · onValueChange calls: {changes}
        {status ? ` · ${status}` : ''}
      </p>
    </form>
  );
}
