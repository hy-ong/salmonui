'use client';

import { useCallback, useState } from 'react';
import { Select } from '@salmonui/dropdowns/select';
import { TextField } from '@salmonui/inputs/text-field';
import { Barcode, QRCode, type BarcodeDataMatrixEncoding, type BarcodeInvalidEvent } from '@salmonui/charts/barcode';

const cell = { display: 'grid', gap: 4, justifyItems: 'start' } as const;

type LinearType = 'code11' | 'codabar' | 'code32' | 'code93' | 'code93Extended';
const LINEAR: readonly { type: LinearType; name: string; sample: string }[] = [
  { type: 'code11', name: 'Code 11', sample: '123-45' },
  { type: 'codabar', name: 'Codabar', sample: 'A40156B' },
  { type: 'code32', name: 'Code 32 (Italian pharmacode)', sample: '01234567' },
  { type: 'code93', name: 'Code 93', sample: 'SALMON-93' },
  { type: 'code93Extended', name: 'Code 93 Extended', sample: 'Salmon 93!' },
];
const SIZES = ['auto', 'auto-rectangular', '16x16', '20x20', '24x24', '8x32', '12x36', '16x48'];
const ENCODINGS: readonly BarcodeDataMatrixEncoding[] = ['auto', 'ascii', 'asciiNumeric', 'base256'];
const PRESETS = {
  gs1: { name: 'GS1: GTIN, expiry and lot', value: '(01)09501101530003(17)261231(10)LOT-42' },
  digits: { name: 'Serial number (digits)', value: '4006381333931' },
  text: { name: 'Text with symbols', value: 'Lot #42 · exp. 2026-12-31' },
} as const;
type Preset = keyof typeof PRESETS;

/** Type a value into any symbology: invalid input reports its reason instead of throwing. */
export default function BarcodeEncoderDemo() {
  const [type, setType] = useState<LinearType>('code93');
  const [value, setValue] = useState('SALMON-93');
  const [invalid, setInvalid] = useState<{ key: string; reason: string } | null>(null);
  const [encoding, setEncoding] = useState<BarcodeDataMatrixEncoding>('auto');
  const [size, setSize] = useState('auto');
  const [preset, setPreset] = useState<Preset>('gs1');
  const [dmInvalid, setDmInvalid] = useState<{ key: string; reason: string } | null>(null);
  const key = `${type}:${value}`;
  const dmKey = `${preset}:${encoding}:${size}`;
  // Stable handlers: onInvalid runs after commit whenever the reason changes.
  const onInvalid = useCallback((e: BarcodeInvalidEvent) => setInvalid({ key, reason: e.reason }), [key]);
  const onDmInvalid = useCallback((e: BarcodeInvalidEvent) => setDmInvalid({ key: dmKey, reason: e.reason }), [dmKey]);
  const dmValue = PRESETS[preset].value;
  return (
    <div className="demo-stack">
      <p>
        <strong>Linear symbologies</strong>
      </p>
      <div className="demo-toolbar" role="group" aria-label="Linear barcode">
        <label>
          Symbology
          <Select
            aria-label="Symbology"
            data={LINEAR.map((l) => ({ value: l.type, label: l.name }))}
            value={type}
            onValueChange={(selected) => {
              const next = LINEAR.find((l) => l.type === selected) ?? LINEAR[0]!;
              setType(next.type);
              setValue(next.sample);
            }}
          />
        </label>
        <label>
          Value
          <TextField aria-label="Value" value={value} onValueChange={setValue} />
        </label>
      </div>
      <Barcode type={type} value={value} onInvalid={onInvalid} invalidLabel="Cannot encode: {reason}" />
      <p className="demo-status" aria-live="polite">
        {invalid?.key === key ? (
          <>
            onInvalid: <code>{invalid.reason}</code>
          </>
        ) : (
          'Valid value. Try letters in Code 11 or Code 32, or a lowercase letter in Code 93.'
        )}
      </p>

      <p>
        <strong>Data Matrix and GS1</strong>
      </p>
      <div className="demo-toolbar" role="group" aria-label="Data Matrix options">
        <label>
          Content
          <Select aria-label="Content" data={(Object.keys(PRESETS) as Preset[]).map((p) => ({ value: p, label: PRESETS[p].name }))} value={preset} onValueChange={(next) => next != null && setPreset(next as Preset)} />
        </label>
        <label>
          Encodation
          <Select aria-label="Encodation" data={ENCODINGS.map((enc) => ({ value: enc, label: enc }))} value={encoding} onValueChange={(next) => next != null && setEncoding(next as BarcodeDataMatrixEncoding)} />
        </label>
        <label>
          Symbol size
          <Select aria-label="Symbol size" data={SIZES.map((s) => ({ value: s, label: s }))} value={size} onValueChange={(next) => next != null && setSize(String(next))} />
        </label>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div style={cell}>
          <span>Data Matrix ECC 200</span>
          <Barcode type="dataMatrix" value={dmValue} gs1={preset === 'gs1'} encoding={encoding} size={size} moduleSize={4} onInvalid={onDmInvalid} />
        </div>
        <div style={cell}>
          <span>QR Code</span>
          <QRCode value={dmValue} gs1={preset === 'gs1'} moduleSize={3} />
        </div>
      </div>
      <p className="demo-status" aria-live="polite">
        Encoded: <code>{dmValue}</code>
        {dmInvalid?.key === dmKey ? (
          <>
            {' '}
            · Data Matrix onInvalid: <code>{dmInvalid.reason}</code>
          </>
        ) : null}
      </p>
    </div>
  );
}
