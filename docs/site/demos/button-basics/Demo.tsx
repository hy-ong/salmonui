'use client';

import { useState } from 'react';
import { Button, type ButtonTone, type ButtonVariant } from '@salmonui/buttons/button';

const TONES: ButtonTone[] = ['neutral', 'primary', 'success', 'warning', 'danger', 'info'];
const VARIANTS: ButtonVariant[] = ['solid', 'outline', 'ghost', 'link'];

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M8 3v10M3 8h10" />
  </svg>
);

// Tones x variants, sizes, icons, an icon-only button and a link rendered through `render`.
export default function ButtonBasicsDemo() {
  const [clicks, setClicks] = useState(0);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {VARIANTS.map((variant) => (
        <div key={variant} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TONES.map((tone) => (
            <Button key={tone} tone={tone} variant={variant}>
              {tone}
            </Button>
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Button size="sm">Small</Button>
        <Button>Medium</Button>
        <Button size="lg">Large</Button>
        <Button tone="primary" iconStart={<PlusIcon />} onClick={() => setClicks((n) => n + 1)}>
          Add ({clicks})
        </Button>
        <Button iconOnly aria-label="Add" title="Add" iconStart={<PlusIcon />} onClick={() => setClicks((n) => n + 1)} />
        <Button disabled>Disabled</Button>
        <Button variant="link" render={(props) => <a {...props} href="#demo-button-basics-title" />}>
          A link styled as a button
        </Button>
      </div>
    </div>
  );
}
