'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Carousel, CarouselSlide } from '@salmonui/navigation/carousel';
import { Checkbox } from '@salmonui/inputs/checkbox';

const steps = [
  { id: 'connect', title: 'Connect your store', text: 'Link the shop you sell from.' },
  { id: 'import', title: 'Import products', text: 'Bring in your catalog in one pass.' },
  { id: 'price', title: 'Set prices', text: 'Pick a currency and rounding rules.' },
  { id: 'launch', title: 'Launch', text: 'Publish and share the link.' },
];

const NAV = { position: 'absolute', insetBlockEnd: 12, zIndex: 1 } as const;

export default function CarouselTemplatesDemo() {
  const [loop, setLoop] = useState(false);
  const [last, setLast] = useState('nothing yet');
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox checked={loop} onCheckedChange={(checked) => setLoop(checked)}>
          Loop
        </Checkbox>
      </div>
      <Carousel
        aria-label="Getting started"
        loop={loop}
        onIndexChange={(next, event) => setLast(`step ${next + 1} (${event.source})`)}
        style={{ maxInlineSize: 640 }}
        // Custom buttons render where the built-in ones do (inside the slide
        // viewport), so the application places them: here in the slide's
        // bottom corners, over the slide content.
        renderPreviousButton={(ctx) => (
          <Button variant="outline" aria-label={ctx.label} disabled={ctx.disabled} onClick={ctx.go} style={{ ...NAV, insetInlineStart: 12 }}>
            ‹ Back
          </Button>
        )}
        renderNextButton={(ctx) => (
          <Button variant="outline" aria-label={ctx.label} disabled={ctx.disabled} onClick={ctx.go} style={{ ...NAV, insetInlineEnd: 12 }}>
            Next ›
          </Button>
        )}
        renderIndicator={(ctx) => (
          <Button
            variant={ctx.selected ? 'solid' : 'outline'}
            tone={ctx.selected ? 'primary' : 'neutral'}
            aria-label={ctx.label}
            aria-current={ctx.selected || undefined}
            onClick={ctx.go}
            style={{ minInlineSize: 24, marginInline: 2 }}
          >
            {ctx.index + 1}
          </Button>
        )}
      >
        {steps.map((step) => (
          <CarouselSlide key={step.id} label={step.title} style={{ display: 'grid', placeContent: 'center', minBlockSize: 160, padding: 24, borderRadius: 'var(--salmon-radius-lg)', background: 'var(--salmon-surface-sunken)' }}>
            <h3 style={{ margin: 0 }}>{step.title}</h3>
            <p style={{ margin: '8px 0 0' }}>{step.text}</p>
          </CarouselSlide>
        ))}
      </Carousel>
      <p>
        Last change: <output>{last}</output>
      </p>
    </div>
  );
}
