'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';
import { TextField } from '@salmonui/inputs/text-field';
import { QRCode, type QRCodeApi, type QRErrorCorrection } from '@salmonui/charts/barcode';

// A live QR code with an error correction switch, a logo variant and export.
export default function QRCodeBasicDemo() {
  const [value, setValue] = useState('https://salmonui.dev/docs/data-visualization/qr-code');
  const [level, setLevel] = useState<QRErrorCorrection>('m');
  const ref = useRef<QRCodeApi>(null);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <TextField label="Value" value={value} onValueChange={setValue} style={{ maxInlineSize: 480 }} />
      <RadioGroup label="Error correction" name="qr-level" orientation="horizontal" value={level} onValueChange={(next) => setLevel(next as QRErrorCorrection)}>
        {(['l', 'm', 'q', 'h'] as const).map((l) => (
          <Radio key={l} value={l}>
            {l.toUpperCase()}
          </Radio>
        ))}
      </RadioGroup>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <QRCode ref={ref} value={value || ' '} errorCorrection={level} moduleSize={4} />
        <QRCode value={value || ' '} logo={<span style={{ background: '#fff', font: '700 14px system-ui', padding: 2 }}>S</span>} moduleSize={4} />
        <QRCode value="HELLO WORLD" version={2} errorCorrection="q" moduleSize={4} text />
      </div>
      <div>
        <Button variant="outline" type="button" onClick={() => void ref.current?.export({ format: 'png', fileName: 'qr-code.png' })}>
          Download PNG
        </Button>
      </div>
    </div>
  );
}
