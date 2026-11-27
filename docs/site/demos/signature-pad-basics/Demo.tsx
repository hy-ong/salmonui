'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { SignaturePad, type SignaturePadApi } from '@salmonui/inputs/signature-pad';

// Undo / redo and SVG export through the SignaturePadApi ref; the last action is shown below the pad.
export default function SignaturePadBasicsDemo() {
  const pad = useRef<SignaturePadApi>(null);
  const [action, setAction] = useState('none');
  const [svgBytes, setSvgBytes] = useState<number | null>(null);
  return (
    <div style={{ display: 'grid', gap: 12, maxInlineSize: 420 }}>
      <SignaturePad ref={pad} label="Signature" description="Sign inside the box" backgroundColor="#ffffff" onValueChange={(_value, details) => setAction(details.action)} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="button" variant="outline" onClick={() => pad.current?.undo()}>
          Undo
        </Button>
        <Button type="button" variant="outline" onClick={() => pad.current?.redo()}>
          Redo
        </Button>
        <Button type="button" variant="outline" onClick={() => setSvgBytes(pad.current?.toSVG().length ?? null)}>
          Export SVG
        </Button>
      </div>
      <output>
        Last action: {action}
        {svgBytes === null ? '' : `, SVG ${svgBytes} bytes`}
      </output>
    </div>
  );
}
