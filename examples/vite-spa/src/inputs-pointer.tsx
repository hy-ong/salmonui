// Slider and SignaturePad sections of examples/vite-spa/inputs.html
// (?only=slider,signature; tests/browser/inputs-pointer.spec.ts, IN5).
//
// window.__sliderRenders counts React commits of the uncontrolled slider's
// subtree (Profiler, development builds); window.__signature is the
// SignaturePadApi of #sig-basic.
import { Profiler, useRef, useState } from 'react';
import { Form } from '@salmonui/inputs/form';
import { SignaturePad, type SignaturePadApi } from '@salmonui/inputs/signature-pad';
import { Slider } from '@salmonui/inputs/slider';
import { log, Section, submitTo } from './inputs-shared.tsx';
import '@salmonui/inputs/form/styles.css';
import '@salmonui/inputs/signature-pad/styles.css';
import '@salmonui/inputs/slider/styles.css';

declare global {
  interface Window {
    __sliderRenders?: number;
    __signature?: SignaturePadApi | null;
  }
}

window.__sliderRenders = 0;

/** A 4 by 4 red PNG for the backgroundImage pad (same origin, so exports stay untainted). */
const paper = (() => {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 4;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 4, 4);
  return c.toDataURL();
})();

function ControlledSlider() {
  const [value, setValue] = useState(30);
  return (
    <>
      <Slider id="sld-controlled" label="Controlled" value={value} onValueChange={(v) => setValue(Math.min(v, 80))} fill />
      <output id="sld-controlled-out">{value}</output>
    </>
  );
}

function SignatureControls() {
  const api = useRef<SignaturePadApi | null>(null);
  return (
    <>
      <SignaturePad
        id="sig-basic"
        name="signature"
        label="Signature"
        description="Draw or type your name"
        backgroundColor="#ffffff"
        ref={(a) => {
          api.current = a;
          window.__signature = a;
        }}
        onValueChange={(v, d) => log({ kind: 'signature', empty: v === null, prefix: v?.slice(0, 22) ?? null, action: d.action, source: d.source })}
      />
    </>
  );
}

function ControlledSignature() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <>
      <SignaturePad id="sig-controlled" label="Controlled signature" value={value} onValueChange={(v) => setValue(v)} toolbar={false} height={80} />
      <output id="sig-controlled-out">{value === null ? 'empty' : 'signed'}</output>
      <button type="button" id="sig-controlled-clear" onClick={() => setValue(null)}>
        Clear controlled
      </button>
    </>
  );
}

export function PointerSection() {
  return (
    <>
      <Section id="slider" title="Slider">
        <Form id="sld-form" onSubmit={submitTo('sld-form')}>
          <Profiler id="sld-basic" onRender={() => void (window.__sliderRenders! += 1)}>
            <Slider
              id="sld-basic"
              name="volume"
              label="Volume"
              description="0 to 100"
              defaultValue={40}
              fill
              valueLabel={{ show: 'always' }}
              onValueChange={(v, d) => log({ kind: 'slider', value: v, source: d.source, reason: d.reason })}
              onValueCommit={(v, d) => log({ kind: 'slider-commit', value: v, source: d.source, reason: d.reason })}
            />
          </Profiler>
          <Slider
            id="sld-range"
            name="price"
            label="Price"
            defaultValue={[20, 60]}
            step={5}
            minStepsBetweenThumbs={2}
            ticks={{ placement: 'after', majorStep: 20, minorStep: 5, showMinor: true }}
            formatOptions={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
            onValueChange={(v, d) => log({ kind: 'range', value: v, thumb: d.thumb, source: d.source })}
            onValueCommit={(v) => log({ kind: 'range-commit', value: v })}
          />
          <Slider id="sld-values" name="size" label="Size" values={['XS', 'S', 'M', 'L', 'XL']} defaultValue="M" ticks={{ placement: 'before' }} onValueChange={(v) => log({ kind: 'values', value: v })} />
          <Slider id="sld-limits" label="Limits" defaultValue={[30, 70]} limits={{ minStart: 10, maxStart: 40, minEnd: 60, maxEnd: 90, endFixed: false }} />
          <Slider id="sld-fixed" label="Fixed start" defaultValue={[30, 70]} limits={{ startFixed: true }} />
          <Slider id="sld-vertical" label="Vertical" orientation="vertical" defaultValue={25} fill ticks={{ placement: 'both', majorStep: 25 }} renderTick={({ label, major }) => (major ? `${label}%` : null)} />
          <Slider id="sld-label" label="Formatted" defaultValue={0.5} min={0} max={1} step={0.1} valueLabel={{ show: 'focus', placement: 'after', format: (v) => `${Math.round(Number(v) * 100)} percent` }} />
          <Slider id="sld-disabled" label="Disabled" disabled defaultValue={10} />
          <Slider id="sld-readonly" label="Read only" readOnly defaultValue={20} />
          <ControlledSlider />
          <button type="submit" id="sld-submit">
            Submit sliders
          </button>
          <button type="reset" id="sld-reset">
            Reset sliders
          </button>
        </Form>
      </Section>
      <Section id="signature" title="SignaturePad">
        <Form id="sig-form" onSubmit={submitTo('sig-form')}>
          <SignatureControls />
          <button type="submit" id="sig-submit">
            Submit signature
          </button>
          <button type="reset" id="sig-reset">
            Reset signature
          </button>
        </Form>
        <ControlledSignature />
        <SignaturePad id="sig-styled" label="Styled" strokeColor="#1d4ed8" minStrokeWidth={1} maxStrokeWidth={4} velocity={0.5} backgroundColor="#fef9c3" height="120px" />
        <SignaturePad id="sig-image" label="Paper" backgroundImage={paper} height={60} />
        <SignaturePad id="sig-readonly" label="Read only" readOnly height={60} />
      </Section>
    </>
  );
}
