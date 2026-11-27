'use client';

import { useState } from 'react';
import { formatMasked, MaskedField, type MaskTokens } from '@salmonui/inputs/masked-field';
import { TextField } from '@salmonui/inputs/text-field';

// Custom mask characters: `H` takes one hex digit, `#` stays a literal.
const HEX: MaskTokens = { H: /[0-9a-fA-F]/ };
// A string token lists the allowed characters: `D` is a direction letter.
const GRID: MaskTokens = { D: 'NSEW' };

// Custom tokens, the masked value from details and formatMasked, and the
// caret rules for typing, deleting over literals and pasting.
export default function MaskedFieldTokensDemo() {
  const [color, setColor] = useState('1e90ff');
  const [masked, setMasked] = useState('#1e90ff');
  const [last, setLast] = useState('none');
  const [raw, setRaw] = useState('4155550123');
  return (
    <div style={{ display: 'grid', gap: 16, maxInlineSize: 380 }}>
      <MaskedField
        label="Brand color"
        mask="\#HHHHHH"
        tokens={HEX}
        value={color}
        onValueChange={(value, details) => {
          setColor(value);
          setMasked(details.masked);
          setLast(`${details.reason} (${details.source}), complete: ${details.complete}`);
        }}
        startAdornment={<span aria-hidden="true" style={{ display: 'inline-block', inlineSize: 16, blockSize: 16, borderRadius: 'var(--salmon-radius-sm)', background: color.length === 6 ? `#${color}` : 'transparent', border: '1px solid currentColor' }} />}
        description="Token H accepts 0-9 and a-f"
      />
      <output>
        Raw {JSON.stringify(color)} · details.masked {JSON.stringify(masked)} · last change: {last}
      </output>
      <MaskedField label="Grid reference" mask=">D00-D00" tokens={GRID} description="Token D accepts N, S, E or W (typed letters are upper-cased)" />
      <MaskedField label="Phone" mask="+1 (000) 000-0000" description="Paste 4155550123 or (415) 555-0123; Backspace clears the previous digit without shifting the rest" />
      <TextField label="Raw value for formatMasked()" value={raw} onValueChange={(value) => setRaw(value)} />
      <output>
        formatMasked(&apos;+1 (000) 000-0000&apos;, raw) = <span style={{ whiteSpace: 'nowrap' }}>{JSON.stringify(formatMasked('+1 (000) 000-0000', raw))}</span>
      </output>
    </div>
  );
}
