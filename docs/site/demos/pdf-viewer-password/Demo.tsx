'use client';

import { useState } from 'react';
import { PdfViewer, type PdfViewerPasswordRequest } from '@salmonui/pdf-viewer';
import { Button } from '@salmonui/buttons/button';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';
import { TextField } from '@salmonui/inputs/text-field';
import '@salmonui/buttons/button/styles.css'; // the viewer stylesheet does not carry the Button rules
import '@salmonui/pdf-viewer/styles.css';
import { EventLog, useEventLog } from '../../components/demo-kit';

const PAGE_SIZES = [
  { width: 612, height: 792 },
  { width: 612, height: 792 },
  { width: 420, height: 595 },
];

type Mode = 'dialog' | 'prop' | 'custom';

export default function PdfViewerPasswordDemo() {
  const [log, push] = useEventLog();
  // Starts unlocked: the built-in dialog is modal, so opening it on page load would block the page.
  const [mode, setMode] = useState<Mode>('prop');
  const [request, setRequest] = useState<PdfViewerPasswordRequest | null>(null);
  const [attempt, setAttempt] = useState('');
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <RadioGroup
        label="How the password arrives"
        orientation="horizontal"
        value={mode}
        onValueChange={(value) => {
          setMode(value as Mode);
          setRequest(null);
        }}
      >
        {(
          [
            ['dialog', 'Built-in dialog'],
            ['prop', 'password prop'],
            ['custom', 'onPasswordRequired (own form)'],
          ] as const
        ).map(([value, label]) => (
          <Radio key={value} value={value}>
            {label}
          </Radio>
        ))}
      </RadioGroup>
      <p style={{ margin: 0, color: 'var(--salmon-text-secondary)' }}>
        The sample&apos;s password is <code>salmon</code>.
      </p>
      {mode === 'custom' && request ? (
        <form
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
          onSubmit={(event) => {
            event.preventDefault();
            request.submit(attempt);
            setRequest(null);
          }}
        >
          <TextField id="pdf-own-password" type="password" autoComplete="off" label={request.reason === 'incorrect' ? 'Wrong password, try again:' : 'Password:'} value={attempt} onValueChange={(value) => setAttempt(value)} />
          <Button type="submit">Open</Button>
          <Button
            variant="outline"
            onClick={() => {
              request.cancel();
              setRequest(null);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : null}
      <PdfViewer
        // Remount per mode so each one starts from a locked document.
        key={mode}
        src="/sample-protected.pdf"
        aria-label="Protected sample document"
        pageSizes={PAGE_SIZES}
        defaultZoom="page-width"
        password={mode === 'prop' ? 'salmon' : undefined}
        onPasswordRequired={
          mode === 'custom'
            ? (next) => {
                push(`onPasswordRequired: ${next.reason}`);
                setAttempt('');
                setRequest(next);
              }
            : undefined
        }
        onLoad={(info) => push(`onLoad: ${info.pageCount} pages (${mode})`)}
        onLoadError={(error) => push(`onLoadError: ${error.name}`)}
        style={{ height: 480 }}
      />
      <EventLog entries={log} />
    </div>
  );
}
