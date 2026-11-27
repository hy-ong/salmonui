'use client';

import { lazy, Suspense, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@salmonui/buttons/button';
import { MaskedField } from '@salmonui/inputs/masked-field';
import { NumberField } from '@salmonui/inputs/number-field';
import { SignaturePad } from '@salmonui/inputs/signature-pad';
import { Slider } from '@salmonui/inputs/slider';
import { TextField } from '@salmonui/inputs/text-field';

const QueryBuilderPanel = lazy(() => import('./QueryBuilderPanel'));

/**
 * Counts the commits of the component that renders it. The count is written
 * to the DOM from a layout effect, so counting never causes a render.
 */
function RenderCount({ label }: { label: string }) {
  const count = useRef(0);
  const out = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    count.current += 1;
    if (out.current) out.current.textContent = String(count.current);
  });
  return (
    <span className="demo-badge" aria-label={`${label} renders`}>
      {label} renders: <span ref={out}>0</span>
    </span>
  );
}

/** One field and the render count of the component around it. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {children}
      <RenderCount label={label} />
    </div>
  );
}

/** A controlled field: its owner re-renders per keystroke, nothing else does. */
function ControlledCell() {
  const [value, setValue] = useState('');
  const typedAt = useRef(0);
  const out = useRef<HTMLOutputElement>(null);
  useLayoutEffect(() => {
    if (typedAt.current && out.current) out.current.textContent = `last keystroke: ${(performance.now() - typedAt.current).toFixed(2)} ms from the input event to the commit`;
  });
  return (
    <Cell label="Controlled owner">
      <TextField
        label="Controlled text"
        value={value}
        onValueChange={setValue}
        onKeyDown={() => {
          typedAt.current = performance.now();
        }}
      />
      <output ref={out}>last keystroke: (type to measure)</output>
    </Cell>
  );
}

// typing re-renders only the edited field, dragging writes CSS
// or canvas without React renders, and a subpath loads only when used.
export default function InputsPerformanceDemo() {
  const sliderRenders = useRef(0);
  const moves = useRef(0);
  const strokes = useRef(0);
  const dragOut = useRef<HTMLOutputElement>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const report = () => {
    if (dragOut.current) dragOut.current.textContent = `pointer moves: ${moves.current}, Slider renders: ${sliderRenders.current}, SignaturePad value changes: ${strokes.current}`;
  };
  return (
    <div style={{ display: 'grid', gap: 20, maxInlineSize: 460 }}>
      <RenderCount label="Demo (parent)" />
      <Cell label="Text owner">
        <TextField label="Uncontrolled text" />
      </Cell>
      <Cell label="Number owner">
        <NumberField label="Uncontrolled number" defaultValue={10} />
      </Cell>
      <Cell label="Masked owner">
        <MaskedField label="Uncontrolled card" mask="0000 0000 0000 0000" />
      </Cell>
      <ControlledCell />
      <div
        style={{ display: 'grid', gap: 16 }}
        onPointerMove={(event) => {
          if (event.buttons === 0) return;
          moves.current += 1;
          report();
        }}
        onPointerUp={report}
      >
        <Slider
          label="Uncontrolled slider"
          defaultValue={50}
          fill
          valueLabel={{ show: 'always' }}
          ticks={{ placement: 'after', majorStep: 25 }}
          renderTick={(tick) => {
            // Instrumentation only: renderTick runs during the Slider's render, once per tick.
            if (tick.value === 0) sliderRenders.current += 1;
            return tick.label;
          }}
        />
        <SignaturePad
          label="Uncontrolled signature"
          style={{ maxInlineSize: 'none' }}
          height={120}
          backgroundColor="#ffffff"
          onValueChange={() => {
            strokes.current += 1;
            report();
          }}
        />
        <output ref={dragOut}>pointer moves: 0, Slider renders: 0, SignaturePad value changes: 0</output>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {showBuilder ? (
          <Suspense fallback={<p className="demo-status">Loading @salmonui/query-builder…</p>}>
            <QueryBuilderPanel />
          </Suspense>
        ) : (
          <Button type="button" variant="outline" onClick={() => setShowBuilder(true)} style={{ justifySelf: 'start' }}>
            Load the QueryBuilder subpath
          </Button>
        )}
      </div>
    </div>
  );
}
