// Type contract of @salmonui/react/slider and @salmonui/react/signature-pad.
// Compiles against dist/*.d.ts.
import { createRef } from 'react';
import { SignaturePad, type SignatureChangeDetails, type SignaturePadApi } from '@salmonui/inputs/signature-pad';
import { Slider, type SliderChangeDetails, type SliderScalar, type SliderTickContext } from '@salmonui/inputs/slider';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

// A single value: callbacks get a widened number (not the literal default).
export const single = (
  <Slider
    label="S"
    defaultValue={50}
    onValueChange={(v, d: SliderChangeDetails) => {
      expectType<Equal<typeof v, number>>(true);
      return [d.source, d.reason === 'drag' || d.reason === 'keyboard' || d.reason === 'input' || d.reason === 'reset', d.thumb];
    }}
    onValueCommit={(v: number) => v}
    ref={(el: HTMLDivElement | null) => void el}
  />
);
// A range: a readonly tuple.
export const range = (
  <Slider
    defaultValue={[10, 20]}
    minStepsBetweenThumbs={1}
    onValueChange={(v) => {
      expectType<Equal<typeof v, readonly [number, number]>>(true);
    }}
  />
);
// values entries are strings or numbers.
export const values = <Slider values={['S', 'M']} defaultValue="M" onValueChange={(v: string) => v} />;
export const ticks = <Slider ticks={{ placement: 'both', majorStep: 10, minorStep: 2, showMinor: true, formatOptions: { style: 'percent' } }} renderTick={(c: SliderTickContext) => (c.major ? c.label : null)} valueLabel={{ show: 'hover', placement: 'after', format: (v: SliderScalar) => String(v) }} limits={{ minStart: 1, endFixed: true }} orientation="vertical" />;
// @ts-expect-error placement is before, after, both or none
export const badTicks = <Slider ticks={{ placement: 'top' }} />;
// @ts-expect-error valueLabel.show is focus, hover, always or never
export const badLabel = <Slider valueLabel={{ show: 'drag' }} />;

const api = createRef<SignaturePadApi>();
export const pad = (
  <SignaturePad
    ref={api}
    name="signature"
    strokeColor="#123"
    minStrokeWidth={1}
    maxStrokeWidth={3}
    velocity={0.5}
    backgroundColor="#fff"
    backgroundImage="/paper.png"
    onValueChange={(v: string | null, d: SignatureChangeDetails) => [v, d.action === 'stroke' || d.action === 'undo' || d.action === 'redo' || d.action === 'clear' || d.action === 'load' || d.action === 'text' || d.action === 'reset', d.source]}
  />
);
export const apiUse = (a: SignaturePadApi): [string, Promise<Blob | null>, string, boolean, Promise<void>] => [a.toDataURL('image/jpeg', { background: false }), a.toBlob(), a.toSVG(), a.canUndo() && a.isEmpty(), a.load('data:,')];
// @ts-expect-error only PNG and JPEG
export const badType = (a: SignaturePadApi) => a.toDataURL('image/webp');
