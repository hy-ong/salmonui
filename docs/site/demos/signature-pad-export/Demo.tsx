'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { SignaturePad, type SignaturePadApi } from '@salmonui/inputs/signature-pad';
import { Slider } from '@salmonui/inputs/slider';

// A signature line as an inline SVG data URL (image data, not theme); the
// pad stretches the image over its whole surface.
const RULED = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160" viewBox="0 0 480 160" preserveAspectRatio="none"><line x1="24" y1="124.5" x2="456" y2="124.5" stroke="#9db4d6" stroke-width="1"/></svg>')}`;

// A sample signature loaded through api.load().
const SAMPLE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="140"><path d="M20 100 C 50 20, 80 20, 90 90 S 130 140, 150 70 S 190 30, 210 90 S 260 120, 280 60 L 340 60" fill="none" stroke="#1d3557" stroke-width="3" stroke-linecap="round"/></svg>',
)}`;

const BACKGROUNDS = { white: '#ffffff', ivory: '#fffbea', none: 'transparent' } as const;
type Background = keyof typeof BACKGROUNDS;
const BACKGROUND_OPTIONS = [
  { value: 'white', label: 'white' },
  { value: 'ivory', label: 'ivory' },
  { value: 'none', label: 'transparent' },
];
const SLIDER_STYLE = { minInlineSize: 140 };

// Stroke widths and velocity, a background color and image, a controlled
// value with load / clear / isEmpty, PNG and JPEG data URLs and blobs with or
// without the background, and redraw on resize.
export default function SignaturePadExportDemo() {
  const pad = useRef<SignaturePadApi>(null);
  const [value, setValue] = useState<string | null>(null);
  const [minWidth, setMinWidth] = useState(0.5);
  const [maxWidth, setMaxWidth] = useState(2.5);
  const [velocity, setVelocity] = useState(0.7);
  const [background, setBackground] = useState<Background>('ivory');
  const [ruled, setRuled] = useState(true);
  const [withBackground, setWithBackground] = useState(true);
  const [wide, setWide] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState('Draw a signature or load the sample.');
  return (
    <>
      <div className="demo-toolbar">
        <Slider label={`Min stroke width ${minWidth}`} min={0.1} max={3} step={0.1} value={minWidth} onValueChange={setMinWidth} style={SLIDER_STYLE} />
        <Slider label={`Max stroke width ${maxWidth}`} min={1} max={8} step={0.5} value={maxWidth} onValueChange={setMaxWidth} style={SLIDER_STYLE} />
        <Slider label={`Velocity ${velocity}`} min={0} max={1} step={0.1} value={velocity} onValueChange={setVelocity} style={SLIDER_STYLE} />
        <label>
          Background
          <Select aria-label="Background" data={BACKGROUND_OPTIONS} value={background} onValueChange={(next) => next != null && setBackground(next as Background)} />
        </label>
        <Checkbox checked={ruled} onCheckedChange={(checked) => setRuled(checked)}>
          Signature line
        </Checkbox>
        <Checkbox checked={wide} onCheckedChange={(checked) => setWide(checked)}>
          Wide pad
        </Checkbox>
      </div>
      <div style={{ maxInlineSize: wide ? 480 : 300, transition: 'max-inline-size 0.2s' }}>
        <SignaturePad
          ref={pad}
          label="Signature"
          description="Uncheck Wide pad after drawing: the strokes are redrawn at the new size"
          height={160}
          minStrokeWidth={minWidth}
          maxStrokeWidth={maxWidth}
          velocity={velocity}
          backgroundColor={BACKGROUNDS[background]}
          backgroundImage={ruled ? RULED : undefined}
          value={value}
          onValueChange={(next, details) => {
            setValue(next);
            setStatus(`onValueChange: ${details.action}, value ${next === null ? 'null' : `${next.slice(0, 22)}… (${next.length} chars)`}`);
          }}
        />
      </div>
      <div className="demo-toolbar" style={{ marginBlockStart: 12 }}>
        <Button type="button" variant="outline" onClick={() => void pad.current?.load(SAMPLE).then(() => setStatus('api.load(sample) finished'))}>
          Load sample
        </Button>
        <Button type="button" variant="outline" onClick={() => pad.current?.clear()}>
          api.clear()
        </Button>
        <Button type="button" variant="outline" onClick={() => setStatus(`api.isEmpty(): ${String(pad.current?.isEmpty())}`)}>
          api.isEmpty()
        </Button>
        <Button type="button" variant="outline" onClick={() => setValue(null)}>
          Set value to null
        </Button>
        <Checkbox checked={withBackground} onCheckedChange={(checked) => setWithBackground(checked)}>
          Export with background
        </Checkbox>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const url = pad.current?.toDataURL('image/png', { background: withBackground }) ?? null;
            setPreview(url);
            setStatus(`toDataURL('image/png'): ${url?.length ?? 0} chars`);
          }}
        >
          PNG data URL
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const url = pad.current?.toDataURL('image/jpeg', { background: withBackground }) ?? null;
            setPreview(url);
            setStatus(`toDataURL('image/jpeg'): ${url?.length ?? 0} chars`);
          }}
        >
          JPEG data URL
        </Button>
        <Button type="button" variant="outline" onClick={() => void pad.current?.toBlob('image/png', { background: withBackground }).then((blob) => setStatus(`toBlob('image/png'): ${blob ? `${blob.type}, ${blob.size} bytes` : 'null'}`))}>
          PNG blob
        </Button>
      </div>
      <p className="demo-status" role="status">
        {status}
      </p>
      {preview ? (
        <img src={preview} alt="Exported signature" style={{ maxInlineSize: 240, border: '1px dashed var(--salmon-border-subtle)', background: 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 16px 16px' }} />
      ) : null}
    </>
  );
}
