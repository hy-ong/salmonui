// InlineEdit composed with the Salmon field components (tests/browser/inline-edit-fields.spec.ts). The application imports the
// fields and binds them through `children`; `/inline-edit` imports none.
//
// ?mode=inline|popover  ?scheme=dark  ?dir=rtl
// window.__fields records { saves: Record<field, value>, cancels: string[] }.
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/calendars/date-picker/styles.css';
import '@salmonui/calendars/date-range-picker/styles.css';
import '@salmonui/calendars/time-picker/styles.css';
import '@salmonui/dropdowns/combobox/styles.css';
import '@salmonui/dropdowns/select/styles.css';
import '@salmonui/editors/inline-edit/styles.css';
import '@salmonui/inputs/color-picker/styles.css';
import '@salmonui/inputs/masked-field/styles.css';
import '@salmonui/inputs/number-field/styles.css';
import '@salmonui/inputs/slider/styles.css';
import { ColorPicker } from '@salmonui/inputs/color-picker';
import { Combobox } from '@salmonui/dropdowns/combobox';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { DateRangePicker } from '@salmonui/calendars/date-range-picker';
import { InlineEdit, type InlineEditInputProps, type InlineEditProps } from '@salmonui/editors/inline-edit';
import { MaskedField } from '@salmonui/inputs/masked-field';
import { NumberField } from '@salmonui/inputs/number-field';
import { Select } from '@salmonui/dropdowns/select';
import { Slider } from '@salmonui/inputs/slider';
import { ThemeProvider } from '@salmonui/core/theme';
import { TimePicker } from '@salmonui/calendars/time-picker';

const log = { saves: {} as Record<string, unknown>, cancels: [] as string[] };
(window as unknown as { __fields: typeof log }).__fields = log;
const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'inline' ? 'inline' : 'popover';
const FRUIT = ['Apple', 'Banana', 'Cherry'];

/** The wiring a text-like field takes from `inputProps`; `value` and `onChange` are replaced by the typed pair. */
function wiring(inputProps: InlineEditInputProps) {
  const { value: _value, onChange: _onChange, ...rest } = inputProps;
  return rest;
}

function Row<T>(props: { readonly field: string } & InlineEditProps<T>): ReactNode {
  const { field, ...rest } = props;
  return (
    <div data-field={field} style={{ marginBlock: 12 }}>
      <InlineEdit<T>
        {...rest}
        label={field}
        mode={mode}
        onSave={(e) => {
          log.saves[field] = e.value;
        }}
        onEditCancel={() => log.cancels.push(field)}
        renderPreview={({ value }) => (typeof value === 'object' ? JSON.stringify(value) : String(value))}
      />
    </div>
  );
}

function App(): ReactNode {
  return (
    <ThemeProvider theme={{ colorScheme: params.get('scheme') === 'dark' ? 'dark' : 'light' }}>
      <main data-salmon-a11y-root="" dir={params.get('dir') === 'rtl' ? 'rtl' : undefined} style={{ padding: 24, minBlockSize: '100vh', background: 'var(--salmon-surface-base)', color: 'var(--salmon-text-primary)' }}>
        <Row<number | null> field="number" defaultValue={3} validation={{ range: [0, 100] }}>
          {({ value, setValue, inputProps }) => <NumberField {...wiring(inputProps)} max={100} value={value} onValueChange={setValue} />}
        </Row>
        <Row<string> field="masked" defaultValue="">
          {({ value, setValue, inputProps }) => <MaskedField {...wiring(inputProps)} mask="000-000" value={value} onValueChange={setValue} />}
        </Row>
        <Row<string | null> field="color" defaultValue="#336699">
          {({ value, setValue, inputProps }) => <ColorPicker aria-label={inputProps['aria-label']} value={value} onValueChange={setValue} />}
        </Row>
        <Row<number> field="slider" defaultValue={40}>
          {({ value, setValue, inputProps }) => <Slider label={inputProps['aria-label']} value={value} onValueChange={setValue} />}
        </Row>
        <Row<string | null> field="date" defaultValue="2026-03-15">
          {({ value, setValue, inputProps }) => <DatePicker aria-label={inputProps['aria-label']} value={value} onValueChange={(next) => setValue(next ? next.toString() : null)} />}
        </Row>
        <Row<string | null> field="datetime" defaultValue="2026-03-15T09:30:00">
          {({ value, setValue, inputProps }) => (
            <DatePicker aria-label={inputProps['aria-label']} granularity="minute" value={value} onValueChange={(next) => setValue(next ? next.toString() : null)} />
          )}
        </Row>
        <Row<string | null> field="time" defaultValue="09:30:00">
          {({ value, setValue, inputProps }) => <TimePicker aria-label={inputProps['aria-label']} value={value} onValueChange={(next) => setValue(next ? next.toString() : null)} />}
        </Row>
        <Row<{ start: string; end: string } | null> field="range" defaultValue={{ start: '2026-03-10', end: '2026-03-12' }}>
          {({ value, setValue, inputProps }) => (
            <DateRangePicker
              aria-label={inputProps['aria-label']}
              value={value}
              onValueChange={(next) => setValue(next ? { start: next.start.toString(), end: next.end.toString() } : null)}
            />
          )}
        </Row>
        <Row<string | null> field="select" defaultValue="Apple">
          {({ value, setValue, inputProps }) => <Select aria-label={inputProps['aria-label']} data={FRUIT} value={value} onValueChange={(next: unknown) => setValue(next as typeof value)} />}
        </Row>
        <Row<readonly string[]> field="multi" defaultValue={['Apple']}>
          {({ value, setValue, inputProps }) => <Select multiple aria-label={inputProps['aria-label']} data={FRUIT} value={value} onValueChange={(next: unknown) => setValue(next as typeof value)} />}
        </Row>
        <Row<string | null> field="combobox" defaultValue="Apple">
          {({ value, setValue, inputProps }) => <Combobox aria-label={inputProps['aria-label']} data={FRUIT} value={value} onValueChange={(next: unknown) => setValue(next as typeof value)} />}
        </Row>
        <button type="button" id="after">
          After
        </button>
      </main>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
